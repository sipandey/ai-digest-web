"""Main orchestrator. Usage: python pipeline/pipeline.py"""
import logging
import os
import sys
from datetime import date, datetime, timezone

from dotenv import load_dotenv

load_dotenv()

from config import supabase, get_active_users  # noqa: E402 — must follow load_dotenv
from fetcher import fetch_papers
from ranker import rank_papers
from notion_client import deliver_to_notion


# ── logging setup ──────────────────────────────────────────────────────────────

def _configure_logging() -> None:
    """Use structured JSON logging inside GitHub Actions, plain text elsewhere.

    GitHub Actions sets GITHUB_ACTIONS=true automatically for every workflow
    run.  The JSON format lets you grep / jq the raw step logs and could feed
    a log-shipping integration (Datadog, CloudWatch, etc.) without changes.

    Locally the output stays human-readable.
    """
    in_gha = os.environ.get("GITHUB_ACTIONS") == "true"

    if in_gha:
        from pythonjsonlogger.jsonlogger import JsonFormatter  # type: ignore[import-untyped]

        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            JsonFormatter(
                fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%SZ",
                rename_fields={"levelname": "level", "asctime": "ts", "name": "logger"},
            )
        )
        logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    else:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s  %(levelname)-8s  %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            stream=sys.stdout,
            force=True,
        )


_configure_logging()
log = logging.getLogger(__name__)


# ── helpers ────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_user_due(user_config: dict, utc_hour: int) -> bool:
    """Return True when this user's digest is due at *utc_hour*.

    A user's delivery time in UTC is:
        target_utc_hour = (digest_hour - timezone_offset) % 24

    Examples:
        digest_hour=8,  timezone_offset=-5  →  target 13:00 UTC
        digest_hour=7,  timezone_offset=+1  →  target  6:00 UTC
        digest_hour=22, timezone_offset=+9  →  target 13:00 UTC

    timezone_offset is a whole-hour integer (matching the options exposed
    in the Settings UI).  digest_hour is 0–23 local time.
    """
    raw_hour   = user_config.get("digest_hour")
    raw_offset = user_config.get("timezone_offset")
    digest_hour = int(raw_hour   if raw_hour   is not None else 7)
    tz_offset   = int(raw_offset if raw_offset is not None else 0)
    target_utc_hour = (digest_hour - tz_offset) % 24
    return utc_hour == target_utc_hour


def _upsert_run(user_id: str, run_date: str, **fields) -> str:
    """Create or update a pipeline_runs row; always return the run id."""
    existing = (
        supabase.table("pipeline_runs")
        .select("id")
        .eq("user_id", user_id)
        .eq("run_date", run_date)
        .execute()
    )
    if existing.data:
        run_id: str = existing.data[0]["id"]
        supabase.table("pipeline_runs").update(fields).eq("id", run_id).execute()
        return run_id

    result = supabase.table("pipeline_runs").insert(
        {"user_id": user_id, "run_date": run_date, **fields}
    ).execute()
    return result.data[0]["id"]


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    run_date = os.environ.get("PIPELINE_RUN_DATE", date.today().isoformat())
    target_user_id = os.environ.get("PIPELINE_USER_ID")
    use_batch = os.environ.get("PIPELINE_USE_BATCH", "").lower() == "true"
    skip_time_filter = os.environ.get("PIPELINE_SKIP_TIME_FILTER", "").lower() == "true"

    utc_now = datetime.now(timezone.utc)
    utc_hour = utc_now.hour

    log.info(
        "Pipeline starting",
        extra={
            "run_date": run_date,
            "utc_hour": utc_hour,
            "mode": "batch" if use_batch else "direct",
            "skip_time_filter": skip_time_filter,
        },
    )

    # ── Shared fetch (runs once, cached for the day) ──────────────────────────
    papers = fetch_papers(run_date)
    log.info(
        "Papers fetched",
        extra={"run_date": run_date, "papers_fetched": len(papers)},
    )

    # ── Load active users then apply per-user delivery-time filter ────────────
    all_users = get_active_users(target_user_id)

    if skip_time_filter:
        users = all_users
        log.info(
            "Time filter skipped (manual dispatch) — processing all users",
            extra={"run_date": run_date, "utc_hour": utc_hour, "user_count": len(users)},
        )
    else:
        users = [u for u in all_users if _is_user_due(u, utc_hour)]
        skipped = len(all_users) - len(users)
        log.info(
            "Time filter applied",
            extra={
                "run_date": run_date,
                "utc_hour": utc_hour,
                "users_due": len(users),
                "users_skipped": skipped,
            },
        )

    if not users:
        log.info(
            "No users due at this hour — pipeline exiting.",
            extra={"run_date": run_date, "utc_hour": utc_hour},
        )
        return

    succeeded = 0
    failed = 0

    for user_config in users:
        user_id: str = user_config["user_id"]
        email: str = user_config.get("users", {}).get("email", user_id)

        # Mark run as started
        run_id = _upsert_run(
            user_id,
            run_date,
            status="running",
            started_at=_now(),
            papers_fetched=len(papers),
        )
        log.info(
            "User run started",
            extra={"run_date": run_date, "run_id": run_id, "user_id": user_id, "email": email},
        )

        try:
            # Per-user scoring
            scored = rank_papers(papers, user_config, use_batch=use_batch)
            log.info(
                "Scoring complete",
                extra={
                    "run_date": run_date,
                    "run_id": run_id,
                    "user_id": user_id,
                    "papers_fetched": len(papers),
                    "papers_passed": len(scored),
                },
            )

            if not scored:
                supabase.table("pipeline_runs").update(
                    {
                        "status": "empty",
                        "papers_passed": 0,
                        "completed_at": _now(),
                    }
                ).eq("id", run_id).execute()
                log.info(
                    "User run empty — no papers passed threshold",
                    extra={"run_date": run_date, "run_id": run_id, "user_id": user_id},
                )
                succeeded += 1
                continue

            # Per-user Notion delivery
            notion_url = deliver_to_notion(scored, user_config, run_date)
            top_score = float(scored[0].get("score", 0)) if scored else None

            supabase.table("pipeline_runs").update(
                {
                    "status": "complete",
                    "papers_passed": len(scored),
                    "top_score": top_score,
                    "notion_page_url": notion_url,
                    "completed_at": _now(),
                }
            ).eq("id", run_id).execute()

            log.info(
                "User run complete",
                extra={
                    "run_date": run_date,
                    "run_id": run_id,
                    "user_id": user_id,
                    "papers_passed": len(scored),
                    "top_score": top_score,
                    "notion_url": notion_url,
                },
            )
            succeeded += 1

        except Exception as exc:
            log.error(
                "User run failed",
                extra={"run_date": run_date, "run_id": run_id, "user_id": user_id, "error": str(exc)},
                exc_info=True,
            )
            supabase.table("pipeline_runs").update(
                {
                    "status": "failed",
                    "error_message": str(exc)[:500],
                    "completed_at": _now(),
                }
            ).eq("id", run_id).execute()
            failed += 1
            # Continue — one user's failure must not stop others

    log.info(
        "Pipeline complete",
        extra={
            "run_date": run_date,
            "users_total": len(users),
            "users_succeeded": succeeded,
            "users_failed": failed,
        },
    )


if __name__ == "__main__":
    main()
