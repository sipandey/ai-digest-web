import json
import logging
import os

from openai import OpenAI

log = logging.getLogger(__name__)

BATCH_SIZE = 20  # papers per OpenAI call — keeps prompt within token budget

LEVEL_DESCRIPTIONS: dict[str, str] = {
    "beginner": "a complete beginner just starting with AI",
    "developer_learning_ai": "a developer who can code well but is learning ML concepts",
    "practitioner": "a practitioner already building AI systems regularly",
    "ml_engineer": "an ML engineer who trains models and does deep ML work",
}


def _build_prompt(papers: list[dict], user_config: dict) -> str:
    profile = user_config.get("profile_description", "")
    level = user_config.get("experience_level", "developer_learning_ai")
    topics = user_config.get("topics") or []
    priorities = user_config.get("scoring_priorities") or {}

    level_desc = LEVEL_DESCRIPTIONS.get(level, level)
    topics_str = ", ".join(topics) if topics else "general AI/ML"

    # Determine which criteria are active
    active_criteria = [k for k, v in priorities.items() if v]
    if not active_criteria:
        active_criteria = ["builder_relevance", "understandability", "real_world_grounding", "novelty_timing"]

    papers_text = ""
    for i, p in enumerate(papers, 1):
        abstract = (p.get("abstract") or "")[:600]
        papers_text += (
            f"\nPaper {i}:\n"
            f"ID: {p['arxiv_id']}\n"
            f"Title: {p['title']}\n"
            f"Abstract: {abstract}\n"
            f"Category: {p.get('category', '')}\n"
            f"Group: {p.get('matched_group', '')}\n"
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
- problem (≤15 words: what specific problem does it address?)
- approach (≤15 words: how does it solve it?)
- results (≤15 words: key result or benchmark number)
- builder_takeaway (≤20 words: one concrete thing this user can DO with this paper)
- learning_path (≤15 words: what should this user understand before reading it?)

PAPERS:
{papers_text}

Respond with ONLY valid JSON in this exact shape:
{{"papers": [{{"arxiv_id": "...", "score": 0.0, "include": true, "problem": "...", "approach": "...", "results": "...", "builder_takeaway": "...", "learning_path": "..."}}]}}"""


def rank_papers(papers: list[dict], user_config: dict) -> list[dict]:
    """Score *papers* for *user_config* using GPT-4o-mini.

    Returns papers with score >= 7.0, sorted descending by score.
    """
    if not papers:
        return []

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    scored: list[dict] = []

    for batch_start in range(0, len(papers), BATCH_SIZE):
        batch = papers[batch_start : batch_start + BATCH_SIZE]
        log.info("Scoring batch %d–%d", batch_start + 1, batch_start + len(batch))

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a research paper scoring assistant. Respond only with valid JSON.",
                    },
                    {"role": "user", "content": _build_prompt(batch, user_config)},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )

            result = json.loads(response.choices[0].message.content)
            gpt_papers = result.get("papers", [])

            # Index GPT output by arxiv_id
            score_map = {p["arxiv_id"]: p for p in gpt_papers}

            for paper in batch:
                gpt = score_map.get(paper["arxiv_id"], {})
                if gpt.get("include") and float(gpt.get("score", 0)) >= 7.0:
                    scored.append({**paper, **gpt})

        except Exception as exc:
            log.error(
                "OpenAI scoring failed for batch starting at %d: %s",
                batch_start,
                exc,
                exc_info=True,
            )
            # Continue with remaining batches rather than aborting the user's run

    scored.sort(key=lambda p: float(p.get("score", 0)), reverse=True)
    log.info("%d / %d papers passed scoring threshold", len(scored), len(papers))
    return scored
