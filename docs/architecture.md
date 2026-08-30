# Architecture

## Components

### Cinnamon applet

Source: `applet/cinnamon-power-timer@irian-codes/src/`

Generated output: `dist/applet/cinnamon-power-timer@irian-codes/`

Owns UI only. It should communicate with the per-user timer service over the session bus.

### Per-user timer service

Path: `src/timer-service/`

Runs as a `systemd --user` service and is authoritative for one timer belonging to the current Unix user.

Responsibilities include timer state, cancellation pause semantics, warning milestone state, session lifecycle handling, and coordination with the privileged helper.

Lock expiry calls `org.cinnamon.ScreenSaver.Lock` on the session bus. This
activates Cinnamon's screensaver when it is not already running and waits for
the lock request to complete. Logind remains authoritative for session
ownership, active state, and the already-locked hint.

### Privileged helper

Path: `src/privileged-helper/`

Runs as a system service and exposes a narrow D-Bus surface for predefined power actions only.

It must never accept arbitrary executables, shell fragments, or commands.

## IPC

Payloads use JSON strings. This keeps the D-Bus boundary stable across
Python and Cinnamon's GJS runtime while preserving strict method names.

### User service

Bus: session bus

Name: `org.irian.CinnamonPowerTimer`

Methods:

- `CreateTimer(requestJson)`
- `GetState()`
- `BeginCancellation()`
- `AbortCancellation()`
- `ConfirmCancellation()`
- `AcknowledgeTerminalState()`
- `GetCapabilities()`

Signals:

- `StateChanged(stateJson)`
- `WarningCrossed(warningJson)`
- `TimerExpired(resultJson)`

### Privileged helper

Bus: system bus

Name: `org.irian.CinnamonPowerTimer.Helper`

Methods:

- `Schedule(sessionId, action, delayMilliseconds)`
- `Pause()`
- `Resume()`
- `Cancel()`
- `GetCapabilities()`

Signal:

- `ActionFinished(uid, result, message)`

The helper derives caller identity from the system bus. It verifies session
ownership and uses logind capabilities only to detect unavailable actions.
Polkit evaluates every scheduling request. Cancellation, pause, and resume only
affect the caller's own UID. At expiry it re-checks the owning graphical
session and executes through logind's `*WithFlags` methods with privileged-user
inhibitor checks enabled.

## Lifecycle rules

- Cinnamon restart: timer survives.
- Lock screen: timer survives.
- Switch user: timer survives by default, but expiry action is skipped if owner is inactive.
- Logout: timer discarded.
- Suspend: timer discarded.
- Hibernate: timer discarded.
- Reboot/shutdown: timer discarded.

See `docs/plans/001-product-requirements.md` for the product-level specification.

## Build boundaries

- TypeScript is the only maintained applet implementation.
- esbuild creates one GJS-compatible `applet.js` bundle.
- Static applet assets are copied beside that bundle.
- Generated applet files exist only under `dist/`.
- Python domain logic remains independent from D-Bus adapters.
