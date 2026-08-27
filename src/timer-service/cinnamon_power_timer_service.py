#!/usr/bin/env python3
"""Per-user timer service scaffold.

This process is intended to run under systemd --user and become the authoritative
owner of one timer for the current Unix user. D-Bus wiring and logind lifecycle
integration are intentionally left as TODOs for the first implementation pass.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from time import monotonic
from typing import Optional


class TimerMode(str, Enum):
    AT_TIME = "at-time"
    COUNTDOWN = "countdown"


class TimerAction(str, Enum):
    LOCK = "lock"
    SUSPEND = "suspend"
    HIBERNATE = "hibernate"
    REBOOT = "reboot"
    POWER_OFF = "power-off"


class TimerStatus(str, Enum):
    ACTIVE = "active"
    CANCELLATION_PAUSED = "cancellation-paused"
    MISSED = "missed"
    FAILED = "failed"
    COMPLETED = "completed"


@dataclass
class TimerState:
    mode: TimerMode
    action: TimerAction
    original_value: str
    remaining_seconds: float
    created_monotonic: float = field(default_factory=monotonic)
    status: TimerStatus = TimerStatus.ACTIVE
    warning_one_fired: bool = False
    warning_two_fired: bool = False
    paused_remaining_seconds: Optional[float] = None


class TimerService:
    def __init__(self) -> None:
        self.timer: Optional[TimerState] = None

    def create_timer(self, timer: TimerState) -> None:
        if self.timer is not None:
            raise RuntimeError("Only one active timer per user is allowed")
        self.timer = timer

    def clear_timer(self) -> None:
        self.timer = None

    def pause_for_cancellation(self) -> None:
        if not self.timer or self.timer.status != TimerStatus.ACTIVE:
            raise RuntimeError("No active timer to pause")
        self.timer.paused_remaining_seconds = self.timer.remaining_seconds
        self.timer.status = TimerStatus.CANCELLATION_PAUSED

    def resume_after_cancel_abort(self) -> None:
        if not self.timer or self.timer.status != TimerStatus.CANCELLATION_PAUSED:
            return
        if self.timer.paused_remaining_seconds is not None:
            self.timer.remaining_seconds = self.timer.paused_remaining_seconds
        self.timer.paused_remaining_seconds = None
        self.timer.status = TimerStatus.ACTIVE


def main() -> None:
    # TODO: expose org.irian.CinnamonPowerTimer on the per-user D-Bus.
    # TODO: subscribe to logind session/suspend lifecycle events.
    # TODO: delegate privileged scheduled actions to the system helper.
    raise SystemExit("Timer service scaffold only; D-Bus loop not implemented yet")


if __name__ == "__main__":
    main()
