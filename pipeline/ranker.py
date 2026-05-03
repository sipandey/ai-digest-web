import hashlib
import json
import logging
import math
import os
import re
from typing import Optional

from openai import OpenAI

from config import supabase

log = logging.getLogger(__name__)

SCORE_MODEL = "gpt-4o-mini"
SUMMARY_MODEL = "gpt-4o-mini"
SCORE_BATCH_SIZE = 40
SUMMARY_BATCH_SIZE = 12
PROMPT_VERSION = 1
CACHE_TABLE = "paper_rankings_cache"
CACHE_QUERY_CHUNK_SIZE = 100
SUMMARY_FIELDS = (
    "problem",
    "approach",
    "results",
    "builder_takeaway",
    "learning_path",
)

LEVEL_DESCRIPTIONS: dict[str, str] = {
    "beginner": "a complete beginner just starting with AI",
    "developer_learning_ai": "a developer who can code well but is learning ML concepts",
    "practitioner": "a practitioner already building AI systems regularly",
    "ml_engineer": "an ML engineer who trains models and does deep ML work",
}


def _chunked(items: list, size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _clean_text(text: str, max_chars: int) -> str:
    return re.sub(r"\s+", " ", text or "").strip()[:max_chars]


def _truncate_words(text: str, max_words: int) -> str:
    words = re.sub(r"\s+", " ", text or "").strip().split()
    return " ".join(words[:max_words])


def _active_criteria(user_config: dict) -> list[str]:
    priorities = user_config.get("scoring_priorities") or {}
    active_criteria = [key for key, enabled in priorities.items() if enabled]
    if not active_criteria:
        active_criteria = [
            "builder_relevance",
            "understandability",
            "real_world_grounding",
            "novelty_timing",
        ]
    return active_criteria


def _user_context(user_config: dict) -> tuple[str, str, str]:
    profile = (user_config.get("profile_description") or "").strip()
    level = user_config.get("experience_level", "developer_learning_ai")
    topics = user_config.get("topics") or []

    level_desc = LEVEL_DESCRIPTIONS.get(level, level)
    topics_str = ", ".join(topics) if topics else "general AI/ML"
    return profile, level_desc, topics_str


def _profile_hash(user_config: dict) -> str:
    normalized = {
        "profile_description": (user_config.get("profile_description") or "").strip(),
        "experience_level": user_config.get("experience_level", "developer_learning_ai"),
        "topics": sorted(topic.strip() for topic in (user_config.get("topics") or [])),
        "scoring_priorities": user_config.get("scoring_priorities") or {},
        "score_model": SCORE_MODEL,
        "summary_model": SUMMARY_MODEL,
        "prompt_version": PROMPT_VERSION,
    }
    serialized = json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:24]


def _arxiv_id(paper: dict) -> str:
    return paper["arxiv_id"]


def _build_score_prompt(papers: list[dict], user_config: dict) -> str:
    profile, level_desc, topics_str = _user_context(user_config)
    active_criteria = _active_criteria(user_config)

    papers_text = ""
    for i, paper in enumerate(papers, 1):
        papers_text += (
            f"\nPaper {i}:\n"
            f"ID: {_arxiv_id(paper)}\n"
            f"Title: {paper['title']}\n"
            f"Abstract: {_clean_text(paper.get('abstract') or '', 400)}\n"
            f"Category: {paper.get('category', '')}\n"
            f"Group: {paper.get('matched_group', '')}\n"
        )

    return f"""You are scoring arXiv papers for a specific user. Be concise and accurate.

USER PROFILE:
{profile}

Experience level: {level_desc}
Topics of interest: {topics_str}

SCORING RUBRIC — score each criterion 1–10:
- builder_relevance: How directly useful is this for someone building or learning about {topics_str}?
- understandability: How accessible is this paper for {level_desc}?
- real_world_grounding: Does it include practical results, benchmarks, or released code?
- novelty_timing: Is this a meaningful advance worth reading about right now?

Compute OVERALL SCORE as the average of the active criteria: {", ".join(active_criteria)}.
A paper is included in the digest if overall score >= 7.0.

For EACH paper provide:
- arxiv_id (copy from input)
- score (float, 1 decimal place)
- include (true if score >= 7.0, else false)

Do not provide explanations or extra fields.

PAPERS:
{papers_text}

Respond with ONLY valid JSON in this exact shape:
{{"papers": [{{"arxiv_id": "...", "score": 0.0, "include": true}}]}}"""


def _build_summary_prompt(papers: list[dict], user_config: dict) -> str:
    profile, level_desc, topics_str = _user_context(user_config)

    papers_text = ""
    for i, paper in enumerate(papers, 1):
        papers_text += (
            f"\nPaper {i}:\n"
            f"ID: {_arxiv_id(paper)}\n"
            f"Title: {paper['title']}\n"
            f"Abstract: {_clean_text(paper.get('abstract') or '', 500)}\n"
            f"Category: {paper.get('category', '')}\n"
            f"Group: {paper.get('matched_group', '')}\n"
            f"Score: {paper.get('score', '')}\n"
        )

    return f"""You are preparing concise digest fields for papers already selected for a specific user.

USER PROFILE:
{profile}

Experience level: {level_desc}
Topics of interest: {topics_str}

For EACH paper provide:
- arxiv_id (copy from input)
- problem (<=15 words: what specific problem does it address?)
- approach (<=15 words: how does it solve it?)
- results (<=15 words: key result or benchmark number)
- builder_takeaway (<=20 words: one concrete thing this user can DO with this paper)
- learning_path (<=15 words: what should this user understand before reading it?)

PAPERS:
{papers_text}

Respond with ONLY valid JSON in this exact shape:
{{"papers": [{{"arxiv_id": "...", "problem": "...", "approach": "...", "results": "...", "builder_takeaway": "...", "learning_path": "..."}}]}}"""


def _has_complete_summary(row: dict) -> bool:
    return all(row.get(field) for field in SUMMARY_FIELDS)


def _coerce_score(value: object) -> float:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return 0.0


def _fallback_summary(paper: dict) -> dict:
    group = paper.get("matched_group", "AI/ML")
    return {
        "problem": _truncate_words(paper.get("title", "Paper summary"), 15)
        or "Paper summary",
        "approach": _truncate_words(paper.get("abstract", "See abstract"), 15)
        or "See abstract",
        "results": "See paper for results",
        "builder_takeaway": _truncate_words(
            f"Review this {group} paper for practical implementation ideas.",
            20,
        )
        or "Review for implementation ideas",
        "learning_path": _truncate_words(
            f"Start with {group} fundamentals before reading in depth.", 15
        )
        or "Read topic fundamentals first",
    }


def _build_cache_row(
    user_id: str,
    fetch_date: str,
    profile_hash: str,
    paper: dict,
    ranking: dict,
) -> dict:
    return {
        "user_id": user_id,
        "fetch_date": fetch_date,
        "profile_hash": profile_hash,
        "arxiv_id": _arxiv_id(paper),
        "prompt_version": PROMPT_VERSION,
        "score": _coerce_score(ranking.get("score")),
        "include": bool(ranking.get("include")),
        "problem": ranking.get("problem"),
        "approach": ranking.get("approach"),
        "results": ranking.get("results"),
        "builder_takeaway": ranking.get("builder_takeaway"),
        "learning_path": ranking.get("learning_path"),
    }


def _load_cached_rankings(
    user_id: str, fetch_date: str, profile_hash: str, paper_ids: list[str]
) -> Optional[dict[str, dict]]:
    rows_by_id: dict[str, dict] = {}
    try:
        for chunk in _chunked(paper_ids, CACHE_QUERY_CHUNK_SIZE):
            response = (
                supabase.table(CACHE_TABLE)
                .select(
                    "arxiv_id, score, include, problem, approach, results, builder_takeaway, learning_path"
                )
                .eq("user_id", user_id)
                .eq("fetch_date", fetch_date)
                .eq("profile_hash", profile_hash)
                .eq("prompt_version", PROMPT_VERSION)
                .in_("arxiv_id", chunk)
                .execute()
            )
            for row in response.data or []:
                rows_by_id[row["arxiv_id"]] = row
        return rows_by_id
    except Exception as exc:
        log.warning("Ranking cache read unavailable, continuing without cache: %s", exc)
        return None


def _save_cached_rankings(rows: list[dict]) -> None:
    if not rows:
        return

    try:
        (
            supabase.table(CACHE_TABLE)
            .upsert(
                rows,
                on_conflict="user_id,fetch_date,profile_hash,arxiv_id,prompt_version",
            )
            .execute()
        )
    except Exception as exc:
        log.warning("Ranking cache write unavailable, continuing without cache: %s", exc)


def _score_batches(
    papers: list[dict], user_config: dict, client: OpenAI
) -> tuple[dict[str, dict], int]:
    """Return (score_map, llm_call_count)."""
    scored: dict[str, dict] = {}
    call_count = 0

    for batch_start in range(0, len(papers), SCORE_BATCH_SIZE):
        batch = papers[batch_start : batch_start + SCORE_BATCH_SIZE]
        log.info(
            "Scoring batch %d–%d (%d papers)", batch_start + 1, batch_start + len(batch), len(batch)
        )
        call_count += 1

        try:
            response = client.chat.completions.create(
                model=SCORE_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a research paper scoring assistant. Respond only with valid JSON.",
                    },
                    {"role": "user", "content": _build_score_prompt(batch, user_config)},
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )

            result = json.loads(response.choices[0].message.content or "{}")
            for ranked in result.get("papers", []):
                scored[ranked["arxiv_id"]] = {
                    "score": _coerce_score(ranked.get("score")),
                    "include": bool(ranked.get("include")),
                }
        except Exception as exc:
            log.error(
                "OpenAI scoring failed for batch starting at %d: %s",
                batch_start,
                exc,
                exc_info=True,
            )
            for paper in batch:
                scored[_arxiv_id(paper)] = {"score": 0.0, "include": False}

    return scored, call_count


def _summarize_batches(
    papers: list[dict], user_config: dict, client: OpenAI
) -> tuple[dict[str, dict], int]:
    """Return (summary_map, llm_call_count)."""
    summaries: dict[str, dict] = {}
    call_count = 0

    for batch_start in range(0, len(papers), SUMMARY_BATCH_SIZE):
        batch = papers[batch_start : batch_start + SUMMARY_BATCH_SIZE]
        log.info(
            "Summarizing batch %d–%d (%d papers)", batch_start + 1, batch_start + len(batch), len(batch)
        )
        call_count += 1

        try:
            response = client.chat.completions.create(
                model=SUMMARY_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You prepare concise paper summaries. Respond only with valid JSON.",
                    },
                    {"role": "user", "content": _build_summary_prompt(batch, user_config)},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )

            result = json.loads(response.choices[0].message.content or "{}")
            for summary in result.get("papers", []):
                summaries[summary["arxiv_id"]] = {
                    "problem": summary.get("problem"),
                    "approach": summary.get("approach"),
                    "results": summary.get("results"),
                    "builder_takeaway": summary.get("builder_takeaway"),
                    "learning_path": summary.get("learning_path"),
                }
        except Exception as exc:
            log.error(
                "OpenAI summarization failed for batch starting at %d: %s",
                batch_start,
                exc,
                exc_info=True,
            )
            for paper in batch:
                summaries[_arxiv_id(paper)] = _fallback_summary(paper)

    return summaries, call_count


def rank_papers(papers: list[dict], user_config: dict) -> list[dict]:
    """Score *papers* for *user_config* using GPT-4o-mini.

    Uses a two-pass flow:
    1. score/include only
    2. summarize only papers that passed the threshold

    Results are cached per user, fetch date, and profile hash.
    """
    if not papers:
        return []

    user_id = user_config.get("user_id")
    fetch_date = papers[0].get("fetch_date")
    profile_hash = _profile_hash(user_config)
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    scored: list[dict] = []
    cache_rows_to_upsert: list[dict] = []
    papers_to_score: list[dict] = []
    papers_to_summarize: list[dict] = []

    cached_rows = None
    if user_id and fetch_date:
        cached_rows = _load_cached_rankings(
            user_id, fetch_date, profile_hash, [_arxiv_id(paper) for paper in papers]
        )

    # ── Phase 0: classify papers against the cache ────────────────────────────
    cache_hits = 0
    cached_rejections = 0
    cached_complete = 0  # score + complete summary both in cache

    for paper in papers:
        cached = cached_rows.get(_arxiv_id(paper)) if cached_rows is not None else None
        if not cached or cached.get("score") is None:
            papers_to_score.append(paper)
            continue

        cache_hits += 1
        base = {
            **paper,
            "score": _coerce_score(cached.get("score")),
            "include": bool(cached.get("include")),
        }

        if not base["include"]:
            cached_rejections += 1
            continue

        if _has_complete_summary(cached):
            cached_complete += 1
            scored.append(
                {
                    **base,
                    **{field: cached.get(field) for field in SUMMARY_FIELDS},
                }
            )
        else:
            papers_to_summarize.append(base)

    # Cache lookup summary (always emit so cold-run vs warm-run is visible)
    log.info(
        "Cache lookup  : %d/%d papers hit "
        "(%d complete hits, %d rejected hits, %d score-only hits, %d misses)",
        cache_hits,
        len(papers),
        cached_complete,
        cached_rejections,
        len(papers_to_summarize),   # score cached, summary still needed
        len(papers_to_score),       # not in cache at all
    )

    # ── Phase 1: score papers not in cache ───────────────────────────────────
    score_map, n_score_calls = _score_batches(papers_to_score, user_config, client)

    newly_passing = 0
    for paper in papers_to_score:
        ranking = score_map.get(_arxiv_id(paper), {"score": 0.0, "include": False})
        base = {
            **paper,
            "score": _coerce_score(ranking.get("score")),
            "include": bool(ranking.get("include")),
        }
        if base["include"]:
            newly_passing += 1
            papers_to_summarize.append(base)
        elif user_id and fetch_date:
            cache_rows_to_upsert.append(
                _build_cache_row(user_id, fetch_date, profile_hash, paper, base)
            )

    # How many scoring calls would a cold run have needed?
    baseline_score_calls = math.ceil(len(papers) / SCORE_BATCH_SIZE) if papers else 0
    score_calls_saved = baseline_score_calls - n_score_calls

    log.info(
        "Scoring       : %d LLM call(s) for %d papers "
        "(%d call(s) saved vs cold run, %d papers passed threshold)",
        n_score_calls,
        len(papers_to_score),
        score_calls_saved,
        newly_passing,
    )

    # ── Phase 2: summarize passing papers not fully in cache ─────────────────
    summaries, n_summary_calls = _summarize_batches(papers_to_summarize, user_config, client)

    for paper in papers_to_summarize:
        summary = summaries.get(_arxiv_id(paper)) or _fallback_summary(paper)
        enriched = {**paper, **summary}
        scored.append(enriched)
        if user_id and fetch_date:
            cache_rows_to_upsert.append(
                _build_cache_row(user_id, fetch_date, profile_hash, paper, enriched)
            )

    log.info(
        "Summarization : %d LLM call(s) for %d papers "
        "(%d summary/summaries served from cache)",
        n_summary_calls,
        len(papers_to_summarize),
        cached_complete,
    )

    if user_id and fetch_date:
        _save_cached_rankings(cache_rows_to_upsert)

    # ── Final summary ─────────────────────────────────────────────────────────
    total_llm_calls = n_score_calls + n_summary_calls
    total_saved = score_calls_saved  # summary savings harder to baseline without full run
    papers_zero_cost = cached_complete + cached_rejections  # no LLM touched at all

    log.info(
        "Total         : %d LLM call(s) made, ~%d saved by cache "
        "| %d/%d papers required zero LLM | %d/%d passed and delivered",
        total_llm_calls,
        total_saved,
        papers_zero_cost,
        len(papers),
        len(scored),
        len(papers),
    )

    scored.sort(key=lambda paper: float(paper.get("score", 0)), reverse=True)
    return scored
