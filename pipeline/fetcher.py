import logging
import re
import time
from datetime import date, timedelta
from typing import Optional

import arxiv

from config import supabase
from pipeline_config import (
    ARXIV_CATEGORIES,
    ARXIV_CATEGORIES_EXTRA,
    MAX_RESULTS_PER_CATEGORY,
    MAX_AUTHORS_DISPLAYED,
    ARXIV_CLIENT_PAGE_SIZE,
    ARXIV_CLIENT_DELAY_SECONDS,
    ARXIV_CLIENT_NUM_RETRIES,
    ARXIV_INTER_CATEGORY_DELAY_SECONDS,
    WEEKDAY_WINDOW_DAYS,
    WEEKEND_WINDOW_DAYS,
    KEYWORD_GROUPS,
    FETCH_CONCURRENT_RETRY_DELAY_SECONDS,
    ARXIV_429_MAX_RETRIES,
    ARXIV_429_BASE_DELAY_SECONDS,
)

log = logging.getLogger(__name__)

# Build compiled regex patterns once at import time (not on every fetch call).
GROUP_PATTERNS: list[tuple[str, re.Pattern]] = [
    (
        name,
        re.compile("|".join(re.escape(keyword) for keyword in keywords), re.IGNORECASE),
    )
    for name, keywords in KEYWORD_GROUPS
]


def _fetch_results(client: arxiv.Client, search: arxiv.Search, category: str) -> list[arxiv.Result]:
    """Fetch all results for *search* with application-level 429 retry.

    The arxiv library retries each individual HTTP request up to
    ARXIV_CLIENT_NUM_RETRIES times, but it uses the same short
    ARXIV_CLIENT_DELAY_SECONDS between attempts — not nearly enough for
    arXiv's rate limiter to reset after a 429.

    This wrapper catches the final HTTPError (status 429) that escapes the
    library and re-runs the entire search with an exponential backoff:
      attempt 1 → sleep ARXIV_429_BASE_DELAY_SECONDS  (default 90 s)
      attempt 2 → sleep ARXIV_429_BASE_DELAY_SECONDS × 2  (180 s)
      attempt 3 → sleep ARXIV_429_BASE_DELAY_SECONDS × 4  (360 s)
    After all retries are exhausted the exception propagates and the pipeline
    marks the run as failed via _fail_pending_runs().
    """
    for attempt in range(ARXIV_429_MAX_RETRIES + 1):
        try:
            return list(client.results(search))
        except arxiv.HTTPError as exc:
            if exc.status == 429 and attempt < ARXIV_429_MAX_RETRIES:
                wait = ARXIV_429_BASE_DELAY_SECONDS * (2 ** attempt)
                log.warning(
                    "arXiv 429 on %s (application retry %d/%d) — sleeping %ds before retry",
                    category,
                    attempt + 1,
                    ARXIV_429_MAX_RETRIES,
                    wait,
                )
                time.sleep(wait)
            else:
                raise
    return []  # unreachable — loop always raises or returns


def _arxiv_id(result: arxiv.Result) -> str:
    return result.entry_id.split("/abs/")[-1]


def _matched_group(result: arxiv.Result) -> Optional[str]:
    haystack = f"{result.title} {result.summary}"
    for name, pattern in GROUP_PATTERNS:
        if pattern.search(haystack):
            return name
    return None


def _window_days(run_day: date) -> int:
    """Use a wider publication-date window on Sunday and Monday runs.

    Weekend submissions accumulate over Saturday–Sunday and aren't processed
    until Monday morning; a 2-day window captures them.
    """
    if run_day.weekday() in (6, 0):  # Sunday=6, Monday=0
        return WEEKEND_WINDOW_DAYS
    return WEEKDAY_WINDOW_DAYS


def fetch_papers(run_date: str) -> list[dict]:
    """Return papers for *run_date*.

    Checks papers_cache first. On a cache miss, fetches from arXiv,
    inserts results, then returns them. Deduplicates across categories.
    """
    cached = (
        supabase.table("papers_cache")
        .select("*")
        .eq("fetch_date", run_date)
        .execute()
    )
    if cached.data:
        log.info("Cache hit: %d papers for %s", len(cached.data), run_date)
        return cached.data

    # Sleep briefly and recheck before crawling arXiv.
    # If a concurrent pipeline (another user triggering at the same time)
    # is already mid-crawl, it will have populated the cache by the time we
    # wake up — saving a redundant full arXiv crawl.
    if FETCH_CONCURRENT_RETRY_DELAY_SECONDS > 0:
        log.info(
            "Cache miss — waiting %ds in case a concurrent fetch is in progress (%s)",
            FETCH_CONCURRENT_RETRY_DELAY_SECONDS,
            run_date,
        )
        time.sleep(FETCH_CONCURRENT_RETRY_DELAY_SECONDS)
        retry = (
            supabase.table("papers_cache")
            .select("*")
            .eq("fetch_date", run_date)
            .execute()
        )
        if retry.data:
            log.info(
                "Cache populated by concurrent fetch: %d papers for %s",
                len(retry.data),
                run_date,
            )
            return retry.data

    log.info("Cache miss — fetching from arXiv for %s", run_date)

    run_day = date.fromisoformat(run_date)
    window_days = _window_days(run_day)
    log.info(
        "Using %d publication-day window for %s (%s)",
        window_days,
        run_date,
        run_day.strftime("%A"),
    )

    client = arxiv.Client(
        page_size=ARXIV_CLIENT_PAGE_SIZE,
        delay_seconds=ARXIV_CLIENT_DELAY_SECONDS,
        num_retries=ARXIV_CLIENT_NUM_RETRIES,
    )

    papers: list[dict] = []
    seen_ids: set[str] = set()
    group_counts: dict[str, int] = {name: 0 for name, _ in KEYWORD_GROUPS}

    for category in ARXIV_CATEGORIES:
        search = arxiv.Search(
            query=f"cat:{category}",
            max_results=MAX_RESULTS_PER_CATEGORY,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending,
        )

        results = _fetch_results(client, search, category)
        if results:
            newest = max(result.published.date() for result in results)
            oldest = min(result.published.date() for result in results)
            effective_cutoff = newest - timedelta(days=window_days - 1)
            recent = [
                result for result in results if result.published.date() >= effective_cutoff
            ]
            log.info(
                "%s: fetched %d results spanning %s to %s; effective cutoff=%s; %d within window",
                category,
                len(results),
                newest.isoformat(),
                oldest.isoformat(),
                effective_cutoff.isoformat(),
                len(recent),
            )
        else:
            log.info("%s: fetched 0 results", category)
            recent = []

        matched_in_category = 0

        for result in recent:
            arxiv_id = _arxiv_id(result)
            if arxiv_id in seen_ids:
                continue

            matched_group = _matched_group(result)
            if not matched_group:
                continue

            seen_ids.add(arxiv_id)
            papers.append(
                {
                    "arxiv_id": arxiv_id,
                    "fetch_date": run_date,
                    "title": result.title,
                    "authors": ", ".join(
                        a.name for a in result.authors[:MAX_AUTHORS_DISPLAYED]
                    ),
                    "abstract": result.summary.replace("\n", " "),
                    "pdf_url": result.pdf_url,
                    "published_date": result.published.date().isoformat(),
                    "category": result.primary_category,
                    "matched_group": matched_group,
                    "raw_json": {
                        "entry_id": result.entry_id,
                        "categories": result.categories,
                    },
                }
            )
            group_counts[matched_group] += 1
            matched_in_category += 1

        log.info("%s: %d papers passed keyword filter", category, matched_in_category)

        # Pause between categories so arXiv doesn't rate-limit the next request.
        # The per-page delay (ARXIV_CLIENT_DELAY_SECONDS) only applies within a
        # single search; without this sleep the next category starts immediately
        # and arXiv sees back-to-back requests ~3s apart, triggering a 429.
        if category != ARXIV_CATEGORIES[-1] and ARXIV_INTER_CATEGORY_DELAY_SECONDS > 0:
            log.info(
                "Sleeping %gs before next category to respect arXiv rate limit",
                ARXIV_INTER_CATEGORY_DELAY_SECONDS,
            )
            time.sleep(ARXIV_INTER_CATEGORY_DELAY_SECONDS)

    for group_name, count in group_counts.items():
        log.info("Group '%s': %d papers", group_name, count)

    if papers:
        supabase.table("papers_cache").upsert(
            papers, on_conflict="arxiv_id,fetch_date"
        ).execute()
        log.info("Cached %d papers for %s", len(papers), run_date)

    return papers


def fetch_extra_papers(
    run_date: str,
    categories: list[str],
    known_ids: set[str],
) -> list[dict]:
    """Fetch papers from *categories* that are not already in *known_ids*.

    Unlike fetch_papers() this function:
    - Never reads from or writes to papers_cache — results are personal and
      must not pollute the shared cache used by all other users.
    - Accepts an explicit *known_ids* set so cross-category duplicates and
      papers already in the shared pool are both skipped.
    - Uses the same client settings, keyword filter, and publication-window
      logic as fetch_papers() for consistent behaviour.

    Intended to be called in pipeline.py only when processing the owner's
    user_id (MY_USER_ID env var), never during batch runs.
    """
    if not categories:
        return []

    run_day = date.fromisoformat(run_date)
    window_days = _window_days(run_day)
    log.info(
        "Extra fetch: %d categories for %s",
        len(categories),
        run_date,
    )

    client = arxiv.Client(
        page_size=ARXIV_CLIENT_PAGE_SIZE,
        delay_seconds=ARXIV_CLIENT_DELAY_SECONDS,
        num_retries=ARXIV_CLIENT_NUM_RETRIES,
    )

    papers: list[dict] = []
    seen_ids: set[str] = set(known_ids)  # copy — do not mutate the caller's set
    group_counts: dict[str, int] = {}

    for category in categories:
        search = arxiv.Search(
            query=f"cat:{category}",
            max_results=MAX_RESULTS_PER_CATEGORY,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending,
        )

        try:
            results = _fetch_results(client, search, category)
        except arxiv.HTTPError as exc:
            # A persistent 429 after all application-level retries: skip this
            # category and continue. Other extra categories still run — one
            # bad category doesn't kill the whole extra fetch.
            log.warning(
                "%s (extra): skipped after persistent 429 — %s",
                category,
                exc,
            )
            continue

        if results:
            newest = max(result.published.date() for result in results)
            oldest = min(result.published.date() for result in results)
            effective_cutoff = newest - timedelta(days=window_days - 1)
            recent = [r for r in results if r.published.date() >= effective_cutoff]
            log.info(
                "%s (extra): fetched %d results spanning %s to %s; "
                "effective cutoff=%s; %d within window",
                category,
                len(results),
                newest.isoformat(),
                oldest.isoformat(),
                effective_cutoff.isoformat(),
                len(recent),
            )
        else:
            log.info("%s (extra): fetched 0 results", category)
            recent = []

        matched_in_category = 0

        for result in recent:
            arxiv_id = _arxiv_id(result)
            if arxiv_id in seen_ids:
                continue

            matched_group = _matched_group(result)
            if not matched_group:
                continue

            seen_ids.add(arxiv_id)
            papers.append(
                {
                    "arxiv_id": arxiv_id,
                    "fetch_date": run_date,
                    "title": result.title,
                    "authors": ", ".join(
                        a.name for a in result.authors[:MAX_AUTHORS_DISPLAYED]
                    ),
                    "abstract": result.summary.replace("\n", " "),
                    "pdf_url": result.pdf_url,
                    "published_date": result.published.date().isoformat(),
                    "category": result.primary_category,
                    "matched_group": matched_group,
                    "raw_json": {
                        "entry_id": result.entry_id,
                        "categories": result.categories,
                    },
                }
            )
            group_counts[matched_group] = group_counts.get(matched_group, 0) + 1
            matched_in_category += 1

        log.info("%s (extra): %d papers passed keyword filter", category, matched_in_category)

        if category != categories[-1] and ARXIV_INTER_CATEGORY_DELAY_SECONDS > 0:
            log.info(
                "Sleeping %gs before next extra category to respect arXiv rate limit",
                ARXIV_INTER_CATEGORY_DELAY_SECONDS,
            )
            time.sleep(ARXIV_INTER_CATEGORY_DELAY_SECONDS)

    for group_name, count in group_counts.items():
        log.info("Extra group '%s': %d papers", group_name, count)

    log.info(
        "Extra fetch complete: %d new papers from %d categories",
        len(papers),
        len(categories),
    )
    return papers
