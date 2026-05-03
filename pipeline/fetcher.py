import logging
import re
from datetime import date, timedelta
from typing import Optional

import arxiv

from config import supabase
from pipeline_config import (
    ARXIV_CATEGORIES,
    MAX_RESULTS_PER_CATEGORY,
    MAX_AUTHORS_DISPLAYED,
    ARXIV_CLIENT_PAGE_SIZE,
    ARXIV_CLIENT_DELAY_SECONDS,
    ARXIV_CLIENT_NUM_RETRIES,
    WEEKDAY_WINDOW_DAYS,
    WEEKEND_WINDOW_DAYS,
    KEYWORD_GROUPS,
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

        results = list(client.results(search))
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

    for group_name, count in group_counts.items():
        log.info("Group '%s': %d papers", group_name, count)

    if papers:
        supabase.table("papers_cache").upsert(
            papers, on_conflict="arxiv_id,fetch_date"
        ).execute()
        log.info("Cached %d papers for %s", len(papers), run_date)

    return papers
