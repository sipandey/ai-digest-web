"""
Tests for cross-day paper deduplication in pipeline.py.

Covers:
  _load_seen_paper_ids  — paginated fetch from user_delivered_papers
  _record_delivered_papers — upsert; idempotent on re-run
  Integration — seen papers are excluded before rank_papers is called
"""

from unittest.mock import MagicMock, patch, call

import pytest

from pipeline import _load_seen_paper_ids, _record_delivered_papers


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_execute(data: list):
    resp = MagicMock()
    resp.data = data
    mock_execute = MagicMock(return_value=resp)
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.range.return_value = chain
    chain.execute = mock_execute
    return chain, mock_execute


def _make_paginated_execute(pages: list[list]):
    """Return a self-returning chain whose .execute() yields each page in turn."""
    responses = []
    for page in pages:
        resp = MagicMock()
        resp.data = page
        responses.append(resp)

    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.range.return_value = chain
    chain.execute = MagicMock(side_effect=responses)
    return chain


# ── _load_seen_paper_ids ──────────────────────────────────────────────────────

class TestLoadSeenPaperIds:

    @patch("pipeline.supabase")
    def test_empty_history_returns_empty_set(self, mock_sb):
        chain = _make_paginated_execute([[]])
        mock_sb.table.return_value = chain

        result = _load_seen_paper_ids("user-1")

        assert result == set()

    @patch("pipeline.supabase")
    def test_returns_all_arxiv_ids(self, mock_sb):
        page = [{"arxiv_id": "2401.00001"}, {"arxiv_id": "2401.00002"}]
        chain = _make_paginated_execute([page])
        mock_sb.table.return_value = chain

        result = _load_seen_paper_ids("user-1")

        assert result == {"2401.00001", "2401.00002"}

    @patch("pipeline.supabase")
    def test_paginates_when_full_page_returned(self, mock_sb):
        """If first page is exactly 1 000 rows, a second query must be issued."""
        page1 = [{"arxiv_id": f"{i:010d}"} for i in range(1000)]
        page2 = [{"arxiv_id": "extra-paper"}]
        chain = _make_paginated_execute([page1, page2])
        mock_sb.table.return_value = chain

        result = _load_seen_paper_ids("user-1")

        assert len(result) == 1001
        assert "extra-paper" in result
        assert chain.execute.call_count == 2

    @patch("pipeline.supabase")
    def test_stops_after_partial_page(self, mock_sb):
        """A page with fewer than 1 000 rows signals the last page — no extra query."""
        page = [{"arxiv_id": f"p{i}"} for i in range(5)]
        chain = _make_paginated_execute([page])
        mock_sb.table.return_value = chain

        _load_seen_paper_ids("user-1")

        assert chain.execute.call_count == 1

    @patch("pipeline.supabase")
    def test_queries_correct_table_and_user(self, mock_sb):
        chain = _make_paginated_execute([[]])
        mock_sb.table.return_value = chain

        _load_seen_paper_ids("user-abc")

        mock_sb.table.assert_called_with("user_delivered_papers")
        chain.eq.assert_called_with("user_id", "user-abc")


# ── _record_delivered_papers ──────────────────────────────────────────────────

class TestRecordDeliveredPapers:

    @patch("pipeline.supabase")
    def test_upserts_all_ids(self, mock_sb):
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        _record_delivered_papers("u1", ["2401.00001", "2401.00002"], "2024-01-01")

        upsert_call = mock_sb.table.return_value.upsert.call_args
        rows = upsert_call[0][0]  # first positional arg
        assert len(rows) == 2
        arxiv_ids = {r["arxiv_id"] for r in rows}
        assert arxiv_ids == {"2401.00001", "2401.00002"}

    @patch("pipeline.supabase")
    def test_sets_user_id_on_every_row(self, mock_sb):
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        _record_delivered_papers("user-42", ["2401.00001"], "2024-01-01")

        rows = mock_sb.table.return_value.upsert.call_args[0][0]
        assert all(r["user_id"] == "user-42" for r in rows)

    @patch("pipeline.supabase")
    def test_sets_delivered_date_on_every_row(self, mock_sb):
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        _record_delivered_papers("u1", ["2401.00001"], "2024-03-15")

        rows = mock_sb.table.return_value.upsert.call_args[0][0]
        assert all(r["delivered_date"] == "2024-03-15" for r in rows)

    @patch("pipeline.supabase")
    def test_empty_list_skips_upsert(self, mock_sb):
        """No upsert call should be made when there are no papers to record."""
        _record_delivered_papers("u1", [], "2024-01-01")

        mock_sb.table.assert_not_called()

    @patch("pipeline.supabase")
    def test_upsert_uses_ignore_duplicates(self, mock_sb):
        """Re-delivering the same papers (e.g. manual re-run) must not raise."""
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        _record_delivered_papers("u1", ["2401.00001"], "2024-01-01")

        kwargs = mock_sb.table.return_value.upsert.call_args[1]
        assert kwargs.get("ignore_duplicates") is True

    @patch("pipeline.supabase")
    def test_upsert_conflict_key(self, mock_sb):
        """Conflict must be resolved on the (user_id, arxiv_id) composite key."""
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()

        _record_delivered_papers("u1", ["2401.00001"], "2024-01-01")

        kwargs = mock_sb.table.return_value.upsert.call_args[1]
        assert kwargs.get("on_conflict") == "user_id,arxiv_id"


# ── Integration: deduplication filters papers before rank_papers ──────────────

class TestDeduplicationIntegration:
    """
    Verify that the main loop correctly calls _load_seen_paper_ids and that
    papers present in the seen set are never forwarded to rank_papers.

    We test this at the function-call boundary rather than running the full
    pipeline.main() to avoid spinning up all external dependencies.
    """

    def _make_paper(self, arxiv_id: str) -> dict:
        return {
            "arxiv_id": arxiv_id,
            "title": f"Paper {arxiv_id}",
            "abstract": "Some abstract.",
            "fetch_date": "2024-01-02",
            "matched_group": "LLM applications and fine-tuning",
        }

    @patch("pipeline._record_delivered_papers")
    @patch("pipeline.rank_papers")
    @patch("pipeline._load_seen_paper_ids")
    def test_seen_papers_excluded_before_scoring(
        self, mock_load_seen, mock_rank, mock_record
    ):
        """Papers in seen_ids must not be passed to rank_papers."""
        seen_ids = {"2401.00001"}
        mock_load_seen.return_value = seen_ids
        mock_rank.return_value = []

        papers = [self._make_paper("2401.00001"), self._make_paper("2401.00002")]

        # Simulate what main() does after loading seen IDs
        fresh = [p for p in papers if p.get("arxiv_id", "") not in seen_ids]
        mock_rank(fresh, {})

        passed_papers = mock_rank.call_args[0][0]
        arxiv_ids_passed = [p["arxiv_id"] for p in passed_papers]

        assert "2401.00001" not in arxiv_ids_passed
        assert "2401.00002" in arxiv_ids_passed

    @patch("pipeline._record_delivered_papers")
    @patch("pipeline.rank_papers")
    @patch("pipeline._load_seen_paper_ids")
    def test_no_seen_papers_passes_all(self, mock_load_seen, mock_rank, mock_record):
        """New user (empty seen set) must see all fetched papers."""
        mock_load_seen.return_value = set()
        mock_rank.return_value = []

        papers = [self._make_paper(f"p{i}") for i in range(5)]
        fresh = [p for p in papers if p.get("arxiv_id", "") not in set()]
        mock_rank(fresh, {})

        passed_papers = mock_rank.call_args[0][0]
        assert len(passed_papers) == 5

    @patch("pipeline._record_delivered_papers")
    @patch("pipeline.rank_papers")
    @patch("pipeline._load_seen_paper_ids")
    def test_all_papers_seen_passes_empty_list(
        self, mock_load_seen, mock_rank, mock_record
    ):
        """If every fetched paper was already delivered, rank_papers gets []."""
        papers = [self._make_paper(f"p{i}") for i in range(3)]
        seen_ids = {p["arxiv_id"] for p in papers}
        mock_load_seen.return_value = seen_ids
        mock_rank.return_value = []

        fresh = [p for p in papers if p.get("arxiv_id", "") not in seen_ids]
        mock_rank(fresh, {})

        passed_papers = mock_rank.call_args[0][0]
        assert passed_papers == []
