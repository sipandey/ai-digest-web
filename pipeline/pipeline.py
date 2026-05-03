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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def main() -> None:
    run_date = os.environ.get("PIPELINE_RUN_DATE", date.today().isoformat())
    target_user_id = os.environ.get("PIPELINE_USER_ID")
    log.info("=== Pipeline starting for %s ===", run_date)

    # ── Shared fetch (runs once, cached for the day) ──────────────────────────
    papers = fetch_papers(run_date)
    log.info("Fetched %d papers for %s", len(papers), run_date)

    # ── Load active users ─────────────────────────────────────────────────────
    users = get_active_users(target_user_id)
    if target_user_id:
        log.info("Single-user mode enabled for user_id=%s", target_user_id)
    log.info("Processing %d active user(s)", len(users))

    if not users:
        log.info("No active users — pipeline exiting.")
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
        log.info("[%s] Run %s started", email, run_id)

        try:
            # Per-user scoring
            scored = rank_papers(papers, user_config)
            log.info("[%s] %d / %d papers passed threshold", email, len(scored), len(papers))

            if not scored:
                supabase.table("pipeline_runs").update(
                    {
                        "status": "empty",
                        "papers_passed": 0,
                        "completed_at": _now(),
                    }
                ).eq("id", run_id).execute()
                log.info("[%s] No papers passed — marked empty", email)
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
                "[%s] Complete — %d papers delivered, top score %.1f → %s",
                email,
                len(scored),
                top_score or 0,
                notion_url,
            )
            succeeded += 1

        except Exception as exc:
            log.error("[%s] Failed: %s", email, exc, exc_info=True)
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
        "=== Pipeline complete: %d user(s) processed, %d succeeded, %d failed ===",
        len(users),
        succeeded,
        failed,
    )


if __name__ == "__main__":
    main()
