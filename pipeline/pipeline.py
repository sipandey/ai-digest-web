"""Main orchestrator. Usage: python pipeline/pipeline.py"""
import logging
import math
import os
import sys
from datetime import date, datetime, timezone
from typing import Optional

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


def _round_half_away(x: float) -> int:
    """Round to the nearest integer, with 0.5 rounding away from zero.

    This matches jq's built-in round() function. Python's built-in round() uses
    banker's rounding (round-half-to-even), which differs at .5 boundaries
    (e.g. round(2.5) → 2 in Python but → 3 in jq). Using the same rule in both
    places ensures the gate job (jq) and the Python pipeline agree on which UTC
    hour each user is due.
    """
    if x >= 0:
        return math.floor(x + 0.5)
    return math.ceil(x - 0.5)


def _target_utc_hour(user_config: dict) -> int:
    """Compute the UTC hour at which this user's digest should be delivered.

    A user's delivery time in UTC is computed by rounding the raw float
    difference to the nearest whole hour (half-hour offsets like IST UTC+5:30
    stored as 5.5 need this), then applying a double-mod to keep the result
    in [0, 23]:

        raw       = digest_hour − timezone_offset
        target    = (_round_half_away(raw) % 24 + 24) % 24

    The round is applied to the *difference* before the modulo — jq's %
    operator truncates floats to integers before dividing, so the same
    order must be used here to guarantee they agree.

    Examples:
        digest_hour=8,  timezone_offset=-5    →  target 13:00 UTC
        digest_hour=7,  timezone_offset=+1    →  target  6:00 UTC
        digest_hour=7,  timezone_offset=+5.5  →  target  2:00 UTC  (IST: 1.5h → 2)
        digest_hour=8,  timezone_offset=+5.5  →  target  3:00 UTC  (IST: 2.5h → 3, half-away)
        digest_hour=22, timezone_offset=+9    →  target 13:00 UTC
    """
    raw_hour   = user_config.get("digest_hour")
    raw_offset = user_config.get("timezone_offset")
    digest_hour = int(raw_hour   if raw_hour   is not None else 7)
    tz_offset   = float(raw_offset if raw_offset is not None else 0)
    raw_diff    = digest_hour - tz_offset
    return (_round_half_away(raw_diff) % 24 + 24) % 24


def _is_user_due(user_config: dict, utc_hour: int) -> bool:
    """Return True when this user's target UTC hour has arrived or passed today.

    Uses a cumulative window (target <= utc_hour) rather than a fixed two-hour
    window.  If the scheduled check at, say, UTC 01:00 is missed — due to a
    GitHub Actions delay, a transient DB permission error, or any other reason
    — every subsequent hourly check automatically picks the user up.

    Double-delivery is prevented by _already_delivered_today(): once a user
    has a 'complete' or 'empty' pipeline_runs row for today, they are skipped
    regardless of how many later checks include them.

    Note: users whose target_utc_hour is 23 are NOT caught at UTC 00:00 on the
    next calendar day (23 <= 0 is false).  If their 11 PM slot is missed they
    wait until 11 PM the following day — an acceptable trade-off for eliminating
    the cross-midnight ambiguity in the old two-hour window.
    """
    target = _target_utc_hour(user_config)
    return target <= utc_hour


def _already_delivered_today(user_id: str, run_date: str) -> bool:
    """Return True if the user already has a successful digest for *run_date*.

    Treats both 'complete' and 'empty' as terminal success states — 'empty'
    means the pipeline ran but no papers passed the threshold, which is still
    a valid delivery attempt that should not be repeated.

    This guard prevents a second delivery when a user is caught by the
    cumulative window (i.e. the user was already delivered at an earlier hour
    but later checks still see target <= utc_hour).
    """
    result = (
        supabase.table("pipeline_runs")
        .select("id")
        .eq("user_id", user_id)
        .eq("run_date", run_date)
        .in_("status", ["complete", "empty"])
        .limit(1)
        .execute()
    )
    return len(result.data) > 0


def _load_seen_paper_ids(user_id: str) -> set:
    """Return the set of arXiv IDs already delivered to *user_id* on any past day.

    Uses a paginated query so the result is never silently truncated for users
    with a long history (Supabase caps un-paginated responses at 1 000 rows).
    """
    seen: set = set()
    page_size = 1000
    offset = 0
    while True:
        response = (
            supabase.table("user_delivered_papers")
            .select("arxiv_id")
            .eq("user_id", user_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        seen.update(row["arxiv_id"] for row in page)
        if len(page) < page_size:
            break
        offset += page_size
    return seen


def _record_delivered_papers(
    user_id: str, arxiv_ids: list, delivered_date: str
) -> None:
    """Persist *arxiv_ids* as delivered for *user_id* so they are excluded from
    all future digests.

    Uses upsert with ON CONFLICT DO NOTHING so re-running a day (e.g. manual
    dispatch) never raises a duplicate-key error and doesn't overwrite the
    original delivered_date.
    """
    if not arxiv_ids:
        return
    rows = [
        {"user_id": user_id, "arxiv_id": aid, "delivered_date": delivered_date}
        for aid in arxiv_ids
    ]
    supabase.table("user_delivered_papers").upsert(
        rows,
        on_conflict="user_id,arxiv_id",
        ignore_duplicates=True,
    ).execute()
    log.info(
        "Delivered papers recorded",
        extra={"user_id": user_id, "count": len(arxiv_ids), "delivered_date": delivered_date},
    )


def _upsert_run(user_id: str, run_date: str, **fields) -> str:
    """Atomically create or update a pipeline_runs row; return the run id.

    Uses a true INSERT … ON CONFLICT DO UPDATE so concurrent callers — e.g.
    the web trigger route and the scheduled pipeline both touching the same
    user at the same second — never race on the unique (user_id, run_date)
    constraint and never raise an unhandled exception that would crash the
    per-user loop and skip all subsequent users.

    Only the columns explicitly passed in `fields` are updated on conflict;
    columns not in the payload (trigger_count, notion_page_url, …) are left
    unchanged — PostgREST's merge-duplicates resolution only SET's the
    columns present in the request body.
    """
    result = (
        supabase.table("pipeline_runs")
        .upsert(
            {"user_id": user_id, "run_date": run_date, **fields},
            on_conflict="user_id,run_date",
        )
        .select("id")
        .execute()
    )
    return result.data[0]["id"]


# ── fatal-error recovery ───────────────────────────────────────────────────────

def _fail_pending_runs(run_date: str, target_user_id: Optional[str], error: str) -> None:
    """Mark any pending/running pipeline_runs rows as failed.

    Called when the pipeline crashes before the per-user loop — e.g. during
    fetch_papers() or get_active_users().  Without this, the trigger route
    sets status='pending' and the dashboard polls forever because nothing ever
    moves it to a terminal state.
    """
    try:
        query = (
            supabase.table("pipeline_runs")
            .update({
                "status": "failed",
                "error_message": f"Pipeline startup error: {error[:400]}",
                "completed_at": _now(),
            })
            .eq("run_date", run_date)
            .in_("status", ["pending", "running"])
        )
        if target_user_id:
            query = query.eq("user_id", target_user_id)
        query.execute()
        log.info(
            "Marked pending/running runs as failed",
            extra={"run_date": run_date, "target_user_id": target_user_id, "error": error},
        )
    except Exception as cleanup_exc:
        # Don't let cleanup failure mask the original error.
        log.error("Failed to mark runs as failed: %s", cleanup_exc)


# ── main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    run_date = os.environ.get("PIPELINE_RUN_DATE") or date.today().isoformat()
    target_user_id = os.environ.get("PIPELINE_USER_ID")
    use_batch = os.environ.get("PIPELINE_USE_BATCH", "").lower() == "true"
    skip_time_filter = os.environ.get("PIPELINE_SKIP_TIME_FILTER", "").lower() == "true"

    utc_now = datetime.now(timezone.utc)
    # Prefer the UTC hour captured by the check job (before pip install adds
    # 2-5 min of startup latency).  This prevents users due at hour N from
    # being skipped when job startup pushes Python into hour N+1.
    # Falls back to the live clock for manual dispatches or local runs where
    # PIPELINE_UTC_HOUR is not set.
    utc_hour_env = os.environ.get("PIPELINE_UTC_HOUR", "").strip()
    if utc_hour_env.isdigit():
        utc_hour = int(utc_hour_env)
        log.info(
            "UTC hour from check job",
            extra={"pipeline_utc_hour": utc_hour, "actual_utc_hour": utc_now.hour},
        )
    else:
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
    try:
        papers = fetch_papers(run_date)
    except Exception as exc:
        _fail_pending_runs(run_date, target_user_id, str(exc))
        raise

    log.info(
        "Papers fetched",
        extra={"run_date": run_date, "papers_fetched": len(papers)},
    )

    # ── Load active users then apply per-user delivery-time filter ────────────
    try:
        all_users = get_active_users(target_user_id)
    except Exception as exc:
        _fail_pending_runs(run_date, target_user_id, str(exc))
        raise

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
        run_id: str = ""  # populated inside try; kept in scope for the except handler

        try:
            # Guard: skip if already successfully delivered today.
            # The cumulative window (target <= utc_hour) means a user may appear
            # in every hourly check after their target hour. This prevents a
            # second delivery once the first run completed.
            if _already_delivered_today(user_id, run_date):
                log.info(
                    "User already delivered today — skipping",
                    extra={"run_date": run_date, "user_id": user_id, "email": email},
                )
                succeeded += 1
                continue

            # Mark run as started — must be inside try/except so a DB or network
            # error here doesn't crash the outer loop and skip all remaining users.
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

            # Filter out papers already delivered to this user on previous days
            seen_ids = _load_seen_paper_ids(user_id)
            fresh_papers = [p for p in papers if p.get("arxiv_id", "") not in seen_ids]
            n_deduped = len(papers) - len(fresh_papers)
            if n_deduped:
                log.info(
                    "Cross-day deduplication",
                    extra={
                        "run_date": run_date,
                        "run_id": run_id,
                        "user_id": user_id,
                        "papers_excluded": n_deduped,
                        "papers_remaining": len(fresh_papers),
                    },
                )

            # Per-user scoring (only fresh papers)
            scored = rank_papers(fresh_papers, user_config, use_batch=use_batch)
            log.info(
                "Scoring complete",
                extra={
                    "run_date": run_date,
                    "run_id": run_id,
                    "user_id": user_id,
                    "papers_fetched": len(fresh_papers),
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

            # Record delivered papers so they are excluded from future digests
            _record_delivered_papers(
                user_id,
                [p["arxiv_id"] for p in scored if p.get("arxiv_id")],
                run_date,
            )

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
            # Only update pipeline_runs if we successfully obtained a run_id
            # (i.e. _upsert_run didn't throw). If it did throw, run_id is ""
            # and there's nothing to update — the row may not exist.
            if run_id:
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
