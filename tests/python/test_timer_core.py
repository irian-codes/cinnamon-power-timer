from __future__ import annotations

import unittest
from datetime import UTC, datetime

from cinnamon_power_timer import timer_core


class FakeClock:
    def __init__(self, value: float = 100.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


class TimerEngineTests(unittest.TestCase):
    def test_countdown_is_resolved(self) -> None:
        duration, target, original = timer_core.TimerEngine.resolve_request(
            {"mode": "countdown", "duration_seconds": 3 * 86400 + 12 * 3600 + 45 * 60}
        )
        self.assertEqual(duration, 305100)
        self.assertIsNone(target)
        self.assertEqual(original, "03 d 12 h 45 m")

    def test_countdown_rejects_invalid_duration(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one minute"):
            timer_core.TimerEngine.resolve_request({"mode": "countdown", "duration_seconds": 0})

        with self.assertRaisesRegex(ValueError, "whole minutes"):
            timer_core.TimerEngine.resolve_request({"mode": "countdown", "duration_seconds": 3601})

        with self.assertRaisesRegex(ValueError, "30 days"):
            timer_core.TimerEngine.resolve_request({"mode": "countdown", "duration_seconds": 31 * 86400})

    def test_countdown_uses_configured_maximum(self) -> None:
        duration, _target, original = timer_core.TimerEngine.resolve_request(
            {
                "mode": "countdown",
                "duration_seconds": 45 * 86400,
                "settings": {"maximum_countdown_days": 45},
            }
        )
        self.assertEqual(duration, 45 * 86400)
        self.assertEqual(original, "45 d 00 h 00 m")

    def test_future_at_time_uses_today(self) -> None:
        now = datetime(2026, 8, 27, 18, 0, tzinfo=UTC)
        duration, target, original = timer_core.TimerEngine.resolve_request({"mode": "at-time", "time": "19:00"}, now)
        self.assertEqual(duration, 3600)
        self.assertEqual(target, datetime(2026, 8, 27, 19, 0, tzinfo=UTC).timestamp())
        self.assertEqual(original, "19:00")

    def test_past_at_time_requires_tomorrow_confirmation(self) -> None:
        now = datetime(2026, 8, 27, 20, 0, tzinfo=UTC)
        with self.assertRaisesRegex(ValueError, "TOMORROW_CONFIRMATION_REQUIRED"):
            timer_core.TimerEngine.resolve_request({"mode": "at-time", "time": "19:00"}, now)
        duration, target, _original = timer_core.TimerEngine.resolve_request(
            {"mode": "at-time", "time": "19:00", "confirmed_tomorrow": True}, now
        )
        self.assertEqual(duration, 23 * 3600)
        self.assertEqual(target, datetime(2026, 8, 28, 19, 0, tzinfo=UTC).timestamp())

    def test_only_one_timer_is_allowed(self) -> None:
        engine = timer_core.TimerEngine(FakeClock())
        request = {"mode": "countdown", "action": "lock", "duration_seconds": 3600}
        engine.create(request, "c1")
        with self.assertRaisesRegex(RuntimeError, "Only one"):
            engine.create(request, "c1")

    def test_cancellation_freezes_and_restores_remaining_time(self) -> None:
        clock = FakeClock()
        engine = timer_core.TimerEngine(clock)
        timer = engine.create(
            {"mode": "countdown", "action": "lock", "duration_seconds": 3600},
            "c1",
        )
        clock.value += 12
        engine.begin_cancellation(":1.5")
        self.assertEqual(timer.remaining(clock()), 3588)
        clock.value += 30
        self.assertEqual(timer.remaining(clock()), 3588)
        self.assertTrue(engine.abort_cancellation(":1.5"))
        clock.value += 8
        self.assertEqual(timer.remaining(clock()), 3580)

    def test_wrong_cancellation_owner_cannot_resume(self) -> None:
        engine = timer_core.TimerEngine(FakeClock())
        engine.create({"mode": "countdown", "action": "lock", "duration_seconds": 3600}, "c1")
        engine.begin_cancellation(":1.5")
        self.assertFalse(engine.abort_cancellation(":1.6"))
        assert engine.timer is not None
        self.assertEqual(engine.timer.status, timer_core.TimerStatus.CANCELLATION_PAUSED)

    def test_warnings_below_start_duration_are_skipped(self) -> None:
        engine = timer_core.TimerEngine(FakeClock())
        timer = engine.create(
            {
                "mode": "countdown",
                "action": "lock",
                "duration_seconds": 3600,
                "settings": {"warning_one_minutes": 120, "warning_two_minutes": 90},
            },
            "c1",
        )
        self.assertTrue(timer.warnings[0].fired)
        self.assertTrue(timer.warnings[1].fired)
        self.assertEqual(timer.warning_level, "red")

    def test_warning_level_tracks_remaining_thresholds(self) -> None:
        warnings = [
            timer_core.WarningSettings(True, 30 * 60),
            timer_core.WarningSettings(True, 5 * 60),
        ]
        self.assertEqual(timer_core.warning_level_for_remaining(warnings, 31 * 60), "normal")
        self.assertEqual(timer_core.warning_level_for_remaining(warnings, 30 * 60), "yellow")
        self.assertEqual(timer_core.warning_level_for_remaining(warnings, 5 * 60), "red")

    def test_warning_at_exact_start_duration_can_fire(self) -> None:
        engine = timer_core.TimerEngine(FakeClock())
        timer = engine.create(
            {
                "mode": "countdown",
                "action": "lock",
                "duration_seconds": 3600,
                "settings": {"warning_one_enabled": False, "warning_two_minutes": 60},
            },
            "c1",
        )
        self.assertFalse(timer.warnings[1].fired)


if __name__ == "__main__":
    unittest.main()
