from __future__ import annotations

import pytest

from cinnamon_power_timer.helper_core import (
    LOGIN1_ACTIONS,
    LOGIN1_ROOT_CHECK_INHIBITORS,
    PrivilegedAction,
    ScheduleRegistry,
    authorize_available_action,
    validate_action,
    validate_delay,
)


def test_validate_action_rejects_unknown_values() -> None:
    with pytest.raises(ValueError, match="Unsupported privileged action"):
        validate_action("arbitrary-command")


def test_all_privileged_actions_honor_logind_inhibitors() -> None:
    assert {
        action: (methods.capability_method, methods.execution_method) for action, methods in LOGIN1_ACTIONS.items()
    } == {
        PrivilegedAction.SUSPEND: ("CanSuspend", "SuspendWithFlags"),
        PrivilegedAction.HIBERNATE: ("CanHibernate", "HibernateWithFlags"),
        PrivilegedAction.REBOOT: ("CanReboot", "RebootWithFlags"),
        PrivilegedAction.POWER_OFF: ("CanPowerOff", "PowerOffWithFlags"),
    }
    assert LOGIN1_ROOT_CHECK_INHIBITORS == 1


@pytest.mark.parametrize("capability", ["yes", "challenge"])
def test_available_actions_always_require_polkit_authorization(capability: str) -> None:
    authorization_calls: list[None] = []

    authorize_available_action(PrivilegedAction.SUSPEND, capability, lambda: authorization_calls.append(None))

    assert authorization_calls == [None]


def test_unavailable_actions_do_not_request_authorization() -> None:
    authorization_calls: list[None] = []

    with pytest.raises(RuntimeError, match="suspend action is unavailable"):
        authorize_available_action(PrivilegedAction.SUSPEND, "no", lambda: authorization_calls.append(None))

    assert authorization_calls == []


@pytest.mark.parametrize("delay", [0, 8_553_600_001])
def test_validate_delay_rejects_out_of_range_values(delay: int) -> None:
    with pytest.raises(ValueError, match="between one millisecond"):
        validate_delay(delay)


def test_registry_enforces_one_schedule_per_user() -> None:
    registry = ScheduleRegistry()
    registry.add(1000, "c1", PrivilegedAction.SUSPEND, 60_000, 100.0)

    with pytest.raises(RuntimeError, match="Only one"):
        registry.add(1000, "c1", PrivilegedAction.REBOOT, 60_000, 100.0)


def test_pause_and_resume_preserve_remaining_time() -> None:
    registry = ScheduleRegistry()
    schedule = registry.add(1000, "c1", PrivilegedAction.SUSPEND, 60_000, 100.0)

    assert registry.pause(1000, 112.0)
    assert schedule.paused_remaining == 48.0
    assert schedule.deadline_monotonic is None
    assert registry.resume(1000, 200.0)
    assert schedule.deadline_monotonic == 248.0


def test_pop_expired_ignores_paused_schedules() -> None:
    registry = ScheduleRegistry()
    schedule = registry.add(1000, "c1", PrivilegedAction.POWER_OFF, 1_000, 100.0)
    assert registry.pause(1000, 100.5)

    assert registry.pop_expired(500.0) == []
    assert registry.resume(1000, 500.0)
    assert registry.pop_expired(500.4) == []
    assert registry.pop_expired(500.5) == [schedule]
