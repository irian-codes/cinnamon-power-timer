# Architecture

## Components

### Cinnamon applet

Path: `applet/cinnamon-power-timer@irian-codes/`

Owns UI only. It should communicate with the per-user timer service over the session bus.

### Per-user timer service

Path: `src/timer-service/`

Runs as a `systemd --user` service and is authoritative for one timer belonging to the current Unix user.

Responsibilities include timer state, cancellation pause semantics, warning milestone state, session lifecycle handling, and coordination with the privileged helper.

### Privileged helper

Path: `src/privileged-helper/`

Runs as a system service and exposes a narrow D-Bus surface for predefined power actions only.

It must never accept arbitrary executables, shell fragments, or commands.

## Intended IPC

The exact interface is not finalized, but the target shape is:

### User service

Bus: session bus

Name: `org.irian.CinnamonPowerTimer`

Candidate methods:

- `CreateTimer(mode, value, action, settings)`
- `GetState()`
- `BeginCancellation()`
- `AbortCancellation()`
- `ConfirmCancellation()`
- `AcknowledgeTerminalState()`

Candidate signals:

- `StateChanged(state)`
- `WarningCrossed(level)`
- `TimerExpired(result)`

### Privileged helper

Bus: system bus

Name: `org.irian.CinnamonPowerTimer.Helper`

Candidate methods:

- `GetCapabilities()`
- `Schedule(uid, sessionId, action, expiry)`
- `Cancel(uid)`

The helper should validate caller identity and authorize creation/cancellation with Polkit. At expiry it must re-check the owning graphical session with logind before executing any action.

## Lifecycle rules

- Cinnamon restart: timer survives.
- Lock screen: timer survives.
- Switch user: timer survives by default, but expiry action is skipped if owner is inactive.
- Logout: timer discarded.
- Suspend: timer discarded.
- Hibernate: timer discarded.
- Reboot/shutdown: timer discarded.

See `docs/plans/001-product-requirements.md` for the product-level specification.
