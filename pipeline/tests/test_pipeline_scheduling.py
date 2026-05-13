"""
Tests for per-user delivery scheduling logic in pipeline.py.

Covers regression for:
  Fix #3 — digest_hour + timezone_offset must determine actual delivery time
  Fix #4 — two-hour catch-up window absorbs GitHub Actions cron delays
            (current hour OR previous hour), with double-delivery prevented
            by _already_delivered_today() at the call site.
"""

import pytest
from pipeline import _is_user_due, _target_utc_hour


class TestTargetUtcHour:
    """_target_utc_hour(user_config) → int in [0, 23]"""

    def test_utc_no_offset(self):
        assert _target_utc_hour({"digest_hour": 7, "timezone_offset": 0}) == 7

    def test_positive_offset(self):
        # 7am Paris (UTC+1) → 06:00 UTC
        assert _target_utc_hour({"digest_hour": 7, "timezone_offset": 1}) == 6

    def test_negative_offset(self):
        # 8am Eastern (UTC-5) → 13:00 UTC
        assert _target_utc_hour({"digest_hour": 8, "timezone_offset": -5}) == 13

    def test_half_hour_offset_rounds_away(self):
        # IST UTC+5:30 stored as 5.5
        # digest_hour=7, offset=5.5 → raw=1.5 → round_half_away=2 → UTC 2
        assert _target_utc_hour({"digest_hour": 7, "timezone_offset": 5.5}) == 2

    def test_half_hour_offset_round_half_away_at_2_5(self):
        # digest_hour=8, offset=5.5 → raw=2.5 → round_half_away=3 → UTC 3
        assert _target_utc_hour({"digest_hour": 8, "timezone_offset": 5.5}) == 3

    def test_wraps_below_zero(self):
        # 1am UTC+2 → (1-2) = -1 → (-1 % 24 + 24) % 24 = 23
        assert _target_utc_hour({"digest_hour": 1, "timezone_offset": 2}) == 23

    def test_wraps_above_23(self):
        # 23:00 UTC-3 → 26 % 24 = 2
        assert _target_utc_hour({"digest_hour": 23, "timezone_offset": -3}) == 2

    def test_missing_digest_hour_defaults_to_7(self):
        assert _target_utc_hour({"timezone_offset": 0}) == 7

    def test_missing_offset_defaults_to_0(self):
        assert _target_utc_hour({"digest_hour": 9}) == 9

    def test_empty_config_defaults(self):
        assert _target_utc_hour({}) == 7


class TestIsUserDue:
    """_is_user_due(user_config, utc_hour) → bool

    Matches when utc_hour equals the user's target UTC hour OR the previous
    hour. The two-hour window absorbs GitHub Actions cron delays (30-60+ min
    is common). Double delivery is prevented by _already_delivered_today()
    at the call site, not here.
    """

    # ── matches at exact target hour ──────────────────────────────────────────

    def test_matches_exact_target_hour(self):
        config = {"digest_hour": 7, "timezone_offset": 0}  # target = UTC 7
        assert _is_user_due(config, utc_hour=7) is True

    def test_matches_next_hour_catch_up_window(self):
        # cron fired 90min late → Python runs at UTC 8, target was UTC 7
        config = {"digest_hour": 7, "timezone_offset": 0}  # target = UTC 7
        assert _is_user_due(config, utc_hour=8) is True

    def test_does_not_match_two_hours_ahead(self):
        # UTC 9 is two hours past target 7 — outside the window
        config = {"digest_hour": 7, "timezone_offset": 0}  # target = UTC 7
        assert _is_user_due(config, utc_hour=9) is False

    def test_does_not_match_arbitrary_unrelated_hour(self):
        config = {"digest_hour": 7, "timezone_offset": 0}  # target = UTC 7
        assert _is_user_due(config, utc_hour=15) is False

    # ── positive offset (UTC+N) ───────────────────────────────────────────────

    def test_paris_utc_plus_1_exact(self):
        # 7am Paris (UTC+1) → target 06:00 UTC
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=6) is True

    def test_paris_utc_plus_1_catch_up(self):
        # Delayed cron arrives at UTC 7 — still within catch-up window
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=7) is True

    def test_paris_utc_plus_1_outside_window(self):
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=8) is False

    def test_tokyo_utc_plus_9_exact(self):
        # 10pm Tokyo (UTC+9) → 13:00 UTC
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=13) is True

    def test_tokyo_utc_plus_9_catch_up(self):
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=14) is True

    def test_tokyo_utc_plus_9_outside_window(self):
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=22) is False

    def test_singapore_utc_plus_8(self):
        # 8am Singapore (UTC+8) → 00:00 UTC
        config = {"digest_hour": 8, "timezone_offset": 8}
        assert _is_user_due(config, utc_hour=0) is True

    # ── half-hour offsets (IST) ───────────────────────────────────────────────

    def test_ist_7am_exact(self):
        # IST UTC+5:30 → raw diff 1.5 → round_half_away=2 → UTC 2
        config = {"digest_hour": 7, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=2) is True

    def test_ist_7am_catch_up(self):
        config = {"digest_hour": 7, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=3) is True

    def test_ist_7am_outside_window(self):
        config = {"digest_hour": 7, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=4) is False

    # ── negative offset (UTC-N) ───────────────────────────────────────────────

    def test_eastern_utc_minus_5_exact(self):
        # 8am Eastern (UTC-5) → 13:00 UTC
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=13) is True

    def test_eastern_utc_minus_5_catch_up(self):
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=14) is True

    def test_eastern_utc_minus_5_outside_window(self):
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=8) is False

    def test_pacific_utc_minus_8(self):
        # 6am Pacific (UTC-8) → 14:00 UTC
        config = {"digest_hour": 6, "timezone_offset": -8}
        assert _is_user_due(config, utc_hour=14) is True

    # ── midnight boundary ─────────────────────────────────────────────────────

    def test_midnight_utc_exact(self):
        """digest_hour=0 must not be coerced to 7 (falsy 'or' bug)."""
        config = {"digest_hour": 0, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=0) is True

    def test_midnight_utc_catch_up(self):
        # Delayed cron at UTC 1 can still pick up UTC 0 users
        config = {"digest_hour": 0, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=1) is True

    def test_midnight_utc_outside_window(self):
        config = {"digest_hour": 0, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=7) is False  # old falsy-'or' bug guard

    def test_crosses_midnight_positive_offset_exact(self):
        # 1am UTC+2 → 23:00 UTC
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=23) is True

    def test_crosses_midnight_positive_offset_catch_up(self):
        # Delayed run at UTC 0 wraps correctly
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=0) is True

    def test_crosses_midnight_positive_offset_outside_window(self):
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=1) is False

    def test_crosses_midnight_negative_offset(self):
        # 23:00 UTC-3 → 2:00 UTC
        config = {"digest_hour": 23, "timezone_offset": -3}
        assert _is_user_due(config, utc_hour=2) is True

    # ── None / missing values ─────────────────────────────────────────────────

    def test_none_digest_hour_defaults_to_7(self):
        """Missing digest_hour should default to 7, not be coerced by 'or'."""
        config = {"timezone_offset": 0}
        assert _is_user_due(config, utc_hour=7) is True
        assert _is_user_due(config, utc_hour=15) is False

    def test_none_timezone_offset_defaults_to_0(self):
        config = {"digest_hour": 9}
        assert _is_user_due(config, utc_hour=9) is True

    def test_empty_config_uses_defaults(self):
        # digest_hour=7, timezone_offset=0 → due at UTC 07:00
        assert _is_user_due({}, utc_hour=7) is True
        assert _is_user_due({}, utc_hour=15) is False

    # ── two-hour window coverage ──────────────────────────────────────────────

    def test_exactly_two_hours_match_per_day(self):
        """Each user config now matches exactly two consecutive UTC hours:
        the target hour (on-time cron) and the next hour (delayed cron catch-up).
        _already_delivered_today() at the call site prevents double delivery.
        """
        config = {"digest_hour": 8, "timezone_offset": -5}  # target = 13
        matches = [h for h in range(24) if _is_user_due(config, h)]
        assert matches == [13, 14], f"Expected [13, 14] but got {matches}"

    def test_two_hour_window_wraps_at_midnight(self):
        """Window wraps correctly: target=23 → matches at 23 and 0."""
        config = {"digest_hour": 23, "timezone_offset": 0}  # target = 23
        assert _is_user_due(config, utc_hour=23) is True
        assert _is_user_due(config, utc_hour=0) is True   # catch-up wraps to next day
        assert _is_user_due(config, utc_hour=1) is False
