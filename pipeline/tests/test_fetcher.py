"""
Tests for fetcher.py.

Covers regressions for:
  Fix #6 — sleep-and-recheck after cache miss to avoid concurrent arXiv crawls
"""

from datetime import date
from unittest.mock import MagicMock, patch, call

import pytest

from fetcher import _window_days, _matched_group, fetch_papers
from pipeline_config import (
    WEEKDAY_WINDOW_DAYS,
    WEEKEND_WINDOW_DAYS,
    FETCH_CONCURRENT_RETRY_DELAY_SECONDS,
)


# ── _window_days ──────────────────────────────────────────────────────────────

class TestWindowDays:
    def test_monday_uses_wider_window(self):
        assert _window_days(date(2024, 1, 1)) == WEEKEND_WINDOW_DAYS  # Monday

    def test_sunday_uses_wider_window(self):
        assert _window_days(date(2024, 1, 7)) == WEEKEND_WINDOW_DAYS  # Sunday

    def test_tuesday_uses_normal_window(self):
        assert _window_days(date(2024, 1, 2)) == WEEKDAY_WINDOW_DAYS  # Tuesday

    def test_wednesday_uses_normal_window(self):
        assert _window_days(date(2024, 1, 3)) == WEEKDAY_WINDOW_DAYS  # Wednesday

    def test_friday_uses_normal_window(self):
        assert _window_days(date(2024, 1, 5)) == WEEKDAY_WINDOW_DAYS  # Friday

    def test_saturday_uses_normal_window(self):
        assert _window_days(date(2024, 1, 6)) == WEEKDAY_WINDOW_DAYS  # Saturday


# ── _matched_group ────────────────────────────────────────────────────────────

class TestMatchedGroup:
    def _result(self, title="", summary=""):
        r = MagicMock()
        r.title = title
        r.summary = summary
        return r

    def test_rag_keyword_in_title(self):
        assert _matched_group(self._result(title="RAG-based QA system")) == "RAG and retrieval"

    def test_retrieval_augmented_in_abstract(self):
        assert _matched_group(
            self._result(summary="We use retrieval augmented generation")
        ) == "RAG and retrieval"

    def test_agent_keyword_matches_agents_group(self):
        assert _matched_group(
            self._result(title="Autonomous agent for code generation")
        ) == "AI agents and automation"

    def test_llm_keyword_matches_llm_group(self):
        assert _matched_group(
            self._result(title="Large language model instruction tuning")
        ) == "LLM applications and fine-tuning"

    def test_multimodal_keyword_matches(self):
        assert _matched_group(
            self._result(title="Multimodal vision language model")
        ) == "Multimodal AI"

    def test_safety_keyword_matches(self):
        # "rlhf" is in the LLM group (checked first), and "LLMs" also triggers
        # it.  Use a title with keywords exclusive to "AI safety and alignment":
        # "constitutional ai" and "alignment" do not appear in earlier groups.
        assert _matched_group(
            self._result(title="Constitutional AI approaches for alignment")
        ) == "AI safety and alignment"

    def test_first_group_wins_on_multiple_matches(self):
        # 'embedding' → RAG group; 'llm' → LLM group; RAG comes first
        result = _matched_group(self._result(title="LLM embedding retrieval"))
        assert result == "RAG and retrieval"

    def test_no_keyword_returns_none(self):
        assert _matched_group(
            self._result(title="Quantum computing for chemistry", summary="We study molecules.")
        ) is None

    def test_case_insensitive(self):
        assert _matched_group(self._result(title="rag RETRIEVAL AUGMENTED system")) is not None


# ── fetch_papers — concurrent retry (Fix #6) ─────────────────────────────────

class TestFetchPapersConcurrentRetry:

    def _make_supabase_response(self, data):
        resp = MagicMock()
        resp.data = data
        return resp

    @patch("fetcher.supabase")
    def test_cache_hit_returns_immediately_no_sleep(self, mock_sb):
        """If the cache already has data, return it without sleeping."""
        papers = [{"arxiv_id": "2401.00001", "fetch_date": "2024-01-01"}]
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = papers

        with patch("fetcher.time.sleep") as mock_sleep:
            result = fetch_papers("2024-01-01")

        mock_sleep.assert_not_called()
        assert result == papers

    @patch("fetcher.supabase")
    def test_cache_miss_then_retry_hits_skips_arxiv(self, mock_sb):
        """Fix #6 regression: after a miss, sleep and recheck before crawling."""
        miss = self._make_supabase_response([])
        hit = self._make_supabase_response([{"arxiv_id": "2401.00001"}])

        # First call = miss, second call (after sleep) = hit
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            miss,
            hit,
        ]

        with patch("fetcher.time.sleep") as mock_sleep, \
             patch("fetcher.arxiv.Client") as mock_arxiv:
            result = fetch_papers("2024-01-01")

        # Must have slept the configured delay
        mock_sleep.assert_called_once_with(FETCH_CONCURRENT_RETRY_DELAY_SECONDS)
        # Must NOT have started an arXiv crawl
        mock_arxiv.assert_not_called()
        # Returns the data found on retry
        assert result == hit.data

    @patch("fetcher.supabase")
    def test_double_miss_proceeds_to_arxiv(self, mock_sb):
        """If both checks miss, the full arXiv crawl must happen."""
        miss = self._make_supabase_response([])

        # Both cache checks miss; upsert after crawl is a no-op mock
        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = miss
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        mock_result = MagicMock()
        mock_result.title = "RAG paper"
        mock_result.summary = "retrieval augmented generation system"
        mock_result.published.date.return_value = date(2024, 1, 1)
        mock_result.entry_id = "http://arxiv.org/abs/2401.00001v1"
        mock_result.authors = []
        mock_result.pdf_url = "https://arxiv.org/pdf/2401.00001"
        mock_result.primary_category = "cs.CL"
        mock_result.categories = ["cs.CL"]

        mock_client_instance = MagicMock()
        mock_client_instance.results.return_value = [mock_result]

        with patch("fetcher.time.sleep"), \
             patch("fetcher.arxiv.Client", return_value=mock_client_instance), \
             patch("fetcher.arxiv.Search"), \
             patch("fetcher.arxiv.SortCriterion"), \
             patch("fetcher.arxiv.SortOrder"):
            result = fetch_papers("2024-01-01")

        mock_client_instance.results.assert_called()
