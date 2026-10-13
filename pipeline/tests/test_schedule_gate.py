"""Exercise the GitHub Actions scheduling gate through its HTTP boundary."""

import json
import os
import subprocess
import textwrap
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/daily_pipeline.yml"


def _check_script() -> str:
    lines = WORKFLOW.read_text().splitlines()
    step = next(i for i, line in enumerate(lines) if line.strip() == "id: count")
    start = next(i for i in range(step + 1, len(lines)) if lines[i].strip() == "run: |") + 1
    script_lines = []
    for line in lines[start:]:
        if line and not line.startswith("          "):
            break
        script_lines.append(line)
    return textwrap.dedent("\n".join(script_lines))


@contextmanager
def _postgrest(rows: list[dict], status: int = 200):
    requests: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            requests.append({"path": parsed.path, "query": query, "apikey": self.headers.get("apikey")})
            result = [row for row in rows if row["active"] is True]
            payload = json.dumps(
                [
                    {field: row[field] for field in ("digest_hour", "timezone_offset")}
                    for row in result
                ]
            ).encode()
            self.send_response(status if parsed.path == "/rest/v1/rpc/get_active_digest_schedules" else 404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def _run_check(tmp_path: Path, url: str, event: str = "schedule"):
    date_stub = tmp_path / "date"
    date_stub.write_text("#!/bin/sh\necho 7\n")
    date_stub.chmod(0o755)
    output_file = tmp_path / "github_output"
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env['PATH']}",
            "SUPABASE_URL": url,
            "SUPABASE_ANON_KEY": "test-anon-key",
            "EVENT_NAME": event,
            "GITHUB_OUTPUT": str(output_file),
        }
    )
    result = subprocess.run(
        ["bash", "-e", "-o", "pipefail", "-c", _check_script()],
        env=env,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    outputs = dict(line.split("=", 1) for line in output_file.read_text().splitlines())
    return result, outputs


def _row(*, active: bool = True, notion_connected: bool = False, hour: int = 7) -> dict:
    return {
        "active": active,
        "notion_connected": notion_connected,
        "digest_hour": hour,
        "timezone_offset": 0,
    }


def test_due_web_only_user_starts_pipeline(tmp_path):
    with _postgrest([_row()]) as (url, requests):
        result, outputs = _run_check(tmp_path, url)

    assert result.returncode == 0, result.stderr
    assert outputs["users_due"] == "1"
    assert requests[0]["path"] == "/rest/v1/rpc/get_active_digest_schedules"
    assert requests[0]["query"] == {}
    assert requests[0]["apikey"] == "test-anon-key"


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        (_row(notion_connected=True), "1"),
        (_row(active=False), "0"),
        (_row(hour=8), "0"),
    ],
)
def test_due_gate_respects_activity_and_hour(tmp_path, row, expected):
    with _postgrest([row]) as (url, _requests):
        result, outputs = _run_check(tmp_path, url)

    assert result.returncode == 0, result.stderr
    assert outputs["users_due"] == expected


def test_manual_dispatch_bypasses_query(tmp_path):
    with _postgrest([_row()]) as (url, requests):
        result, outputs = _run_check(tmp_path, url, event="workflow_dispatch")

    assert result.returncode == 0, result.stderr
    assert outputs["users_due"] == "forced"
    assert requests == []


def test_http_failure_falls_back_to_pipeline(tmp_path):
    with _postgrest([], status=500) as (url, _requests):
        result, outputs = _run_check(tmp_path, url)

    assert result.returncode == 0, result.stderr
    assert outputs["users_due"] == "fallback"
