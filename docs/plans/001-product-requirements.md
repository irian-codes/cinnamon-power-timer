# Cinnamon Lock & Power Timer — Product Requirements

## 1. Summary

A small Linux Mint Cinnamon applet that lets a user create a timer which performs a predefined session or power action when it expires.

The applet supports two timer modes:

- **At time** — e.g. `19:00`
- **Countdown** — e.g. `45 minutes`

While active, the Cinnamon panel continuously displays an action-specific icon plus remaining time.

Only **one active timer per Unix user** is allowed. Different Unix users may each have their own independent timer.

The Cinnamon applet is the frontend. Timer execution is handled independently in the background so that active timers survive Cinnamon/app graphical restarts and user switching.

## 2. Product Goal

The workflow should be extremely fast:

> Decide when I am stopping → choose what happens → keep the deadline visibly counting down → automatically perform the action.

Primary use case:

> At 19:00, lock my computer.

Secondary examples:

> In 45 minutes, suspend.

> At 23:30, power off.

## 3. Target Platform

MVP target: **Linux Mint Cinnamon**.

Correct Cinnamon integration takes priority over generic Linux desktop support.

## 4. Core Constraints

- One active timer per Unix user.
- Different Unix users may each have one independent timer.
- No simultaneous timers within the same user account.
- No arbitrary command execution.
- Only predefined supported actions may execute.
- Timers do not survive logout, suspend, hibernate, reboot, or shutdown.
- Timers do survive Cinnamon/app graphical restarts.
- Timers continue while the screen is merely locked.
- Timers normally continue while another user is switched into.

## 5. Supported Timer Actions

MVP actions:

- Lock
- Suspend
- Hibernate
- Reboot
- Power Off

Unavailable actions should be disabled in the UI.

`Lock` is always the default action when opening New Timer.

## 6. Panel States

### Idle

Display:

`＋ New Timer`

Clicking it opens the New Timer pane.

### Active

Display:

`action-specific symbolic icon + adaptive countdown`

Countdown formatting:

- Under 1 hour → `42:17`
- 1–24 hours → `3:42:17`
- 1+ days → `2d 03:42`

The action is conveyed by icon rather than text.

## 7. New Timer Pane

Default state:

```text
New Timer

[ At time ] [ Countdown ]

Time
[ 19 : 00 ]

Action
[ Lock ▼ ]

[ Start Timer ]
```

Countdown mode:

```text
New Timer

[ At time ] [ Countdown ]

Duration
[ 00 d 00 h 01 m ]

Action
[ Lock ▼ ]

[ Start Timer ]
```

Warning configuration, cancellation delay, and other preferences belong in Applet Settings.

## 8. Default Timer Mode

**At time** is selected by default.

Users may explicitly switch to Countdown.

Mode and action selection keep the setup pane open. It closes only after a
timer starts successfully.

Both inputs accept digits only and insert separators automatically. At-time
typing `2034` produces `20:34`. Countdown typing `031245` produces
`03 d 12 h 45 m`. Countdown requires at least one minute.

## 9. At-Time Semantics

If the requested clock time is later today, schedule it for today.

If it has already passed, resolve it to tomorrow at that time and show a confirmation dialog making that explicit.

There is no extra confirmation for Reboot or Power Off beyond pressing Start Timer.

## 10. Countdown Semantics

Countdown mode represents elapsed running time.

Countdown input uses whole days and hours. Its maximum defaults to 30 days and
is configurable between 1 and 99 days in Applet Settings.

There is no normal Pause / Resume feature.

## 11. Active Timer Pane

Clicking the active panel timer opens a small Cinnamon popup pane showing:

- selected action
- remaining time
- timer mode
- original target time for At-time mode
- original duration for Countdown mode
- Cancel Timer button

The active timer cannot be edited. Changing time or action requires cancelling it and creating a new timer.

## 12. Cancellation

Selecting Cancel Timer opens a confirmation flow with a configurable delay.

Default delay: **3 seconds**.

Setting the delay to `0` allows immediate cancellation.

While cancellation confirmation is open:

- the timer is paused
- remaining time is frozen
- expiry cannot execute

If cancellation is abandoned, the timer resumes from exactly the same remaining duration.

Closing or hiding the confirmation dialog abandons cancellation. The paused
timer menu also provides a Keep Timer recovery action.

If the cancellation frontend disappears due to Cinnamon restart, applet reload, graphical failure, or user switch, the cancellation attempt is automatically abandoned and the backend resumes the timer.

## 13. Warning System

Default warning milestones:

- 30 minutes remaining → yellow panel state + system notification
- 5 minutes remaining → red panel state + system notification

Both thresholds are configurable and independently disableable.

Warnings fire only when a running timer crosses a threshold. If a timer starts below a threshold, that warning is skipped.

Each warning milestone fires at most once per timer.

If warnings are crossed while another Unix user is active, defer them. When the timer owner returns, send only the most severe currently applicable missed warning.

While cancellation confirmation has paused the timer, use a distinct paused visual state.

After the first warning threshold, the panel applet background becomes yellow.
After the second threshold, it becomes red. Labels and icons retain readable
contrast in both states.

## 14. Session and Machine Lifecycle

### Screen lock

Timer continues. Expiry actions execute normally.

If the selected action is Lock and the session is already locked, simply complete the timer without issuing another lock request.

### Switch user

Timer continues by default.

If the timer expires while another user owns the active graphical session, do not execute the action. The action is permanently skipped.

When the owner returns:

- show a system notification explaining that the action was not performed because the session was inactive
- enter a persistent missed-timer state

Acknowledging the missed timer clears it and returns the applet to `＋ New Timer`.

Applet Settings includes **Cancel timer when switching users**, default Off.

### Explicit logout

Discard the timer, regardless of systemd user lingering.

### Suspend

Discard the timer.

### Hibernate

Discard the timer.

### Reboot / Shutdown

Discard the timer. No restoration after boot.

## 15. Cinnamon / Graphical Restarts

The timer must not depend on the lifetime of the Cinnamon applet process.

If Cinnamon crashes, restarts, or reloads:

- backend timer continues
- expiry may still execute
- when Cinnamon returns, the applet reconnects automatically
- current timer state is restored immediately
- already-fired warnings are not repeated

If the timer expires while Cinnamon is unavailable, the backend still executes the action provided the owning user's session is active.

## 16. Per-User Ownership

Each Unix user has an independent timer service.

One user's applet must never control or inspect another user's timer.

## 17. Architecture

### Cinnamon Applet

Responsibilities:

- panel UI
- New Timer pane
- active timer pane
- Applet Settings
- countdown presentation
- notifications
- user interaction

The applet is not authoritative for timer execution.

### Per-User Timer Service

Runs under `systemd --user`.

Responsibilities:

- maintain the active timer
- enforce one timer per user
- maintain authoritative timing state
- track warning milestones
- track cancellation pause state
- detect session activity and lifecycle
- expose state to the Cinnamon applet
- recover applet state after Cinnamon restart
- request/cancel privileged actions

The service should start on demand when needed.

### Privileged System Helper

Required for:

- Suspend
- Hibernate
- Reboot
- Power Off

The helper exposes only a narrow predefined API and never arbitrary command execution.

Lock remains user/session-scoped.

## 18. Authentication

If a selected power action requires elevated authorization, authentication occurs when the timer is created.

The application must never store passwords, password material, or reusable authentication credentials.

Authentication authorizes creation of the scheduled privileged operation rather than being replayed at expiry.

## 19. Privileged Action Safety

Before executing a privileged action, verify that the timer owner's graphical session is still the active session.

Locked-but-active counts as active. Switched-away does not.

The helper must never become a general-purpose root command runner.

## 20. Timer State

A timer conceptually contains:

```text
owner_uid
owner_session
mode
selected_action
created_at
remaining_or_target
paused_state
warning_state
expiry_state
```

States may include:

- active
- cancellation-paused
- missed
- failed
- completed

## 21. Clock and Time Changes

Countdown timers should use monotonic elapsed timing while the machine remains running.

At-time timers resolve the requested local wall-clock time to a concrete target instant at creation.

DST and timezone-aware APIs should be used. Major manual clock or timezone changes are edge cases and should favor predictable behavior over reinterpretation.

## 22. Failure Behavior

If an expiry action fails while the owning session is valid:

- timer is considered expired
- do not retry indefinitely
- send a system notification
- enter a persistent failed state

Acknowledging the failure clears it and returns to `＋ New Timer`.

A small bounded retry is acceptable only for clearly transient infrastructure failures.

## 23. Applet Settings

MVP settings:

- Cancellation delay — default 3 seconds; 0 disables delay
- Maximum countdown duration — default 30 days; configurable from 1–99 days
- Warning 1 — default 30 minutes; configurable/disableable
- Warning 2 — default 5 minutes; configurable/disableable
- Cancel timer on user switch — default Off

Other display customization is excluded from MVP.

## 24. No Overlay Window

There is no floating always-on-top overlay.

The persistent visible surface is the Cinnamon panel applet.

## 25. Startup Behavior

The applet exists because the user has added/enabled it in Cinnamon.

The per-user timer backend starts on demand. With no timer active, no unnecessary timer workload should remain running.

## 26. Security and Privacy

The application:

- requires no account
- requires no network access
- performs no outbound requests
- stores no passwords
- stores no reusable authentication secrets
- exposes no arbitrary privileged command execution
- isolates timer state per Unix user

## 27. Non-Goals

MVP does not include:

- Pomodoro workflows
- task lists
- productivity analytics
- calendar integration
- accounts or synchronization
- mobile integration
- website/application blocking
- arbitrary shell commands
- multiple simultaneous timers per user
- recurring schedules
- complex automation rules
- logout as a timer action
- generic cross-desktop support
- normal Pause / Resume
- timer restoration after reboot/suspend/hibernate

## 28. Packaging

Preferred MVP distribution: `.deb` for supported Linux Mint releases.

Package contents include:

- Cinnamon applet
- per-user systemd service
- privileged helper
- system service/policy configuration
- Polkit integration

## 29. MVP Acceptance Criteria

### Timer creation

- User clicks `＋ New Timer`.
- At-time mode opens by default.
- Lock is selected by default.
- User can create At-time or Countdown timers.
- Countdown uses explicit day and hour units.
- Countdown respects the configured maximum duration.
- Past At-time values resolve to tomorrow after confirmation.
- Only one active timer exists per user.

### Panel

- Active timer replaces `＋ New Timer`.
- Panel displays action-specific icon + live countdown.
- Countdown uses adaptive formatting.
- Warning colors update correctly.

### Active timer

- Clicking the active timer opens its details pane.
- Details show action, remaining time, mode, and original time/duration.
- Timer cannot be edited.
- Cancellation follows the configured delay.

### Cancellation

- Cancellation UI pauses the timer.
- Aborting cancellation resumes from identical remaining time.
- Losing the cancellation frontend automatically resumes the timer.

### Warnings

- Defaults are 30m and 5m.
- Notifications fire once per timer.
- Warning thresholds are configurable.
- Missed warnings collapse to only the most severe applicable notification on return.

### Session lifecycle

- Locking the screen does not stop the timer.
- Switching user does not stop it by default.
- Expiry while switched away does not execute the action.
- Returning after missed expiry produces a persistent acknowledgement state.
- Logout, suspend, hibernate, reboot, and shutdown destroy the timer.

### Resilience

- Cinnamon restart does not destroy the timer.
- Applet automatically reconnects afterward.
- Timer can expire correctly while the applet is unavailable.

### Actions

- Lock works without unnecessary repeated locking.
- Suspend works when available.
- Hibernate works when available.
- Reboot works when available.
- Power Off works when available.
- Privileged actions authenticate at creation when required.
- No password is stored.
- Unsupported actions cannot be selected.

### Isolation

- User A and User B can each independently own one timer.
- Neither user can manipulate the other's timer.

## 30. Product Principle

> Prefer the behavior that makes the deadline obvious, the action predictable, and the timer difficult to accidentally defeat.

Keep the product small, explicit, and dependable.
