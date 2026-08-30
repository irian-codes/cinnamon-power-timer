"""Pure privileged-helper schedule registry."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum

MAX_DELAY_MILLISECONDS = 99 * 24 * 60 * 60 * 1000


class PrivilegedAction(StrEnum):
    SUSPEND = "suspend"
    HIBERNATE = "hibernate"
    REBOOT = "reboot"
    POWER_OFF = "power-off"


@dataclass(frozen=True)
class Login1Action:
    capability_method: str
    execution_method: str


LOGIN1_ACTIONS = {
    PrivilegedAction.SUSPEND: Login1Action("CanSuspend", "SuspendWithFlags"),
    PrivilegedAction.HIBERNATE: Login1Action("CanHibernate", "HibernateWithFlags"),
    PrivilegedAction.REBOOT: Login1Action("CanReboot", "RebootWithFlags"),
    PrivilegedAction.POWER_OFF: Login1Action("CanPowerOff", "PowerOffWithFlags"),
}

LOGIN1_ROOT_CHECK_INHIBITORS = 1


def authorize_available_action(
    action: PrivilegedAction,
    capability: str,
    authorize: Callable[[], None],
) -> None:
    if capability not in ("yes", "challenge"):
        raise RuntimeError(f"The {action.value} action is unavailable")
    authorize()


@dataclass
class ScheduledAction:
    uid: int
    session_id: str
    action: PrivilegedAction
    deadline_monotonic: float | None
    paused_remaining: float | None = None


def validate_action(value: str) -> PrivilegedAction:
    try:
        return PrivilegedAction(value)
    except ValueError as exc:
        raise ValueError(f"Unsupported privileged action: {value}") from exc


def validate_delay(delay_milliseconds: int) -> None:
    if delay_milliseconds < 1 or delay_milliseconds > MAX_DELAY_MILLISECONDS:
        raise ValueError("Timer delay must be between one millisecond and 99 days")


class ScheduleRegistry:
    def __init__(self) -> None:
        self._schedules: dict[int, ScheduledAction] = {}

    def __bool__(self) -> bool:
        return bool(self._schedules)

    def contains(self, uid: int) -> bool:
        return uid in self._schedules

    def add(
        self,
        uid: int,
        session_id: str,
        action: PrivilegedAction,
        delay_milliseconds: int,
        now: float,
    ) -> ScheduledAction:
        if self.contains(uid):
            raise RuntimeError("Only one privileged timer per user is allowed")
        validate_delay(delay_milliseconds)
        schedule = ScheduledAction(uid, session_id, action, now + delay_milliseconds / 1000)
        self._schedules[uid] = schedule
        return schedule

    def cancel(self, uid: int) -> bool:
        return self._schedules.pop(uid, None) is not None

    def pause(self, uid: int, now: float) -> bool:
        schedule = self._schedules.get(uid)
        if schedule is None or schedule.deadline_monotonic is None:
            return False
        schedule.paused_remaining = max(0.0, schedule.deadline_monotonic - now)
        schedule.deadline_monotonic = None
        return True

    def resume(self, uid: int, now: float) -> bool:
        schedule = self._schedules.get(uid)
        if schedule is None or schedule.paused_remaining is None:
            return False
        schedule.deadline_monotonic = now + schedule.paused_remaining
        schedule.paused_remaining = None
        return True

    def pop_expired(self, now: float) -> list[ScheduledAction]:
        expired = [
            schedule
            for schedule in self._schedules.values()
            if schedule.deadline_monotonic is not None and schedule.deadline_monotonic <= now
        ]
        for schedule in expired:
            self._schedules.pop(schedule.uid, None)
        return expired

    def remove_session(self, session_id: str) -> None:
        removed = [uid for uid, schedule in self._schedules.items() if schedule.session_id == session_id]
        for uid in removed:
            self._schedules.pop(uid, None)

    def clear(self) -> None:
        self._schedules.clear()
