# Applet Menu Design

Status: implemented.

## Intent

The applet is a compact desktop utility for quickly scheduling one timer.
It should feel native to Cinnamon, remain readable, and keep dangerous actions
calm until deliberately selected.

## Direction

- Follow the active Cinnamon theme for foregrounds, surfaces, focus, hover, and selection.
- Keep all ordinary text at normal theme contrast. Reserve muted styling for genuinely disabled actions.
- Use the theme selection treatment for the active timer mode.
- Reserve warning and destructive colors for their corresponding states.
- Use 16px symbolic theme icons throughout menus.
- Keep a compact density without reducing comfortable pointer targets.

## Structure

The setup menu scans in this order:

1. `New Timer` title.
2. `At time` and `Countdown` mode selection.
3. Labeled time or duration entry.
4. Compact power-action dropdown.
5. Separated, emphasized `Start Timer` action.

The power-action dropdown remains a combo menu. It opens upward on a bottom
panel, with its bottom aligned to the parent applet menu. Its bounds must remain
inside the current monitor.

Mode and action changes keep the setup menu open. Only successfully starting a
timer closes it. The action dropdown closes after selection without closing its
parent menu.

Both time fields use a digit-entry mask ending in hours and minutes. Focusing
the field selects its current value. Typing `2034` produces `20:34`; non-digit
characters are ignored. At-time accepts four digits. Countdown accepts five,
supporting durations through `168:00` without seconds.

## Implementation constraints

- Preserve the Cinnamon 6.6 `getActiveItem` compatibility shim.
- Prime Cinnamon 6.6 child-menu state before its detached combo receives focus.
- Reuse native Cinnamon style classes where possible.
- Do not derive or hardcode the currently selected theme's accent color.
- Scope sizing overrides to this applet and its detached combo menu.
- Disabled capabilities remain visibly disabled.

## Design QA

- Title, section labels, input value, and actions remain clearly readable.
- Mode selection remains obvious under light and dark Cinnamon themes.
- Every menu icon renders at 16px.
- The action dropdown never overlaps a visible bottom panel.
- Popup contents remain visible on every attached monitor.
- The setup menu remains compact at default text scaling.
- Mode switches, action selection, and invalid input keep the menu open.
- Both fields accept digit-only entry and display `HH:MM`.
