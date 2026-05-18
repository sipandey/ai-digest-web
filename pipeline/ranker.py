import hashlib
import io
import json
import logging
import math
import os
import re
import time
from typing import Optional

from openai import OpenAI

from config import supabase
from pipeline_config import (
    # models
    SCORE_MODEL,
    SUMMARY_MODEL,
    SCORE_TEMPERATURE,
    SUMMARY_TEMPERATURE,
    # batching
    SCORE_BATCH_SIZE,
    SUMMARY_BATCH_SIZE,
    MAX_SHORTLIST,
    SCORE_THRESHOLD,
    SCORE_ABSTRACT_MAX_CHARS,
    # retry / timeout
    OPENAI_MAX_RETRIES,
    OPENAI_TIMEOUT_SECONDS,
    OPENAI_CALL_MAX_RETRIES,
    OPENAI_RETRY_MAX_WAIT_SECONDS,
    # batch API
    BATCH_POLL_INTERVAL,
    BATCH_TIMEOUT,
    # cache
    CACHE_TABLE,
    CACHE_QUERY_CHUNK_SIZE,
    PROMPT_VERSION,
    # shortlist
    SHORTLIST_TITLE_WEIGHT,
    SHORTLIST_GROUP_WEIGHT,
    SHORTLIST_ABSTRACT_WEIGHT,
    SHORTLIST_STOPWORDS,
    SHORTLIST_MIN_KEYWORD_LENGTH,
    # rubric
    SCORING_CRITERIA,
    DEFAULT_ACTIVE_CRITERIA,
    LEVEL_DESCRIPTIONS,
    # summary limits
    SUMMARY_FIELD_WORD_LIMITS,
    # prompts
    SCORE_SYSTEM_MESSAGE,
    SCORE_PROMPT_TEMPLATE,
    SUMMARY_SYSTEM_MESSAGE,
    SUMMARY_PROMPT_TEMPLATE,
    # owner-only overrides (opportunity-scouting lens)
    SCORING_CRITERIA_OWNER,
    ACTIVE_CRITERIA_OWNER,
    PROMPT_VERSION_OWNER,
    SUMMARY_FIELD_WORD_LIMITS_OWNER,
    SCORE_PROMPT_TEMPLATE_OWNER,
    SUMMARY_PROMPT_TEMPLATE_OWNER,
)

log = logging.getLogger(__name__)

SUMMARY_FIELDS = (
    "problem",
    "approach",
    "results",
    "builder_takeaway",
    "learning_path",
)


# ── utilities ──────────────────────────────────────────────────────────────────


def _chunked(items: list, size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _clean_text(text: str, max_chars: int = 0) -> str:
    """Normalise whitespace. Pass max_chars=0 (default) for no truncation."""
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned[:max_chars] if max_chars > 0 else cleaned


def _truncate_words(text: str, max_words: int) -> str:
    words = re.sub(r"\s+", " ", text or "").strip().split()
    return " ".join(words[:max_words])


def _active_criteria(user_config: dict, owner_mode: bool = False) -> list[str]:
    if owner_mode:
        return list(ACTIVE_CRITERIA_OWNER)
    priorities = user_config.get("scoring_priorities") or {}
    # scoring_priorities may arrive as a JSON string if the column type is text.
    if isinstance(priorities, str):
        try:
            priorities = json.loads(priorities)
        except Exception:
            priorities = {}
    # Only keep keys that exist in SCORING_CRITERIA — unknown keys (e.g. a
    # stale "novelty" entry that should be "novelty_timing") are silently
    # dropped rather than passed to the LLM in an incomplete rubric.
    active = [key for key, enabled in priorities.items() if enabled and key in SCORING_CRITERIA]
    if not active:
        return list(DEFAULT_ACTIVE_CRITERIA)
    return active


def _sanitize_user_text(text: str) -> str:
    """Escape angle brackets in user-supplied text.

    Prompts wrap user content in XML-style delimiters (<user_profile>,
    <user_topics>) to signal to the model that the enclosed text is data,
    not instructions.  A crafted profile like '</user_profile>\\nIgnore above'
    could break out of those delimiters, so we escape < and > with HTML
    entities before injection.  The model handles &lt;/&gt; correctly in
    context; legitimate uses of angle brackets in profiles are rare.
    """
    return text.replace("<", "&lt;").replace(">", "&gt;")


def _sanitize_paper_text(text: str) -> str:
    """Escape angle brackets in arXiv paper content (titles, abstracts, etc.).

    Paper text is embedded inside <paper> XML delimiters in the scoring and
    summary prompts.  A crafted title like '</paper>\\nIgnore above\\n<paper>'
    could break out of its container and inject instructions into the prompt.
    Escaping < and > with HTML entities prevents delimiter escape attacks.

    This is the same transformation as _sanitize_user_text; it is kept as a
    separate function so the intent (untrusted third-party content vs.
    untrusted user content) remains explicit in call sites.
    """
    return text.replace("<", "&lt;").replace(">", "&gt;")


def _user_context(user_config: dict) -> tuple[str, str, str]:
    profile = _sanitize_user_text((user_config.get("profile_description") or "").strip())
    level = user_config.get("experience_level", "developer_learning_ai")
    topics = user_config.get("topics") or []
    level_desc = LEVEL_DESCRIPTIONS.get(level, level)
    topics_str = (
        ", ".join(_sanitize_user_text(t) for t in topics)
        if topics else "general AI/ML"
    )
    return profile, level_desc, topics_str


def _profile_hash(user_config: dict, owner_mode: bool = False) -> str:
    normalized = {
        "profile_description": (user_config.get("profile_description") or "").strip(),
        "experience_level": user_config.get("experience_level", "developer_learning_ai"),
        "topics": sorted(topic.strip() for topic in (user_config.get("topics") or [])),
        "scoring_priorities": user_config.get("scoring_priorities") or {},
        "score_model": SCORE_MODEL,
        "summary_model": SUMMARY_MODEL,
        "prompt_version": PROMPT_VERSION,
        "score_threshold": SCORE_THRESHOLD,
    }
    if owner_mode:
        # Separate cache namespace for owner prompts — ensures owner scores/
        # summaries never collide with the standard-prompt cache entries that
        # would exist if the same user ran in non-owner mode.
        normalized["owner_mode"] = True
        normalized["prompt_version_owner"] = PROMPT_VERSION_OWNER
    serialized = json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:24]


def _arxiv_id(paper: dict) -> str:
    return paper["arxiv_id"]


# ── OpenAI call with retry ─────────────────────────────────────────────────────


def _call_openai_with_retry(
    client: OpenAI,
    *,
    model: str,
    messages: list[dict],
    temperature: float,
) -> str:
    """Call chat.completions.create and return the raw content string.

    Two retry layers work together:
    - SDK layer (OPENAI_MAX_RETRIES): handles 429, 5xx transport errors with
      its own exponential backoff — configured at client construction time.
    - App layer (OPENAI_CALL_MAX_RETRIES): outer loop retries after the SDK
      has already exhausted its attempts, or when json.loads() fails because
      the model returned malformed JSON despite response_format=json_object.

    App-layer backoff: waits 2^attempt seconds (2s, 4s, 8s, …),
    capped at OPENAI_RETRY_MAX_WAIT_SECONDS.

    Raises the last caught exception when all attempts are exhausted.
    """
    last_exc: Exception | None = None

    for attempt in range(1, OPENAI_CALL_MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=temperature,
            )
            content = response.choices[0].message.content or "{}"
            json.loads(content)  # validate JSON — raises JSONDecodeError if malformed
            return content
        except Exception as exc:
            last_exc = exc
            if attempt < OPENAI_CALL_MAX_RETRIES:
                wait = min(2 ** attempt, OPENAI_RETRY_MAX_WAIT_SECONDS)
                log.warning(
                    "OpenAI call attempt %d/%d failed — retrying in %ds: %s",
                    attempt,
                    OPENAI_CALL_MAX_RETRIES,
                    wait,
                    exc,
                )
                time.sleep(wait)
            else:
                log.error(
                    "OpenAI call failed after %d attempt(s): %s",
                    OPENAI_CALL_MAX_RETRIES,
                    exc,
                    exc_info=True,
                )

    raise last_exc  # type: ignore[misc]


# ── shortlist ──────────────────────────────────────────────────────────────────


def _topic_keywords(topics: list[str]) -> list[str]:
    """Extract meaningful words from user topic strings for overlap scoring."""
    seen: set[str] = set()
    keywords: list[str] = []
    for topic in topics:
        for raw_word in re.split(r"[\s\-/]+", topic.lower()):
            word = re.sub(r"[^a-z0-9]", "", raw_word)
            if (
                len(word) > SHORTLIST_MIN_KEYWORD_LENGTH
                and word not in SHORTLIST_STOPWORDS
                and word not in seen
            ):
                seen.add(word)
                keywords.append(word)
    return keywords


def _shortlist_papers(papers: list[dict], user_config: dict) -> list[dict]:
    """Return at most MAX_SHORTLIST papers ranked by topic-overlap score.

    Scoring signals (additive, weights from pipeline_config):
      SHORTLIST_TITLE_WEIGHT    — keyword found in title
      SHORTLIST_GROUP_WEIGHT    — keyword found in matched_group
      SHORTLIST_ABSTRACT_WEIGHT — keyword found in abstract

    Papers below the cutoff are dropped before any cache query or LLM call.
    Returns papers unchanged when the list already fits within MAX_SHORTLIST.
    """
    if len(papers) <= MAX_SHORTLIST:
        return papers

    topics = user_config.get("topics") or []
    if not topics:
        log.info(
            "Shortlist: no topics configured — truncating %d → %d (newest first)",
            len(papers), MAX_SHORTLIST,
        )
        return papers[:MAX_SHORTLIST]

    keywords = _topic_keywords(topics)
    if not keywords:
        log.info(
            "Shortlist: no keywords extracted — truncating %d → %d (newest first)",
            len(papers), MAX_SHORTLIST,
        )
        return papers[:MAX_SHORTLIST]

    kw_pattern = re.compile(
        "|".join(re.escape(kw) for kw in keywords), re.IGNORECASE
    )

    def _overlap(paper: dict) -> int:
        score = 0
        if kw_pattern.search(paper.get("title", "")):
            score += SHORTLIST_TITLE_WEIGHT
        if kw_pattern.search(paper.get("matched_group", "")):
            score += SHORTLIST_GROUP_WEIGHT
        if kw_pattern.search(paper.get("abstract", "")):
            score += SHORTLIST_ABSTRACT_WEIGHT
        return score

    ranked = sorted(papers, key=_overlap, reverse=True)
    cutoff_score = _overlap(ranked[MAX_SHORTLIST - 1])
    dropped = ranked[MAX_SHORTLIST:]
    n_zero_dropped = sum(1 for p in dropped if _overlap(p) == 0)

    log.info(
        "Shortlist: %d → %d papers | cutoff overlap=%d | %d dropped (%d with zero overlap)",
        len(papers), MAX_SHORTLIST, cutoff_score, len(dropped), n_zero_dropped,
    )
    return ranked[:MAX_SHORTLIST]


# ── prompt builders ────────────────────────────────────────────────────────────


def _format_papers_for_scoring(papers: list[dict]) -> str:
    """Format papers for the scoring prompt.

    Each paper is wrapped in <paper> XML delimiters so the model has a clear
    boundary between structured metadata fields and the prompt itself.
    All free-text fields (title, abstract, category, group) are sanitized with
    _sanitize_paper_text to prevent a crafted title or abstract from escaping
    the <paper> container and injecting prompt instructions.
    """
    lines = ""
    for i, paper in enumerate(papers, 1):
        lines += (
            f"\n<paper index=\"{i}\">\n"
            f"ID: {_arxiv_id(paper)}\n"
            f"Title: {_sanitize_paper_text(paper.get('title', ''))}\n"
            f"Abstract: {_sanitize_paper_text(_clean_text(paper.get('abstract') or '', SCORE_ABSTRACT_MAX_CHARS))}\n"
            f"Category: {_sanitize_paper_text(paper.get('category', ''))}\n"
            f"Group: {_sanitize_paper_text(paper.get('matched_group', ''))}\n"
            f"</paper>\n"
        )
    return lines


def _format_papers_for_summary(papers: list[dict]) -> str:
    """Format papers for the summary prompt.

    Same sanitization and XML-delimiter approach as _format_papers_for_scoring.
    Full abstract is used here (no character cap) for richer summaries.
    """
    lines = ""
    for i, paper in enumerate(papers, 1):
        lines += (
            f"\n<paper index=\"{i}\">\n"
            f"ID: {_arxiv_id(paper)}\n"
            f"Title: {_sanitize_paper_text(paper.get('title', ''))}\n"
            f"Abstract: {_sanitize_paper_text(_clean_text(paper.get('abstract') or ''))}\n"
            f"Category: {_sanitize_paper_text(paper.get('category', ''))}\n"
            f"Group: {_sanitize_paper_text(paper.get('matched_group', ''))}\n"
            f"Score: {paper.get('score', '')}\n"
            f"</paper>\n"
        )
    return lines


def _build_score_prompt(
    papers: list[dict], user_config: dict, owner_mode: bool = False
) -> str:
    profile, level_desc, topics_str = _user_context(user_config)
    active = _active_criteria(user_config, owner_mode=owner_mode)
    criteria_dict = SCORING_CRITERIA_OWNER if owner_mode else SCORING_CRITERIA
    template = SCORE_PROMPT_TEMPLATE_OWNER if owner_mode else SCORE_PROMPT_TEMPLATE

    rubric_lines = "\n".join(
        f"- {key}: {criteria_dict[key].format(topics=topics_str, level_desc=level_desc)}"
        for key in active
        if key in criteria_dict
    )

    return template.format(
        profile=profile,
        level_desc=level_desc,
        topics_str=topics_str,
        rubric_lines=rubric_lines,
        active_criteria_str=", ".join(active),
        score_threshold=SCORE_THRESHOLD,
        papers_text=_format_papers_for_scoring(papers),
    )


def _build_summary_prompt(
    papers: list[dict], user_config: dict, owner_mode: bool = False
) -> str:
    profile, level_desc, topics_str = _user_context(user_config)
    lim = SUMMARY_FIELD_WORD_LIMITS_OWNER if owner_mode else SUMMARY_FIELD_WORD_LIMITS
    template = SUMMARY_PROMPT_TEMPLATE_OWNER if owner_mode else SUMMARY_PROMPT_TEMPLATE

    return template.format(
        profile=profile,
        level_desc=level_desc,
        topics_str=topics_str,
        problem_words=lim["problem"],
        approach_words=lim["approach"],
        results_words=lim["results"],
        builder_takeaway_words=lim["builder_takeaway"],
        learning_path_words=lim["learning_path"],
        papers_text=_format_papers_for_summary(papers),
    )


# ── cache helpers ──────────────────────────────────────────────────────────────


def _has_complete_summary(row: dict) -> bool:
    return all(row.get(field) for field in SUMMARY_FIELDS)


def _coerce_score(value: object) -> float:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return 0.0


def _fallback_summary(paper: dict) -> dict:
    group = paper.get("matched_group", "AI/ML")
    lim = SUMMARY_FIELD_WORD_LIMITS
    return {
        "problem": _truncate_words(paper.get("title", "Paper summary"), lim["problem"])
            or "Paper summary",
        "approach": _truncate_words(paper.get("abstract", "See abstract"), lim["approach"])
            or "See abstract",
        "results": "See paper for results",
        "builder_takeaway": _truncate_words(
            f"Review this {group} paper for practical implementation ideas.",
            lim["builder_takeaway"],
        ) or "Review for implementation ideas",
        "learning_path": _truncate_words(
            f"Start with {group} fundamentals before reading in depth.",
            lim["learning_path"],
        ) or "Read topic fundamentals first",
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


# ── Batch API ──────────────────────────────────────────────────────────────────


def _submit_and_poll_batch(
    client: OpenAI,
    requests: list[dict],
    label: str,
) -> dict[str, str]:
    """Upload *requests* as an OpenAI Batch job and poll until done.

    Returns {custom_id: raw_content_str}.
    Raises RuntimeError on batch failure, TimeoutError if BATCH_TIMEOUT exceeded.
    """
    jsonl_bytes = "\n".join(json.dumps(r) for r in requests).encode()
    file_obj = client.files.create(
        file=("batch.jsonl", io.BytesIO(jsonl_bytes), "application/jsonl"),
        purpose="batch",
    )
    log.info("Batch [%s]: uploaded %d request(s), file_id=%s", label, len(requests), file_obj.id)

    batch = client.batches.create(
        input_file_id=file_obj.id,
        endpoint="/v1/chat/completions",
        completion_window="24h",
    )
    log.info("Batch [%s]: submitted, batch_id=%s", label, batch.id)

    deadline = time.monotonic() + BATCH_TIMEOUT
    while time.monotonic() < deadline:
        batch = client.batches.retrieve(batch.id)
        counts = batch.request_counts

        if batch.status == "completed":
            log.info(
                "Batch [%s]: completed — %d succeeded, %d failed",
                label, counts.completed, counts.failed,
            )
            break

        if batch.status in ("failed", "expired", "cancelled"):
            raise RuntimeError(
                f"Batch [{label}] ended with status '{batch.status}'"
            )

        log.info(
            "Batch [%s]: %s (%d/%d done) — next check in %ds",
            label, batch.status, counts.completed, counts.total, BATCH_POLL_INTERVAL,
        )
        time.sleep(BATCH_POLL_INTERVAL)
    else:
        raise TimeoutError(
            f"Batch [{label}] did not complete within {BATCH_TIMEOUT}s"
        )

    if not batch.output_file_id:
        log.error("Batch [%s]: completed but output_file_id is missing", label)
        return {}

    raw = client.files.content(batch.output_file_id).text
    results: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        cid = item["custom_id"]
        try:
            content = item["response"]["body"]["choices"][0]["message"]["content"]
            results[cid] = content
        except (KeyError, IndexError, TypeError):
            log.warning("Batch [%s]: missing content for custom_id=%s", label, cid)
            results[cid] = "{}"

    # Clean up both files (best-effort) — output accumulates against storage quota
    for fid in (file_obj.id, batch.output_file_id):
        try:
            client.files.delete(fid)
        except Exception:
            pass

    return results


def _score_batches_batch_api(
    papers: list[dict], user_config: dict, client: OpenAI, label: str,
    owner_mode: bool = False,
) -> tuple[dict[str, dict], int]:
    """Batch-API scoring. Returns (score_map, n_requests_submitted)."""
    if not papers:
        return {}, 0

    requests: list[dict] = []
    batch_map: dict[str, list[dict]] = {}

    for i, start in enumerate(range(0, len(papers), SCORE_BATCH_SIZE)):
        batch = papers[start : start + SCORE_BATCH_SIZE]
        cid = f"score-{label}-{i}"
        batch_map[cid] = batch
        requests.append({
            "custom_id": cid,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": SCORE_MODEL,
                "messages": [
                    {"role": "system", "content": SCORE_SYSTEM_MESSAGE},
                    {"role": "user", "content": _build_score_prompt(batch, user_config, owner_mode=owner_mode)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": SCORE_TEMPERATURE,
            },
        })

    raw_results = _submit_and_poll_batch(client, requests, f"scoring-{label}")

    scored: dict[str, dict] = {}
    for cid, content in raw_results.items():
        batch = batch_map.get(cid, [])
        try:
            result = json.loads(content)
            for ranked in result.get("papers", []):
                scored[ranked["arxiv_id"]] = {
                    "score": _coerce_score(ranked.get("score")),
                    "include": bool(ranked.get("include")),
                }
        except (json.JSONDecodeError, KeyError):
            log.error("Batch scoring: failed to parse result for custom_id=%s", cid)
            for paper in batch:
                scored[_arxiv_id(paper)] = {"score": 0.0, "include": False}

    return scored, len(requests)


def _summarize_batches_batch_api(
    papers: list[dict], user_config: dict, client: OpenAI, label: str,
    owner_mode: bool = False,
) -> tuple[dict[str, dict], int]:
    """Batch-API summarisation. Returns (summary_map, n_requests_submitted)."""
    if not papers:
        return {}, 0

    requests: list[dict] = []
    batch_map: dict[str, list[dict]] = {}

    for i, start in enumerate(range(0, len(papers), SUMMARY_BATCH_SIZE)):
        batch = papers[start : start + SUMMARY_BATCH_SIZE]
        cid = f"summary-{label}-{i}"
        batch_map[cid] = batch
        requests.append({
            "custom_id": cid,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": SUMMARY_MODEL,
                "messages": [
                    {"role": "system", "content": SUMMARY_SYSTEM_MESSAGE},
                    {"role": "user", "content": _build_summary_prompt(batch, user_config, owner_mode=owner_mode)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": SUMMARY_TEMPERATURE,
            },
        })

    raw_results = _submit_and_poll_batch(client, requests, f"summary-{label}")

    summaries: dict[str, dict] = {}
    for cid, content in raw_results.items():
        batch = batch_map.get(cid, [])
        try:
            result = json.loads(content)
            for summary in result.get("papers", []):
                summaries[summary["arxiv_id"]] = {
                    "problem": summary.get("problem"),
                    "approach": summary.get("approach"),
                    "results": summary.get("results"),
                    "builder_takeaway": summary.get("builder_takeaway"),
                    "learning_path": summary.get("learning_path"),
                }
        except (json.JSONDecodeError, KeyError):
            log.error("Batch summarisation: failed to parse result for custom_id=%s", cid)
            for paper in batch:
                summaries[_arxiv_id(paper)] = _fallback_summary(paper)

    return summaries, len(requests)


def _score_batches(
    papers: list[dict], user_config: dict, client: OpenAI, owner_mode: bool = False,
) -> tuple[dict[str, dict], int]:
    """Synchronous scoring. Returns (score_map, llm_call_count)."""
    scored: dict[str, dict] = {}
    call_count = 0

    for batch_start in range(0, len(papers), SCORE_BATCH_SIZE):
        batch = papers[batch_start : batch_start + SCORE_BATCH_SIZE]
        log.info(
            "Scoring batch %d–%d (%d papers)", batch_start + 1, batch_start + len(batch), len(batch)
        )
        call_count += 1
        try:
            content = _call_openai_with_retry(
                client,
                model=SCORE_MODEL,
                messages=[
                    {"role": "system", "content": SCORE_SYSTEM_MESSAGE},
                    {"role": "user", "content": _build_score_prompt(batch, user_config, owner_mode=owner_mode)},
                ],
                temperature=SCORE_TEMPERATURE,
            )
            result = json.loads(content)
            for ranked in result.get("papers", []):
                scored[ranked["arxiv_id"]] = {
                    "score": _coerce_score(ranked.get("score")),
                    "include": bool(ranked.get("include")),
                }
        except Exception as exc:
            log.error(
                "OpenAI scoring failed for batch starting at %d after all retries: %s",
                batch_start, exc, exc_info=True,
            )
            for paper in batch:
                scored[_arxiv_id(paper)] = {"score": 0.0, "include": False}

    return scored, call_count


def _summarize_batches(
    papers: list[dict], user_config: dict, client: OpenAI, owner_mode: bool = False,
) -> tuple[dict[str, dict], int]:
    """Synchronous summarisation. Returns (summary_map, llm_call_count)."""
    summaries: dict[str, dict] = {}
    call_count = 0

    for batch_start in range(0, len(papers), SUMMARY_BATCH_SIZE):
        batch = papers[batch_start : batch_start + SUMMARY_BATCH_SIZE]
        log.info(
            "Summarizing batch %d–%d (%d papers)", batch_start + 1, batch_start + len(batch), len(batch)
        )
        call_count += 1
        try:
            content = _call_openai_with_retry(
                client,
                model=SUMMARY_MODEL,
                messages=[
                    {"role": "system", "content": SUMMARY_SYSTEM_MESSAGE},
                    {"role": "user", "content": _build_summary_prompt(batch, user_config, owner_mode=owner_mode)},
                ],
                temperature=SUMMARY_TEMPERATURE,
            )
            result = json.loads(content)
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
                "OpenAI summarization failed for batch starting at %d after all retries: %s",
                batch_start, exc, exc_info=True,
            )
            for paper in batch:
                summaries[_arxiv_id(paper)] = _fallback_summary(paper)

    return summaries, call_count


# ── public entry point ─────────────────────────────────────────────────────────


def rank_papers(
    papers: list[dict],
    user_config: dict,
    use_batch: bool = False,
    owner_mode: bool = False,
) -> list[dict]:
    """Score *papers* for *user_config* using GPT-4o-mini.

    Processing pipeline per user:
      1. Shortlist  — topic-overlap filter, Python-only, no LLM
      2. Cache      — load any previous scores+summaries for candidates
      3. Scoring    — LLM pass 1: score/include only for cache misses
      4. Summarize  — LLM pass 2: summaries for papers that passed threshold

    When use_batch=True the LLM calls go through the OpenAI Batch API
    (50% cost, ~minutes latency). Use for scheduled runs.
    When use_batch=False the calls are synchronous. Use for on-demand runs.

    When owner_mode=True the opportunity-scouting rubric and prompt templates
    are used instead of the default developer/ML-practitioner ones.  The cache
    key is automatically separated so owner scores never collide with standard
    scores for the same user and paper.

    Results are cached per user, fetch date, and profile hash.
    """
    if not papers:
        return []

    n_total = len(papers)
    user_id = user_config.get("user_id")
    fetch_date = papers[0].get("fetch_date")
    profile_hash = _profile_hash(user_config, owner_mode=owner_mode)
    client = OpenAI(
        api_key=os.environ["OPENAI_API_KEY"],
        max_retries=OPENAI_MAX_RETRIES,
        timeout=OPENAI_TIMEOUT_SECONDS,
    )

    # ── Phase 0: shortlist by topic overlap ───────────────────────────────────
    candidates = _shortlist_papers(papers, user_config)

    scored: list[dict] = []
    cache_rows_to_upsert: list[dict] = []
    papers_to_score: list[dict] = []
    papers_to_summarize: list[dict] = []

    # ── Phase 1: classify candidates against the cache ────────────────────────
    cached_rows = None
    if user_id and fetch_date:
        cached_rows = _load_cached_rankings(
            user_id, fetch_date, profile_hash, [_arxiv_id(p) for p in candidates]
        )

    cache_hits = 0
    cached_rejections = 0
    cached_complete = 0

    for paper in candidates:
        cached = cached_rows.get(_arxiv_id(paper)) if cached_rows is not None else None
        if not cached or cached.get("score") is None:
            papers_to_score.append(paper)
            continue

        cache_hits += 1
        score = _coerce_score(cached.get("score"))
        base = {
            **paper,
            "score": score,
            "include": score >= SCORE_THRESHOLD,  # recompute — don't trust cached flag
        }

        if not base["include"]:
            cached_rejections += 1
            continue

        if _has_complete_summary(cached):
            cached_complete += 1
            scored.append(
                {**base, **{field: cached.get(field) for field in SUMMARY_FIELDS}}
            )
        else:
            papers_to_summarize.append(base)

    log.info(
        "Cache lookup  : %d/%d candidates hit "
        "(%d complete, %d rejected, %d score-only, %d misses)",
        cache_hits,
        len(candidates),
        cached_complete,
        cached_rejections,
        len(papers_to_summarize),
        len(papers_to_score),
    )

    # ── Phase 2: score cache misses ───────────────────────────────────────────
    batch_label = (user_id or "anon")[:16]
    if use_batch:
        try:
            score_map, n_score_calls = _score_batches_batch_api(
                papers_to_score, user_config, client, batch_label, owner_mode=owner_mode
            )
        except (TimeoutError, RuntimeError) as batch_exc:
            # Batch API timed out or failed (e.g. OpenAI queue backlog).
            # Fall back to synchronous calls so the user still gets a digest.
            log.warning(
                "Batch scoring failed (%s) — falling back to synchronous API", batch_exc
            )
            score_map, n_score_calls = _score_batches(
                papers_to_score, user_config, client, owner_mode=owner_mode
            )
    else:
        score_map, n_score_calls = _score_batches(
            papers_to_score, user_config, client, owner_mode=owner_mode
        )

    newly_passing = 0
    for paper in papers_to_score:
        ranking = score_map.get(_arxiv_id(paper), {"score": 0.0, "include": False})
        score = _coerce_score(ranking.get("score"))
        base = {
            **paper,
            "score": score,
            "include": score >= SCORE_THRESHOLD,  # recompute — don't trust LLM flag
        }
        if base["include"]:
            newly_passing += 1
            papers_to_summarize.append(base)
        elif user_id and fetch_date:
            cache_rows_to_upsert.append(
                _build_cache_row(user_id, fetch_date, profile_hash, paper, base)
            )

    baseline_score_calls = math.ceil(n_total / SCORE_BATCH_SIZE) if n_total else 0
    score_calls_saved = baseline_score_calls - n_score_calls

    log.info(
        "Scoring       : %d LLM call(s) for %d papers "
        "(%d call(s) saved vs cold baseline, %d newly passed threshold)",
        n_score_calls,
        len(papers_to_score),
        score_calls_saved,
        newly_passing,
    )

    # ── Phase 3: summarize passing papers not fully in cache ──────────────────
    if use_batch:
        try:
            summaries, n_summary_calls = _summarize_batches_batch_api(
                papers_to_summarize, user_config, client, batch_label, owner_mode=owner_mode
            )
        except (TimeoutError, RuntimeError) as batch_exc:
            log.warning(
                "Batch summarisation failed (%s) — falling back to synchronous API", batch_exc
            )
            summaries, n_summary_calls = _summarize_batches(
                papers_to_summarize, user_config, client, owner_mode=owner_mode
            )
    else:
        summaries, n_summary_calls = _summarize_batches(
            papers_to_summarize, user_config, client, owner_mode=owner_mode
        )

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
        "(%d served from cache)",
        n_summary_calls,
        len(papers_to_summarize),
        cached_complete,
    )

    if user_id and fetch_date:
        _save_cached_rankings(cache_rows_to_upsert)

    # ── Final tally ───────────────────────────────────────────────────────────
    total_llm_calls = n_score_calls + n_summary_calls
    papers_zero_cost = cached_complete + cached_rejections

    log.info(
        "Total         : %d LLM call(s) | ~%d call(s) saved by shortlist+cache "
        "| %d/%d candidates zero-LLM | %d/%d passed (from %d fetched)",
        total_llm_calls,
        score_calls_saved,
        papers_zero_cost,
        len(candidates),
        len(scored),
        len(candidates),
        n_total,
    )

    scored.sort(key=lambda paper: float(paper.get("score", 0)), reverse=True)
    return scored
