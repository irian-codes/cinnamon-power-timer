# Repository Instructions

- Treat `dist/` as generated output. Never edit or commit it.
- Maintain applet behavior in TypeScript under `applet/*/src/`.
- Preserve the Cinnamon 6.6 combo-menu compatibility shim before `setActiveItem`.
- Settle cancellation dialogs idempotently on close, destroy, or visibility loss.
- Keep Cinnamon and D-Bus adapters thin around testable domain logic.
- Put pure Python logic under `src/cinnamon_power_timer/`.
- Run `make build` before handing off repository changes.
- Use `make install-applet` for local UI development.
- Never execute power-action smoke tests without explicit approval.
