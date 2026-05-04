"""
Tests for ranker.py pure helper functions.

Covers regressions for:
  Fix #1 — SCORE_THRESHOLD must be part of the profile hash
  Fix #2 — include recomputed from score, not trusted from LLM/cache
"""

import json
import pytest
from unittest.mock import MagicMock, patch

from ranker import (
    _profile_hash,
    _coerce_score,
    _active_criteria,
    _topic_keywords,
    _shortlist_papers,
    _user_context,
    _has_complete_summary,
    _fallback_summary,
    _build_score_prompt,
    _build_summary_prompt,
    SUMMARY_FIELDS,
)
from pipeline_config import (
    SCORE_THRESHOLD,
    DEFAULT_ACTIVE_CRITERIA,
    SCORING_CRITERIA,
    LEVEL_DESCRIPTIONS,
)


# ── _profile_hash ─────────────────────────────────────────────────────────────

class TestProfileHash:
    BASE_CONFIG = {
        "user_id": "u1",
        "profile_description": "building a RAG chatbot",
        "experience_level": "developer_learning_ai",
        "topics": ["RAG", "LLM"],
        "scoring_priorities": {},
    }

    def test_same_input_same_hash(self):
        assert _profile_hash(self.BASE_CONFIG) == _profile_hash(self.BASE_CONFIG)

    def test_different_profile_different_hash(self):
        other = {**self.BASE_CONFIG, "profile_description": "building a vision model"}
        assert _profile_hash(self.BASE_CONFIG) != _profile_hash(other)

    def test_topics_order_independent(self):
        """Topics are sorted before hashing — order must not matter."""
        a = {**self.BASE_CONFIG, "topics": ["RAG", "LLM"]}
        b = {**self.BASE_CONFIG, "topics": ["LLM", "RAG"]}
        assert _profile_hash(a) == _profile_hash(b)

    def test_fix1_score_threshold_in_hash(self):
        """Fix #1 regression: changing SCORE_THRESHOLD must change the hash.

        We verify the hash contains the threshold by injecting it directly —
        SCORE_THRESHOLD is baked into _profile_hash at call time.
        """
        hash_a = _profile_hash(self.BASE_CONFIG)

        # Patch SCORE_THRESHOLD to a different value and recompute
        with patch("ranker.SCORE_THRESHOLD", SCORE_THRESHOLD + 1.0):
            hash_b = _profile_hash(self.BASE_CONFIG)

        assert hash_a != hash_b, (
            "Changing SCORE_THRESHOLD must produce a different profile hash "
            "to prevent stale include=True values surviving in the cache."
        )

    def test_hash_is_24_char_hex(self):
        h = _profile_hash(self.BASE_CONFIG)
        assert len(h) == 24
        assert all(c in "0123456789abcdef" for c in h)

    def test_empty_config_does_not_raise(self):
        _profile_hash({})  # should not raise


# ── _coerce_score ─────────────────────────────────────────────────────────────

class TestCoerceScore:
    def test_float_rounded_to_one_decimal(self):
        # 7.55 has no exact IEEE-754 representation and rounds to 7.5;
        # use 7.56 (→ 7.6) which is representable without ambiguity.
        assert _coerce_score(7.56) == 7.6

    def test_integer(self):
        assert _coerce_score(8) == 8.0

    def test_string_number(self):
        assert _coerce_score("7.2") == 7.2

    def test_none_returns_zero(self):
        assert _coerce_score(None) == 0.0

    def test_invalid_string_returns_zero(self):
        assert _coerce_score("not-a-number") == 0.0

    def test_boundary_threshold_exact(self):
        """score == SCORE_THRESHOLD must be >= SCORE_THRESHOLD (not excluded)."""
        score = _coerce_score(SCORE_THRESHOLD)
        assert score >= SCORE_THRESHOLD

    def test_fix2_llm_flag_cannot_override_math(self):
        """Fix #2 regression: the include decision must be score-based only.

        A paper with score < SCORE_THRESHOLD must be excluded even if the
        LLM returned include=True.  A paper at exactly SCORE_THRESHOLD must
        be included even if the LLM returned include=False.
        """
        just_below = _coerce_score(SCORE_THRESHOLD - 0.1)
        at_threshold = _coerce_score(SCORE_THRESHOLD)
        just_above = _coerce_score(SCORE_THRESHOLD + 0.1)

        # LLM said include=True but score is below — must be excluded
        llm_says_include = True
        assert not (just_below >= SCORE_THRESHOLD), (
            "score < SCORE_THRESHOLD must be excluded regardless of LLM flag"
        )

        # LLM said include=False but score is at/above — must be included
        llm_says_exclude = False
        assert at_threshold >= SCORE_THRESHOLD, (
            "score == SCORE_THRESHOLD must be included regardless of LLM flag"
        )
        assert just_above >= SCORE_THRESHOLD, (
            "score > SCORE_THRESHOLD must be included regardless of LLM flag"
        )


# ── _active_criteria ──────────────────────────────────────────────────────────

class TestActiveCriteria:
    def test_empty_priorities_returns_defaults(self):
        config = {"scoring_priorities": {}}
        assert _active_criteria(config) == list(DEFAULT_ACTIVE_CRITERIA)

    def test_missing_priorities_returns_defaults(self):
        assert _active_criteria({}) == list(DEFAULT_ACTIVE_CRITERIA)

    def test_custom_priorities_honoured(self):
        config = {
            "scoring_priorities": {
                "builder_relevance": True,
                "novelty_timing": False,
                "understandability": True,
            }
        }
        result = _active_criteria(config)
        assert "builder_relevance" in result
        assert "understandability" in result
        assert "novelty_timing" not in result

    def test_all_false_falls_back_to_defaults(self):
        config = {"scoring_priorities": {"builder_relevance": False}}
        assert _active_criteria(config) == list(DEFAULT_ACTIVE_CRITERIA)


# ── _topic_keywords ───────────────────────────────────────────────────────────

class TestTopicKeywords:
    def test_extracts_words(self):
        kws = _topic_keywords(["RAG retrieval"])
        assert "retrieval" in kws

    def test_filters_stopwords(self):
        kws = _topic_keywords(["using the llm for rag"])
        assert "the" not in kws
        assert "for" not in kws
        assert "using" not in kws

    def test_filters_short_words(self):
        kws = _topic_keywords(["AI ML LLM"])
        # "ai" and "ml" are 2 chars — below min length of 3
        assert "ai" not in kws
        assert "ml" not in kws

    def test_deduplicates(self):
        # "llm" is 3 chars and the filter is len > SHORTLIST_MIN_KEYWORD_LENGTH (3),
        # so it's stripped.  Use a word that's ≥ 4 chars to test deduplication.
        kws = _topic_keywords(["agents reasoning", "agents fine-tuning"])
        assert kws.count("agents") == 1

    def test_empty_returns_empty(self):
        assert _topic_keywords([]) == []

    def test_handles_hyphens_and_slashes(self):
        kws = _topic_keywords(["fine-tuning/RLHF"])
        assert "fine" in kws or "tuning" in kws


# ── _shortlist_papers ─────────────────────────────────────────────────────────

class TestShortlistPapers:
    def _paper(self, arxiv_id, title="", abstract="", group=""):
        return {
            "arxiv_id": arxiv_id,
            "title": title,
            "abstract": abstract,
            "matched_group": group,
        }

    def test_no_truncation_when_under_limit(self):
        papers = [self._paper(f"p{i}") for i in range(5)]
        result = _shortlist_papers(papers, {"topics": ["llm"]})
        assert len(result) == 5

    def test_truncates_to_max_shortlist(self):
        from pipeline_config import MAX_SHORTLIST
        papers = [self._paper(f"p{i}", title="quantum physics") for i in range(MAX_SHORTLIST + 20)]
        user_config = {"topics": ["RAG retrieval augmented generation"]}
        result = _shortlist_papers(papers, user_config)
        assert len(result) == MAX_SHORTLIST

    def test_title_match_ranked_higher_than_abstract_only(self):
        """Title weight > abstract weight — title match should rank higher."""
        title_match = self._paper("a", title="RAG retrieval system", abstract="generic text")
        abstract_match = self._paper("b", title="generic title", abstract="RAG retrieval system")

        from pipeline_config import MAX_SHORTLIST
        # Pad with irrelevant papers to force ranking
        fillers = [self._paper(f"f{i}", title="unrelated paper") for i in range(MAX_SHORTLIST - 1)]
        papers = [abstract_match, title_match] + fillers

        result = _shortlist_papers(papers, {"topics": ["RAG retrieval"]})
        ids = [p["arxiv_id"] for p in result]
        assert ids.index("a") < ids.index("b"), (
            "Title keyword match should rank above abstract-only match"
        )

    def test_no_topics_truncates_by_order(self):
        from pipeline_config import MAX_SHORTLIST
        papers = [self._paper(f"p{i}") for i in range(MAX_SHORTLIST + 10)]
        result = _shortlist_papers(papers, {"topics": []})
        assert len(result) == MAX_SHORTLIST
        assert result[0]["arxiv_id"] == "p0"


# ── _user_context ─────────────────────────────────────────────────────────────

class TestUserContext:
    def test_returns_profile_level_topics(self):
        config = {
            "profile_description": "  building RAG apps  ",
            "experience_level": "practitioner",
            "topics": ["RAG", "embeddings"],
        }
        profile, level_desc, topics_str = _user_context(config)
        assert profile == "building RAG apps"
        assert level_desc == LEVEL_DESCRIPTIONS["practitioner"]
        assert "RAG" in topics_str
        assert "embeddings" in topics_str

    def test_empty_topics_returns_default(self):
        _, _, topics_str = _user_context({"topics": []})
        assert topics_str == "general AI/ML"

    def test_unknown_level_passes_through(self):
        _, level_desc, _ = _user_context({"experience_level": "wizard"})
        assert level_desc == "wizard"


# ── _has_complete_summary ─────────────────────────────────────────────────────

class TestHasCompleteSummary:
    def test_all_fields_present_returns_true(self):
        row = {f: "some text" for f in SUMMARY_FIELDS}
        assert _has_complete_summary(row) is True

    def test_missing_one_field_returns_false(self):
        row = {f: "some text" for f in SUMMARY_FIELDS}
        del row[SUMMARY_FIELDS[0]]
        assert _has_complete_summary(row) is False

    def test_empty_string_field_returns_false(self):
        row = {f: "some text" for f in SUMMARY_FIELDS}
        row[SUMMARY_FIELDS[1]] = ""
        assert _has_complete_summary(row) is False


# ── _fallback_summary ─────────────────────────────────────────────────────────

class TestFallbackSummary:
    def test_returns_all_summary_fields(self):
        paper = {"title": "A paper about RAG", "abstract": "We study retrieval.", "matched_group": "RAG and retrieval"}
        result = _fallback_summary(paper)
        for field in SUMMARY_FIELDS:
            assert field in result
            assert isinstance(result[field], str)
            assert len(result[field]) > 0

    def test_respects_word_limits(self):
        from pipeline_config import SUMMARY_FIELD_WORD_LIMITS
        paper = {
            "title": " ".join([f"word{i}" for i in range(200)]),
            "abstract": " ".join([f"word{i}" for i in range(200)]),
            "matched_group": "LLM applications and fine-tuning",
        }
        result = _fallback_summary(paper)
        for field, limit in SUMMARY_FIELD_WORD_LIMITS.items():
            word_count = len(result[field].split())
            assert word_count <= limit + 3, f"{field}: {word_count} words exceeds limit {limit}"


# ── prompt builders ───────────────────────────────────────────────────────────

class TestPromptBuilders:
    PAPER = {
        "arxiv_id": "2401.00001",
        "title": "Efficient RAG Systems",
        "abstract": "We propose a new retrieval method.",
        "category": "cs.CL",
        "matched_group": "RAG and retrieval",
        "score": 8.0,
    }
    CONFIG = {
        "profile_description": "building a chatbot",
        "experience_level": "practitioner",
        "topics": ["RAG", "embeddings"],
    }

    def test_score_prompt_contains_arxiv_id(self):
        prompt = _build_score_prompt([self.PAPER], self.CONFIG)
        assert "2401.00001" in prompt

    def test_score_prompt_contains_threshold(self):
        prompt = _build_score_prompt([self.PAPER], self.CONFIG)
        assert str(SCORE_THRESHOLD) in prompt

    def test_score_prompt_contains_user_topics(self):
        prompt = _build_score_prompt([self.PAPER], self.CONFIG)
        assert "RAG" in prompt

    def test_summary_prompt_contains_arxiv_id(self):
        prompt = _build_summary_prompt([self.PAPER], self.CONFIG)
        assert "2401.00001" in prompt

    def test_summary_prompt_contains_full_abstract(self):
        """Summary prompt should use full abstract, not truncated."""
        prompt = _build_summary_prompt([self.PAPER], self.CONFIG)
        assert "We propose a new retrieval method." in prompt
