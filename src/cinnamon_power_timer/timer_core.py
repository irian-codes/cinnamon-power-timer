"""Pure timer state and scheduling semantics."""

from __future__ import annotations

import math
import os
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from pathlib import Path
from time import monotonic, time
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class TimerMode(StrEnum):
    AT_TIME = "at-time"
    COUNTDOWN = "countdown"


class TimerAction(StrEnum):
    LOCK = "lock"
    SUSPEND = "suspend"
    HIBERNATE = "hibernate"
    REBOOT = "reboot"
    POWER_OFF = "power-off"


class TimerStatus(StrEnum):
    ACTIVE = "active"
    CANCELLATION_PAUSED = "cancellation-paused"
    MISSED = "missed"
    FAILED = "failed"


@dataclass
class WarningSettings:
    enabled: bool
    seconds: int
    fired: bool = False


@dataclass
class TimerState:
    mode: TimerMode
    action: TimerAction
    original_value: str
    session_id: str
    created_epoch: float
    duration_seconds: float
    deadline_monotonic: float
    target_epoch: float | None
    cancellation_delay: int
    cancel_on_user_switch: bool
    warnings: list[WarningSettings]
    status: TimerStatus = TimerStatus.ACTIVE
    paused_remaining: float | None = None
    cancellation_owner: str | None = None
    warning_level: str = "normal"
    deferred_warning: str | None = None
    terminal_message: str | None = None
    terminal_notification_pending: bool = False
    helper_scheduled: bool = False
    last_session_active: bool = True

    def remaining(self, now: float | None = None) -> float:
        if self.status == TimerStatus.CANCELLATION_PAUSED:
            return max(0.0, self.paused_remaining or 0.0)
        if self.status != TimerStatus.ACTIVE:
            return 0.0
        current = monotonic() if now is None else now
        return max(0.0, self.deadline_monotonic - current)

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "mode": self.mode.value,
            "action": self.action.value,
            "original_value": self.original_value,
            "created_at": self.created_epoch,
            "target_at": self.target_epoch,
            "duration_seconds": int(round(self.duration_seconds)),
            "remaining_seconds": int(math.ceil(self.remaining())),
            "cancellation_delay": self.cancellation_delay,
            "warning_level": self.warning_level,
            "message": self.terminal_message,
            "session_active": self.last_session_active,
        }


class TimerEngine:
    """Timer state machine without D-Bus or desktop side effects."""

    def __init__(self, clock: Callable[[], float] = monotonic) -> None:
        self.clock = clock
        self.timer: TimerState | None = None

    @staticmethod
    def resolve_request(request: dict[str, Any], now: datetime | None = None) -> tuple[float, float | None, str]:
        mode = TimerMode(request["mode"])
        now = now or local_now()
        if mode == TimerMode.COUNTDOWN:
            seconds = int(request.get("duration_seconds", 0))
            if seconds < 1 or seconds > 7 * 24 * 60 * 60:
                raise ValueError("Countdown must be between one second and seven days")
            return float(seconds), None, format_duration_value(seconds)

        value = str(request.get("time", ""))
        try:
            hour_text, minute_text = value.split(":", 1)
            hour, minute = int(hour_text), int(minute_text)
        except (TypeError, ValueError) as exc:
            raise ValueError("Time must use HH:MM format") from exc
        if not 0 <= hour <= 23 or not 0 <= minute <= 59:
            raise ValueError("Time must use a valid 24-hour value")
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            if not request.get("confirmed_tomorrow", False):
                raise ValueError("TOMORROW_CONFIRMATION_REQUIRED")
            target += timedelta(days=1)
        return (target - now).total_seconds(), target.timestamp(), f"{hour:02d}:{minute:02d}"

    def create(self, request: dict[str, Any], session_id: str) -> TimerState:
        if self.timer is not None:
            raise RuntimeError("Only one active timer per user is allowed")
        mode = TimerMode(request["mode"])
        action = TimerAction(request["action"])
        duration, target_epoch, original = self.resolve_request(request)
        settings = request.get("settings", {})
        warning_specs = [
            (bool(settings.get("warning_one_enabled", True)), int(settings.get("warning_one_minutes", 30)) * 60),
            (bool(settings.get("warning_two_enabled", True)), int(settings.get("warning_two_minutes", 5)) * 60),
        ]
        warnings = [
            WarningSettings(enabled, seconds, not enabled or duration < seconds) for enabled, seconds in warning_specs
        ]
        now_monotonic = self.clock()
        self.timer = TimerState(
            mode=mode,
            action=action,
            original_value=original,
            session_id=session_id,
            created_epoch=time(),
            duration_seconds=duration,
            deadline_monotonic=now_monotonic + duration,
            target_epoch=target_epoch,
            cancellation_delay=max(0, min(30, int(settings.get("cancellation_delay_seconds", 3)))),
            cancel_on_user_switch=bool(settings.get("cancel_on_user_switch", False)),
            warnings=warnings,
        )
        return self.timer

    def begin_cancellation(self, owner: str) -> TimerState:
        timer = self._require(TimerStatus.ACTIVE)
        timer.paused_remaining = timer.remaining(self.clock())
        timer.status = TimerStatus.CANCELLATION_PAUSED
        timer.cancellation_owner = owner
        return timer

    def abort_cancellation(self, owner: str | None = None) -> bool:
        timer = self.timer
        if timer is None or timer.status != TimerStatus.CANCELLATION_PAUSED:
            return False
        if owner is not None and timer.cancellation_owner != owner:
            return False
        timer.deadline_monotonic = self.clock() + (timer.paused_remaining or 0.0)
        timer.paused_remaining = None
        timer.cancellation_owner = None
        timer.status = TimerStatus.ACTIVE
        return True

    def clear(self) -> None:
        self.timer = None

    def _require(self, status: TimerStatus) -> TimerState:
        if self.timer is None or self.timer.status != status:
            raise RuntimeError(f"Timer must be {status.value}")
        return self.timer


def format_duration_value(seconds: int) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def local_now() -> datetime:
    """Return local time with timezone transition rules when available."""
    timezone_key = os.environ.get("TZ")
    if not timezone_key:
        try:
            localtime_path = Path("/etc/localtime").resolve()
            marker = "/zoneinfo/"
            if marker in str(localtime_path):
                timezone_key = str(localtime_path).split(marker, 1)[1]
        except OSError:
            pass
    if not timezone_key:
        with suppress(OSError):
            timezone_key = Path("/etc/timezone").read_text(encoding="utf-8").strip()
    try:
        return datetime.now(ZoneInfo(timezone_key)) if timezone_key else datetime.now().astimezone()
    except (ValueError, ZoneInfoNotFoundError):
        return datetime.now().astimezone()
