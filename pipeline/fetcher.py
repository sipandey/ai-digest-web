import logging
from datetime import date, timedelta

import arxiv

from config import supabase

log = logging.getLogger(__name__)

# Five thematic groups mirroring the keyword clusters used in Phase 1.
SEARCH_GROUPS: list[dict] = [
    {
        "name": "RAG and retrieval",
        "query": (
            'abs:"retrieval augmented generation" OR abs:"RAG" '
            'OR abs:"dense retrieval" OR abs:"vector database" '
            'OR abs:"semantic search" OR abs:"knowledge retrieval"'
        ),
    },
    {
        "name": "AI agents and automation",
        "query": (
            'abs:"AI agent" OR abs:"autonomous agent" OR abs:"tool use" '
            'OR abs:"function calling" OR abs:"agentic" '
            'OR abs:"multi-agent" OR abs:"agent framework"'
        ),
    },
    {
        "name": "LLM applications and fine-tuning",
        "query": (
            'abs:"large language model" OR abs:"instruction tuning" '
            'OR abs:"RLHF" OR abs:"fine-tuning" OR abs:"prompt engineering" '
            'OR abs:"in-context learning" OR abs:"chain of thought"'
        ),
    },
    {
        "name": "Multimodal AI",
        "query": (
            'abs:"vision language model" OR abs:"multimodal" '
            'OR abs:"image text" OR abs:"visual question answering" '
            'OR abs:"text to image" OR abs:"video language"'
        ),
    },
    {
        "name": "AI safety and alignment",
        "query": (
            'abs:"AI safety" OR abs:"alignment" OR abs:"jailbreak" '
            'OR abs:"hallucination" OR abs:"red teaming" '
            'OR abs:"constitutional AI" OR abs:"truthfulness"'
        ),
    },
]

ARXIV_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.IR", "cs.CV"]
MAX_RESULTS_PER_GROUP = 40


def fetch_papers(run_date: str) -> list[dict]:
    """Return papers for *run_date*.

    Checks papers_cache first. On a cache miss, fetches from arXiv,
    inserts results, then returns them. Deduplicates across groups.
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

    cutoff = date.fromisoformat(run_date) - timedelta(days=1)
    client = arxiv.Client(num_retries=3, delay_seconds=3.0)

    papers: list[dict] = []
    seen_ids: set[str] = set()

    for group in SEARCH_GROUPS:
        # Restrict to the five primary ML/AI categories
        cat_filter = " OR ".join(f"cat:{c}" for c in ARXIV_CATEGORIES)
        full_query = f"({group['query']}) AND ({cat_filter})"

        search = arxiv.Search(
            query=full_query,
            max_results=MAX_RESULTS_PER_GROUP,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending,
        )

        for result in client.results(search):
            # Only include papers submitted/updated since yesterday
            if result.published.date() < cutoff:
                break

            arxiv_id = result.entry_id.split("/")[-1]
            if arxiv_id in seen_ids:
                continue
            seen_ids.add(arxiv_id)

            papers.append(
                {
                    "arxiv_id": arxiv_id,
                    "fetch_date": run_date,
                    "title": result.title,
                    "authors": ", ".join(a.name for a in result.authors[:5]),
                    "abstract": result.summary.replace("\n", " "),
                    "pdf_url": result.pdf_url,
                    "published_date": result.published.date().isoformat(),
                    "category": result.primary_category,
                    "matched_group": group["name"],
                    "raw_json": {
                        "entry_id": result.entry_id,
                        "categories": result.categories,
                    },
                }
            )

        log.info("Group '%s': %d papers", group["name"], len(papers))

    if papers:
        supabase.table("papers_cache").upsert(
            papers, on_conflict="arxiv_id,fetch_date"
        ).execute()
        log.info("Cached %d papers for %s", len(papers), run_date)

    return papers
