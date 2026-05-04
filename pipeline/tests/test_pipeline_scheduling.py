"""
Tests for per-user delivery scheduling logic in pipeline.py.

Covers regression for:
  Fix #3 — digest_hour + timezone_offset must determine actual delivery time
"""

import pytest
from pipeline import _is_user_due


class TestIsUserDue:
    """_is_user_due(user_config, utc_hour) → bool"""

    # ── basic cases ───────────────────────────────────────────────────────────

    def test_utc_user_matches_own_hour(self):
        config = {"digest_hour": 7, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=7) is True

    def test_utc_user_does_not_match_other_hour(self):
        config = {"digest_hour": 7, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=8) is False

    # ── positive offset (UTC+N) ───────────────────────────────────────────────

    def test_paris_utc_plus_1(self):
        # 7am Paris (UTC+1) → 06:00 UTC
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=6) is True
        assert _is_user_due(config, utc_hour=7) is False

    def test_tokyo_utc_plus_9(self):
        # 10pm Tokyo (UTC+9) → 13:00 UTC
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=13) is True
        assert _is_user_due(config, utc_hour=22) is False

    def test_singapore_utc_plus_8(self):
        # 8am Singapore (UTC+8) → 00:00 UTC
        config = {"digest_hour": 8, "timezone_offset": 8}
        assert _is_user_due(config, utc_hour=0) is True

    # ── negative offset (UTC-N) ───────────────────────────────────────────────

    def test_eastern_utc_minus_5(self):
        # 8am Eastern (UTC-5) → 13:00 UTC
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=13) is True
        assert _is_user_due(config, utc_hour=8) is False

    def test_pacific_utc_minus_8(self):
        # 6am Pacific (UTC-8) → 14:00 UTC
        config = {"digest_hour": 6, "timezone_offset": -8}
        assert _is_user_due(config, utc_hour=14) is True

    # ── midnight boundary ─────────────────────────────────────────────────────

    def test_midnight_utc(self):
        """digest_hour=0 must not be coerced to 7 (falsy 'or' bug)."""
        config = {"digest_hour": 0, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=0) is True
        assert _is_user_due(config, utc_hour=7) is False  # old bug would give True

    def test_crosses_midnight_positive_offset(self):
        # 1am UTC+2 → (1 - 2) % 24 = 23:00 UTC
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=23) is True
        assert _is_user_due(config, utc_hour=1) is False

    def test_crosses_midnight_negative_offset(self):
        # 23:00 UTC-3 → (23 - (-3)) % 24 = 26 % 24 = 2:00 UTC
        config = {"digest_hour": 23, "timezone_offset": -3}
        assert _is_user_due(config, utc_hour=2) is True

    # ── None / missing values ─────────────────────────────────────────────────

    def test_none_digest_hour_defaults_to_7(self):
        """Missing digest_hour should default to 7, not be coerced by 'or'."""
        config = {"timezone_offset": 0}
        assert _is_user_due(config, utc_hour=7) is True
        assert _is_user_due(config, utc_hour=0) is False

    def test_none_timezone_offset_defaults_to_0(self):
        config = {"digest_hour": 9}
        assert _is_user_due(config, utc_hour=9) is True

    def test_empty_config_uses_defaults(self):
        # digest_hour=7, timezone_offset=0 → due at UTC 07:00
        assert _is_user_due({}, utc_hour=7) is True
        assert _is_user_due({}, utc_hour=0) is False

    # ── all 24 hours — exactly one match ─────────────────────────────────────

    def test_exactly_one_hour_matches_per_day(self):
        """Each user config should match exactly one UTC hour per day."""
        config = {"digest_hour": 8, "timezone_offset": -5}  # target = 13
        matches = [h for h in range(24) if _is_user_due(config, h)]
        assert matches == [13], f"Expected exactly [13] but got {matches}"
