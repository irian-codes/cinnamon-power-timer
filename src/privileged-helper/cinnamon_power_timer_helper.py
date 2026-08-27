#!/usr/bin/env python3
"""Privileged helper scaffold for Cinnamon Power Timer.

The production helper must expose a narrow D-Bus API and authorize requests via
Polkit. It must never accept arbitrary commands or executable paths.
"""

from __future__ import annotations

from enum import Enum


class PrivilegedAction(str, Enum):
    SUSPEND = "suspend"
    HIBERNATE = "hibernate"
    REBOOT = "reboot"
    POWER_OFF = "power-off"


ALLOWED_ACTIONS = frozenset(PrivilegedAction)


def validate_action(value: str) -> PrivilegedAction:
    try:
        return PrivilegedAction(value)
    except ValueError as exc:
        raise ValueError(f"Unsupported privileged action: {value}") from exc


def main() -> None:
    # TODO: expose a system D-Bus interface with Schedule(uid, session, action,
    # expiry), Cancel(uid), and GetCapabilities().
    # TODO: authorize Schedule/Cancel through Polkit at timer creation time.
    # TODO: use systemd-logind for actual power operations.
    # TODO: re-check that the owning graphical session is active at expiry.
    raise SystemExit("Privileged helper scaffold only; D-Bus loop not implemented yet")


if __name__ == "__main__":
    main()
