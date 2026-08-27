# Applet Menu Design

Status: ready for implementation.

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

## Implementation constraints

- Preserve the Cinnamon 6.6 `getActiveItem` compatibility shim.
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
