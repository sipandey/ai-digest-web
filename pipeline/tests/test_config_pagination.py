"""
Tests for config.py — get_active_users pagination.

Covers regression for:
  Fix #7 — Supabase silently truncates at 1000 rows; must paginate
"""

from unittest.mock import MagicMock, patch, call
import pytest

import config as config_module
from config import get_active_users

_PAGE_SIZE = 1000  # mirrors the constant in config.py


def _make_user(user_id: str, active: bool = True):
    return {
        "user_id": user_id,
        "active": True,
        "notion_connected": True,
        "users": {"id": user_id, "active": active, "email": f"{user_id}@example.com"},
    }


def _mock_query(pages: list[list[dict]]):
    """
    Return a mock that simulates paginated Supabase .range() calls.
    Each element of *pages* is returned as .execute().data for successive calls.
    """
    execute_responses = []
    for page_data in pages:
        resp = MagicMock()
        resp.data = page_data
        execute_responses.append(resp)

    mock_execute = MagicMock(side_effect=execute_responses)

    mock_chain = MagicMock()
    mock_chain.select.return_value = mock_chain
    mock_chain.eq.return_value = mock_chain
    mock_chain.range.return_value = mock_chain
    mock_chain.execute = mock_execute

    return mock_chain


class TestGetActiveUsersPagination:

    @patch("config.supabase")
    def test_single_page_under_limit(self, mock_sb):
        """Fewer than PAGE_SIZE users — one query, returns all."""
        users = [_make_user(f"u{i}") for i in range(5)]
        mock_sb.table.return_value = _mock_query([users])

        result = get_active_users()

        assert len(result) == 5
        assert mock_sb.table.return_value.execute.call_count == 1

    @patch("config.supabase")
    def test_exactly_page_size_triggers_second_query(self, mock_sb):
        """Exactly PAGE_SIZE results must trigger a follow-up query."""
        page1 = [_make_user(f"u{i}") for i in range(_PAGE_SIZE)]
        page2 = []  # empty second page signals end
        mock_sb.table.return_value = _mock_query([page1, page2])

        result = get_active_users()

        assert len(result) == _PAGE_SIZE
        assert mock_sb.table.return_value.execute.call_count == 2

    @patch("config.supabase")
    def test_multiple_pages_collected(self, mock_sb):
        """Results spanning 2+ full pages are all returned."""
        page1 = [_make_user(f"u{i}") for i in range(_PAGE_SIZE)]
        page2 = [_make_user(f"v{i}") for i in range(500)]
        mock_sb.table.return_value = _mock_query([page1, page2])

        result = get_active_users()

        assert len(result) == _PAGE_SIZE + 500

    @patch("config.supabase")
    def test_inactive_parent_users_filtered_out(self, mock_sb):
        """Users whose parent 'users' row has active=False must be excluded."""
        active = _make_user("active_user", active=True)
        inactive = _make_user("inactive_user", active=False)
        mock_sb.table.return_value = _mock_query([[active, inactive]])

        result = get_active_users()

        ids = [r["user_id"] for r in result]
        assert "active_user" in ids
        assert "inactive_user" not in ids

    @patch("config.supabase")
    def test_single_user_lookup_skips_pagination(self, mock_sb):
        """Single-user lookup uses a direct query, not the pagination loop."""
        user = _make_user("specific_user")
        resp = MagicMock()
        resp.data = [user]

        # The single-user path chains .select().eq().eq().eq().execute() —
        # three .eq() calls (active, notion_connected, user_id).
        # Use a self-returning chain so every .eq() returns the same object.
        chain = mock_sb.table.return_value
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.execute.return_value = resp

        result = get_active_users(user_id="specific_user")

        assert len(result) == 1
        assert result[0]["user_id"] == "specific_user"
        # range() should NOT have been called — it's only used in the paginated path
        chain.range.assert_not_called()

    @patch("config.supabase")
    def test_empty_database_returns_empty_list(self, mock_sb):
        mock_sb.table.return_value = _mock_query([[]])
        assert get_active_users() == []
