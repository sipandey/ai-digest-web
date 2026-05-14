"""
Tests for per-user delivery scheduling logic in pipeline.py.

Covers:
  _target_utc_hour — converts (digest_hour, timezone_offset) to a UTC hour
  _is_user_due     — cumulative window: True when target_utc_hour <= utc_hour

The cumulative window means: once a user's target hour has arrived, every
subsequent hourly check considers them due.  _already_delivered_today() in
the pipeline loop prevents double-delivery once a run completes.
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

    def test_half_hour_offset_rounds_away_at_1_5(self):
        # IST UTC+5:30 stored as 5.5
        # digest_hour=7, offset=5.5 → raw=1.5 → round_half_away=2 → UTC 2
        assert _target_utc_hour({"digest_hour": 7, "timezone_offset": 5.5}) == 2

    def test_half_hour_offset_rounds_away_at_2_5(self):
        # digest_hour=8, offset=5.5 → raw=2.5 → round_half_away=3 → UTC 3
        assert _target_utc_hour({"digest_hour": 8, "timezone_offset": 5.5}) == 3

    def test_half_hour_offset_rounds_away_at_0_5(self):
        # The user that triggered this fix: digest_hour=6, timezone_offset=5.5
        # raw=0.5 → round_half_away=1 → UTC 1
        assert _target_utc_hour({"digest_hour": 6, "timezone_offset": 5.5}) == 1

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

    Returns True when target_utc_hour <= utc_hour (cumulative window).
    Returns False when target_utc_hour > utc_hour (hour hasn't arrived yet).
    Double-delivery is prevented by _already_delivered_today() at the call site.
    """

    # ── on-time and catch-up ─────────────────────────────────────────────────

    def test_matches_exact_target_hour(self):
        config = {"digest_hour": 7, "timezone_offset": 0}  # target = UTC 7
        assert _is_user_due(config, utc_hour=7) is True

    def test_matches_one_hour_after_target(self):
        # cron fired 90min late → Python runs at UTC 8, target was UTC 7
        config = {"digest_hour": 7, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=8) is True

    def test_matches_several_hours_after_target(self):
        # target=7, check at UTC 11 — cumulative window catches up
        config = {"digest_hour": 7, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=11) is True

    def test_not_due_before_target(self):
        config = {"digest_hour": 7, "timezone_offset": 0}  # target = UTC 7
        assert _is_user_due(config, utc_hour=6) is False

    def test_not_due_well_before_target(self):
        config = {"digest_hour": 7, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=2) is False

    # ── IST user that triggered this fix ─────────────────────────────────────

    def test_ist_6am_digest_on_time(self):
        # digest_hour=6, timezone_offset=5.5 → target UTC 1
        config = {"digest_hour": 6, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=1) is True

    def test_ist_6am_digest_caught_two_hours_late(self):
        config = {"digest_hour": 6, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=3) is True

    def test_ist_6am_digest_caught_five_hours_late(self):
        # Missed at 1, 2, 3, 4 AM; caught at 6 AM by a different user's run
        config = {"digest_hour": 6, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=6) is True

    def test_ist_6am_digest_not_due_before_target(self):
        config = {"digest_hour": 6, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=0) is False

    # ── positive offset (UTC+N) ───────────────────────────────────────────────

    def test_paris_utc_plus_1_on_time(self):
        # 7am Paris (UTC+1) → target 06:00 UTC
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=6) is True

    def test_paris_utc_plus_1_catch_up(self):
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=10) is True

    def test_paris_utc_plus_1_not_due_before(self):
        config = {"digest_hour": 7, "timezone_offset": 1}
        assert _is_user_due(config, utc_hour=5) is False

    def test_tokyo_utc_plus_9_on_time(self):
        # 10pm Tokyo (UTC+9) → target 13:00 UTC
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=13) is True

    def test_tokyo_utc_plus_9_catch_up(self):
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=20) is True

    def test_tokyo_utc_plus_9_not_due_before(self):
        config = {"digest_hour": 22, "timezone_offset": 9}
        assert _is_user_due(config, utc_hour=12) is False

    def test_singapore_utc_plus_8_target_0(self):
        # 8am Singapore (UTC+8) → target 00:00 UTC
        config = {"digest_hour": 8, "timezone_offset": 8}
        assert _is_user_due(config, utc_hour=0) is True

    # ── half-hour offsets (IST) ───────────────────────────────────────────────

    def test_ist_7am_on_time(self):
        # IST UTC+5:30 → raw diff 1.5 → round_half_away=2 → target UTC 2
        config = {"digest_hour": 7, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=2) is True

    def test_ist_7am_catch_up(self):
        config = {"digest_hour": 7, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=5) is True

    def test_ist_7am_not_due_before(self):
        config = {"digest_hour": 7, "timezone_offset": 5.5}
        assert _is_user_due(config, utc_hour=1) is False

    # ── negative offset (UTC-N) ───────────────────────────────────────────────

    def test_eastern_utc_minus_5_on_time(self):
        # 8am Eastern (UTC-5) → target 13:00 UTC
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=13) is True

    def test_eastern_utc_minus_5_catch_up(self):
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=18) is True

    def test_eastern_utc_minus_5_not_due_before(self):
        config = {"digest_hour": 8, "timezone_offset": -5}
        assert _is_user_due(config, utc_hour=12) is False

    def test_pacific_utc_minus_8(self):
        # 6am Pacific (UTC-8) → target 14:00 UTC
        config = {"digest_hour": 6, "timezone_offset": -8}
        assert _is_user_due(config, utc_hour=14) is True

    # ── midnight boundary ─────────────────────────────────────────────────────

    def test_target_0_due_at_midnight(self):
        """target=0 must not be coerced to 7 (falsy 'or' bug from old code)."""
        config = {"digest_hour": 0, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=0) is True

    def test_target_0_due_at_later_hour(self):
        config = {"digest_hour": 0, "timezone_offset": 0}
        assert _is_user_due(config, utc_hour=7) is True

    def test_target_23_due_at_23(self):
        # 1am UTC+2 → target 23:00 UTC
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=23) is True

    def test_target_23_not_due_before(self):
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=22) is False

    def test_target_23_not_due_at_midnight_next_day(self):
        # With the cumulative window, target=23 is NOT caught at UTC 0 the next
        # calendar day (23 <= 0 is false). If the 11 PM slot is missed, the
        # user waits until 11 PM the following day.
        config = {"digest_hour": 1, "timezone_offset": 2}
        assert _is_user_due(config, utc_hour=0) is False

    def test_crosses_midnight_negative_offset(self):
        # 23:00 UTC-3 → target 02:00 UTC
        config = {"digest_hour": 23, "timezone_offset": -3}
        assert _is_user_due(config, utc_hour=2) is True

    # ── None / missing values ─────────────────────────────────────────────────

    def test_none_digest_hour_defaults_to_7(self):
        config = {"timezone_offset": 0}
        assert _is_user_due(config, utc_hour=7) is True
        assert _is_user_due(config, utc_hour=6) is False

    def test_none_timezone_offset_defaults_to_0(self):
        config = {"digest_hour": 9}
        assert _is_user_due(config, utc_hour=9) is True
        assert _is_user_due(config, utc_hour=8) is False

    def test_empty_config_uses_defaults(self):
        # digest_hour=7, timezone_offset=0 → target UTC 7
        assert _is_user_due({}, utc_hour=7) is True
        assert _is_user_due({}, utc_hour=6) is False

    # ── cumulative window property ────────────────────────────────────────────

    def test_all_hours_at_and_after_target_are_due(self):
        """Every UTC hour from target onward returns True within the same day."""
        config = {"digest_hour": 8, "timezone_offset": -5}  # target = 13
        due_hours = [h for h in range(24) if _is_user_due(config, h)]
        assert due_hours == list(range(13, 24))

    def test_no_hours_before_target_are_due(self):
        config = {"digest_hour": 8, "timezone_offset": -5}  # target = 13
        not_due = [h for h in range(13) if _is_user_due(config, h)]
        assert not_due == []

    def test_target_0_matches_all_hours(self):
        """target=0 (midnight UTC) — every hour of the day is 'due'."""
        config = {"digest_hour": 8, "timezone_offset": 8}  # target = 0
        due_hours = [h for h in range(24) if _is_user_due(config, h)]
        assert due_hours == list(range(0, 24))
