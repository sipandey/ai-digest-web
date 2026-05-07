"""
pipeline_config.py — All tunable parameters, prompts, and rubrics for the AI Digest pipeline.

Edit this file to change:
  - Which arXiv categories and keyword groups are fetched
  - Which OpenAI models are used and at what temperature
  - The scoring rubric and which criteria are active by default
  - The score threshold for inclusion
  - The full text of every LLM prompt
  - Batch sizes, cache settings, and API timeouts
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ARXIV FETCH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# arXiv primary categories to fetch from.
# Full list: https://arxiv.org/category_taxonomy
ARXIV_CATEGORIES: list[str] = ["cs.LG", "cs.CL", "cs.IR", "cs.AI", "cs.CV"]

# Maximum papers to pull per category per day.
#
# IMPORTANT: keep this at or below ARXIV_CLIENT_PAGE_SIZE (100).
# arXiv's API returns results in pages of up to 100 entries.  Requesting
# more than 100 triggers a second HTTP request mid-category, which reliably
# produces a 429 (Too Many Requests) from arXiv's rate limiter — even with
# the 5-second inter-page delay — because we are already making five
# back-to-back category requests with only a 12-second gap between them.
# Staying within one page per category avoids all mid-category pagination
# and eliminates this failure mode entirely.
MAX_RESULTS_PER_CATEGORY: int = 100

# Number of author names to store per paper (rest are truncated).
MAX_AUTHORS_DISPLAYED: int = 5

# arXiv API client settings.
ARXIV_CLIENT_PAGE_SIZE: int = 100
ARXIV_CLIENT_DELAY_SECONDS: float = 10.0  # delay between pages (only relevant if MAX_RESULTS_PER_CATEGORY > PAGE_SIZE)
ARXIV_CLIENT_NUM_RETRIES: int = 3
# Seconds to sleep between finishing one arXiv category and starting the next.
# Without this, consecutive category fetches arrive too rapidly and arXiv
# rate-limits the next request (HTTP 429).
ARXIV_INTER_CATEGORY_DELAY_SECONDS: float = 15.0

# 429 retry settings for the application-level backoff wrapper in fetcher.py.
# When arXiv returns 429 (even after the library's own retries are exhausted),
# the fetcher sleeps for ARXIV_429_BASE_DELAY * 2^attempt seconds before
# re-running the entire search for that category.
ARXIV_429_MAX_RETRIES: int = 3          # total application-level retries per category
ARXIV_429_BASE_DELAY_SECONDS: int = 90  # 90 s → 180 s → 360 s

# Seconds to wait and re-check the cache after a miss before crawling arXiv.
# If two user pipelines start simultaneously, one will populate the cache
# while the other sleeps — the re-check then returns the cached data,
# avoiding a redundant crawl. Set to 0 to disable.
FETCH_CONCURRENT_RETRY_DELAY_SECONDS: int = 5

# Publication-date window. Monday and the day after a holiday often have
# weekend/holiday submissions — widen the window so they aren't missed.
WEEKDAY_WINDOW_DAYS: int = 1   # Mon–Sat runs
WEEKEND_WINDOW_DAYS: int = 2   # Sunday and Monday runs (weekday indices 6, 0)

# Keyword groups used to classify papers and assign a matched_group label.
# Each entry is (group_name, [keywords]). Order matters — first match wins.
# These groups also appear as suggested topics in the web onboarding UI.
KEYWORD_GROUPS: list[tuple[str, list[str]]] = [
    (
        "RAG and retrieval",
        [
            "rag",
            "retrieval augmented",
            "retrieval-augmented",
            "dense retrieval",
            "vector database",
            "semantic search",
            "knowledge retrieval",
            "embedding",
            "similarity search",
            "question answering",
            "document understanding",
        ],
    ),
    (
        "AI agents and automation",
        [
            "ai agent",
            "agentic",
            "autonomous agent",
            "multi-agent",
            "agent framework",
            "tool use",
            "tool calling",
            "function calling",
            "workflow automation",
            "task planning",
            "code assistant",
        ],
    ),
    (
        "LLM applications and fine-tuning",
        [
            "large language model",
            "llm",
            "instruction tuning",
            "rlhf",
            "fine-tuning",
            "prompt engineering",
            "prompt tuning",
            "in-context learning",
            "few-shot",
            "chain of thought",
            "structured output",
            "hallucination",
            "grounding",
            "context window",
        ],
    ),
    (
        "Multimodal AI",
        [
            "multimodal",
            "vision language",
            "vision-language",
            "image text",
            "visual question answering",
            "text to image",
            "video understanding",
            "video language",
            "audio",
            "speech recognition",
            "document ai",
        ],
    ),
    (
        "AI safety and alignment",
        [
            "ai safety",
            "alignment",
            "jailbreak",
            "red teaming",
            "constitutional ai",
            "truthfulness",
            "interpretability",
            "explainability",
            "robustness",
        ],
    ),
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LLM MODELS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# OpenAI model used for scoring papers. Needs JSON mode support.
SCORE_MODEL: str = "gpt-4o-mini"

# OpenAI model used for generating summaries. Can differ from SCORE_MODEL.
SUMMARY_MODEL: str = "gpt-4o-mini"

# Temperature for scoring (0 = deterministic, consistent scores across runs).
SCORE_TEMPERATURE: float = 0.0

# Temperature for summarisation (slight variation produces more natural prose).
SUMMARY_TEMPERATURE: float = 0.2


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PIPELINE THRESHOLDS AND BATCH SIZES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Maximum papers passed to the LLM per user per day (after shortlisting).
# Raising this increases LLM cost; lowering it may miss relevant papers.
MAX_SHORTLIST: int = 40

# Papers per LLM call in the scoring phase.
# gpt-4o-mini handles 40 abstracts comfortably in one context window.
SCORE_BATCH_SIZE: int = 40

# Papers per LLM call in the summarisation phase.
# Smaller batches reduce the risk of the model truncating outputs.
SUMMARY_BATCH_SIZE: int = 12

# Minimum overall score (out of 10) for a paper to appear in the digest.
# Raise this for a tighter, higher-quality digest.
# Lower it if too few papers are passing.
SCORE_THRESHOLD: float = 7.0

# Maximum characters of abstract sent to the scoring prompt.
# Full abstract is sent to the summarisation prompt (for richer summaries).
SCORE_ABSTRACT_MAX_CHARS: int = 400


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OPENAI RETRY / TIMEOUT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# SDK-level retries per request (handles 429, 500, 502, 503, 504 automatically).
# The SDK uses its own exponential backoff between these attempts.
OPENAI_MAX_RETRIES: int = 3

# Per-request timeout (seconds) passed to the OpenAI client.
OPENAI_TIMEOUT_SECONDS: int = 120

# Application-level retry attempts wrapping the SDK call in the synchronous
# pipeline path. Catches JSON parse failures and errors the SDK didn't retry
# (e.g. empty choices list, malformed response body).
OPENAI_CALL_MAX_RETRIES: int = 3

# Maximum wait (seconds) between application-level retry attempts.
# Actual wait grows as 2^attempt (2s, 4s, 8s, …) capped at this value.
OPENAI_RETRY_MAX_WAIT_SECONDS: int = 60


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OPENAI BATCH API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Seconds between status polls when waiting for a batch job to complete.
BATCH_POLL_INTERVAL: int = 30

# Maximum seconds to wait for a batch job before raising TimeoutError.
# OpenAI's SLA is 24 hours but typical small jobs complete in 1–10 minutes.
# Set to 1800s (30 min) so that a stalled batch falls back to the synchronous
# path quickly — the user's digest arrives at most 30 min late instead of
# failing entirely. Do NOT raise this above ~1800 without also accepting that
# the GitHub Actions job (and the user's dashboard "running" state) will be
# blocked for the full duration before the sync fallback fires.
BATCH_TIMEOUT: int = 1_800


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CACHE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Supabase table that stores per-user, per-paper scores and summaries.
CACHE_TABLE: str = "paper_rankings_cache"

# Number of arxiv_ids passed in a single Supabase IN query.
CACHE_QUERY_CHUNK_SIZE: int = 100

# Increment this whenever the scoring or summary prompts change in a way that
# makes old cached values incompatible with the new output format.
# Old cache rows are ignored (not deleted) — they simply won't match the query.
PROMPT_VERSION: int = 2


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SHORTLIST (pre-LLM topic-overlap filter)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Additive overlap scores per match location. Higher = stronger signal.
SHORTLIST_TITLE_WEIGHT: int = 3    # keyword found in paper title
SHORTLIST_GROUP_WEIGHT: int = 2    # keyword found in matched_group label
SHORTLIST_ABSTRACT_WEIGHT: int = 1 # keyword found in abstract

# Common words filtered out before extracting keywords from user topics.
SHORTLIST_STOPWORDS: frozenset[str] = frozenset({
    "about", "also", "and", "are", "based", "been", "but", "can",
    "for", "from", "have", "how", "into", "its", "more", "not",
    "that", "the", "their", "then", "than", "this", "using", "via",
    "when", "which", "will", "with", "what",
})

# Minimum word length to be kept as a keyword (filters short noise words).
SHORTLIST_MIN_KEYWORD_LENGTH: int = 3


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SCORING RUBRIC
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Criteria the LLM scores each paper on (1–10 each).
# Descriptions support {topics} and {level_desc} format placeholders.
# To add a new criterion: add it here AND to DEFAULT_ACTIVE_CRITERIA below.
SCORING_CRITERIA: dict[str, str] = {
    "builder_relevance": (
        "How directly useful is this for someone building or learning about {topics}?"
    ),
    "understandability": (
        "How accessible is this paper for {level_desc}?"
    ),
    "real_world_grounding": (
        "Does it include practical results, benchmarks, or released code?"
    ),
    "novelty_timing": (
        "Is this a meaningful advance worth reading about right now?"
    ),
}

# Criteria used when a user has no custom scoring_priorities configured.
# Must be a subset of SCORING_CRITERIA keys.
DEFAULT_ACTIVE_CRITERIA: list[str] = [
    "builder_relevance",
    "understandability",
    "real_world_grounding",
    "novelty_timing",
]

# Human-readable description of each experience level.
# Used in both the scoring and summary prompts.
LEVEL_DESCRIPTIONS: dict[str, str] = {
    "beginner": "a complete beginner just starting with AI",
    "developer_learning_ai": "a developer who can code well but is learning ML concepts",
    "practitioner": "a practitioner already building AI systems regularly",
    "ml_engineer": "an ML engineer who trains models and does deep ML work",
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUMMARY OUTPUT FIELD WORD LIMITS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Maximum word count the LLM is instructed to use for each summary field.
# These values are injected directly into the summary prompt.
SUMMARY_FIELD_WORD_LIMITS: dict[str, int] = {
    "problem":          100,   # 2 sentences — what problem the paper solves
    "approach":         100,   # 2 sentences — how they solved it, plain language
    "results":          100,   # 2 sentences — what they found, practical meaning of numbers
    "builder_takeaway": 80,   # 1 sentence  — single actionable thing a developer can do
    "learning_path":    50,   # 1 sentence  — prerequisite concept or "no prerequisites"
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LLM PROMPTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Placeholders filled by ranker.py at runtime:
#
#   SCORE_PROMPT_TEMPLATE:
#     {profile}             — user's plain-English project description
#     {level_desc}          — human-readable experience level string
#     {topics_str}          — comma-joined list of user topics
#     {rubric_lines}        — formatted rubric criteria block (built from SCORING_CRITERIA)
#     {active_criteria_str} — comma-joined active criterion keys
#     {score_threshold}     — SCORE_THRESHOLD value
#     {papers_text}         — formatted block of paper metadata
#
#   SUMMARY_PROMPT_TEMPLATE:
#     {profile}             — same as above
#     {level_desc}          — same as above
#     {topics_str}          — same as above
#     {problem_words}       — word limit for the problem field
#     {approach_words}      — word limit for the approach field
#     {results_words}       — word limit for the results field
#     {builder_takeaway_words} — word limit for builder_takeaway
#     {learning_path_words} — word limit for learning_path
#     {papers_text}         — formatted block of paper metadata

SCORE_SYSTEM_MESSAGE: str = (
    "You are a research paper scoring assistant. Respond only with valid JSON."
)

SCORE_PROMPT_TEMPLATE: str = """\
You are scoring arXiv papers for a specific user. Be concise and accurate.

USER PROFILE:
{profile}

Experience level: {level_desc}
Topics of interest: {topics_str}

SCORING RUBRIC — score each criterion 1–10:
{rubric_lines}

Compute OVERALL SCORE as the average of the active criteria: {active_criteria_str}.
A paper is included in the digest if overall score >= {score_threshold}.

For EACH paper provide:
- arxiv_id (copy from input)
- score (float, 1 decimal place)
- include (true if score >= {score_threshold}, else false)

Do not provide explanations or extra fields.

PAPERS:
{papers_text}
Respond with ONLY valid JSON in this exact shape:
{{"papers": [{{"arxiv_id": "...", "score": 0.0, "include": true}}]}}"""


SUMMARY_SYSTEM_MESSAGE: str = (
    "You prepare concise paper summaries. Respond only with valid JSON."
)

SUMMARY_PROMPT_TEMPLATE: str = """\
You are preparing digest summaries for papers already selected for a specific user.
Write for a developer who wants to understand and apply research — not an academic audience.

USER PROFILE:
{profile}

Experience level: {level_desc}
Topics of interest: {topics_str}

For EACH paper provide exactly these fields:

- arxiv_id  (copy from input, unchanged)
- problem   (2 sentences, <={problem_words} words)
            What real-world or technical problem does this paper address?
            Explain it plainly — avoid jargon, assume the reader is smart but not a domain expert.
- approach  (2 sentences, <={approach_words} words)
            What did the authors actually do or build to solve it?
            Describe the method or technique in plain language; skip acronyms unless essential.
- results   (2 sentences, <={results_words} words)
            What did they find or achieve? Lead with the headline number or improvement.
            Then explain what that number means in practice — why should a developer care?
- builder_takeaway  (1 sentence, <={builder_takeaway_words} words)
            The single most useful thing a developer building AI applications can take away
            or directly apply from this paper. Start with an action verb (e.g. "Use…", "Replace…", "Try…").
- learning_path  (1 sentence, <={learning_path_words} words)
            What concept should the reader understand before diving into this paper?
            If no prerequisites are needed, say "No prerequisites — start here."

PAPERS:
{papers_text}
Respond with ONLY valid JSON in this exact shape:
{{"papers": [{{"arxiv_id": "...", "problem": "...", "approach": "...", "results": "...", "builder_takeaway": "...", "learning_path": "..."}}]}}"""
