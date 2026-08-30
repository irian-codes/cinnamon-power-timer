# Cinnamon Power Timer

Cinnamon Power Timer is a Linux Mint Cinnamon applet. It schedules one
per-user timer that locks, suspends, hibernates, reboots, or powers off
the machine.

The panel remains the visible surface. A per-user service owns timer state.
A narrow privileged helper handles machine power operations. Active timers
survive Cinnamon restarts, but never survive logout, suspend, hibernation,
reboot, or shutdown.

See [product requirements](docs/plans/001-product-requirements.md) for complete
behavior. See [architecture](docs/architecture.md) for D-Bus contracts.

## Status

The MVP implementation is under active development. Lock and power actions
require manual Linux Mint testing before release. Human review remains required
before installing privileged components.

## Repository layout

```text
applet/cinnamon-power-timer@irian-codes/
  src/                    TypeScript applet source
  metadata.json           Cinnamon metadata source
  settings-schema.json    Applet settings source
  stylesheet.css          Cinnamon stylesheet source
dist/applet/              Generated installable applet
src/cinnamon_power_timer/ Pure Python timer domain logic
src/timer-service/        Per-user D-Bus service
src/privileged-helper/    Polkit-authorized system helper
packaging/                systemd, D-Bus, and Polkit files
scripts/                  Repeatable build scripts
tests/                    Vitest and Pytest suites
```

Generated JavaScript exists only under `dist/`. Never edit or commit it.
Installation targets always consume `dist/`, never TypeScript source.

## Tooling

JavaScript and TypeScript use:

- Bun for dependencies and scripts.
- Biome for formatting and linting.
- TypeScript for strict static checking.
- Vitest for unit tests.
- esbuild for GJS-compatible applet output.

Python uses an isolated `.venv` managed by uv:

- Ruff for formatting and linting.
- Mypy for strict domain-layer checking.
- Pytest for unit tests.

Runtime integration still uses system `python3-dbus` and `python3-gi` packages.
They intentionally remain outside the development virtual environment.

## Requirements

Development requires:

- Bun 1.3 or newer.
- uv.
- Cinnamon with the `cjs` executable.
- Python 3.11 or newer.
- System `python3-dbus` and `python3-gi` packages.

Run `make help` for every supported command and destination option.

## Development workflow

Install locked dependencies and create `.venv`:

```sh
make bootstrap
```

Validate both languages and generate `dist/`:

```sh
make build
```

`make check` is an alias for the same complete workflow. It performs:

1. Locked dependency synchronization.
2. Biome formatting and lint checks.
3. Strict TypeScript checking.
4. Vitest execution.
5. Ruff formatting and lint checks.
6. Mypy checking.
7. Pytest execution.
8. Python, XML, JSON, and GJS syntax checks.
9. Applet generation under `dist/`.

Format all maintained sources:

```sh
make format
```

Run only unit tests:

```sh
make test
```

## Installation

For applet-only development, one command validates, builds, and installs:

```sh
make install-applet
```

The default destination is:

```text
~/.local/share/cinnamon/applets/cinnamon-power-timer@irian-codes
```

Override it when needed:

```sh
make install-applet USER_APPLET_DIR=/custom/applet/path
```

For a complete machine installation, validate as your user. Only file copying
runs through sudo:

```sh
make install-system
sudo systemctl daemon-reload
systemctl --user daemon-reload
```

Restart Cinnamon. Then add **Cinnamon Power Timer** through Applets.

Packaging can stage a complete filesystem without sudo:

```sh
make install DESTDIR=/tmp/cinnamon-power-timer-root
```

`PREFIX`, `DESTDIR`, and individual destination directories are configurable.
Inspect their current values through `make help`.

## Security model

The applet cannot submit arbitrary commands. The helper accepts only Suspend,
Hibernate, Reboot, and Power Off. It derives caller identity from D-Bus,
verifies session ownership, authenticates scheduling through Polkit, and
re-checks active-session ownership before execution.

Polkit evaluates every privileged scheduling request. Its configured policy
decides whether authorization is cached, prompted, or denied. At expiry, the
helper calls logind while explicitly honoring active system inhibitors.

Lock remains session-scoped and activates Cinnamon's screensaver over the
session bus. Each Unix user owns one independent timer.

## License

GPL-3.0-or-later.
