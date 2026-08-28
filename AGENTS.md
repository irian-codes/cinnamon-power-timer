# Repository Instructions

- Treat `dist/` as generated output. Never edit or commit it.
- Maintain applet behavior in TypeScript under `applet/*/src/`.
- Preserve the Cinnamon 6.6 combo-menu compatibility shim before `setActiveItem`.
- Initialize registered GObject fields only inside `_init`; class initializers run afterward.
- Keep countdown limits aligned across the applet, service, and helper.
- Keep panel countdown formatting centralized in `timer-format.ts`.
- Derive warning colors from thresholds, independent from notification state.
- Gate timer creation while its D-Bus request remains pending.
- Validate raw countdown numbers before integer conversion.
- Update active-menu countdown labels without rebuilding menu actors.
- Settle cancellation dialogs idempotently on close, destroy, or visibility loss.
- Keep Cinnamon and D-Bus adapters thin around testable domain logic.
- Put pure Python logic under `src/cinnamon_power_timer/`.
- Run `make build` before handing off repository changes.
- Use `make install-applet` for local UI development.
- Never execute power-action smoke tests without explicit approval.
