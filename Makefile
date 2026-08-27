APPLET_UUID := cinnamon-power-timer@irian-codes
PREFIX ?= /usr
DESTDIR ?=
XDG_DATA_HOME ?= $(HOME)/.local/share

DIST_APPLET_DIR := dist/applet/$(APPLET_UUID)
USER_APPLET_DIR ?= $(XDG_DATA_HOME)/cinnamon/applets/$(APPLET_UUID)
APPLET_INSTALL_DIR ?= $(DESTDIR)$(PREFIX)/share/cinnamon/applets/$(APPLET_UUID)
PYTHON_LIB_DIR ?= $(DESTDIR)$(PREFIX)/lib/cinnamon-power-timer
SYSTEMD_SYSTEM_DIR ?= $(DESTDIR)$(PREFIX)/lib/systemd/system
SYSTEMD_USER_DIR ?= $(DESTDIR)$(PREFIX)/lib/systemd/user
DBUS_SESSION_DIR ?= $(DESTDIR)$(PREFIX)/share/dbus-1/services
DBUS_SYSTEM_DIR ?= $(DESTDIR)$(PREFIX)/share/dbus-1/system-services
DBUS_POLICY_DIR ?= $(DESTDIR)$(PREFIX)/share/dbus-1/system.d
POLKIT_POLICY_DIR ?= $(DESTDIR)$(PREFIX)/share/polkit-1/actions

.DEFAULT_GOAL := help

.PHONY: help bootstrap format test validate check build install install-system install-files install-applet uninstall-applet clean

help:
	@echo "Cinnamon Power Timer development commands"
	@echo
	@echo "  make bootstrap       Install locked Bun and Python tooling"
	@echo "  make format          Format TypeScript, JSON, CSS, and Python"
	@echo "  make test            Run Vitest and Pytest"
	@echo "  make validate        Run formatting, linting, typing, and tests"
	@echo "  make build           Validate and generate dist/ applet files"
	@echo "  make check           Alias for make build"
	@echo "  make install-applet  Build and copy into the user applet directory"
	@echo "  make install         Build and install or stage every component"
	@echo "  make install-system  Build, validate, then sudo-copy system files"
	@echo "  make install-files   Install prebuilt files without validation"
	@echo "  make uninstall-applet Remove the user development applet"
	@echo "  make clean           Remove generated dist files"
	@echo
	@echo "Configurable destinations"
	@echo "  PREFIX=$(PREFIX)"
	@echo "  DESTDIR=$(DESTDIR)"
	@echo "  USER_APPLET_DIR=$(USER_APPLET_DIR)"
	@echo "  APPLET_INSTALL_DIR=$(APPLET_INSTALL_DIR)"
	@echo "  PYTHON_LIB_DIR=$(PYTHON_LIB_DIR)"

bootstrap:
	bun install --frozen-lockfile
	uv sync --locked

format: bootstrap
	bun run format
	uv run ruff format src tests/python
	uv run ruff check --fix src tests/python

test: bootstrap
	bun run test
	uv run pytest

validate: bootstrap
	bun run check
	uv run ruff format --check src tests/python
	uv run ruff check src tests/python
	uv run mypy
	uv run pytest
	PYTHONPATH=src python3 -m py_compile \
		src/timer-service/cinnamon_power_timer_service.py \
		src/privileged-helper/cinnamon_power_timer_helper.py
	python3 -c "from xml.etree import ElementTree; [ElementTree.parse(path) for path in ['packaging/polkit/org.irian.CinnamonPowerTimer.policy', 'packaging/dbus/org.irian.CinnamonPowerTimer.Helper.conf']]"

build: validate
	bun run build
	cjs -c "const GLib=imports.gi.GLib; const ByteArray=imports.byteArray; const data=GLib.file_get_contents('$(DIST_APPLET_DIR)/applet.js')[1]; new Function(ByteArray.toString(data));"
	python3 -m json.tool "$(DIST_APPLET_DIR)/metadata.json" >/dev/null
	python3 -m json.tool "$(DIST_APPLET_DIR)/settings-schema.json" >/dev/null

check: build

install: build
	$(MAKE) install-files

install-system: build
	sudo $(MAKE) install-files \
		PREFIX="$(PREFIX)" \
		DESTDIR="$(DESTDIR)" \
		APPLET_INSTALL_DIR="$(APPLET_INSTALL_DIR)" \
		PYTHON_LIB_DIR="$(PYTHON_LIB_DIR)" \
		SYSTEMD_SYSTEM_DIR="$(SYSTEMD_SYSTEM_DIR)" \
		SYSTEMD_USER_DIR="$(SYSTEMD_USER_DIR)" \
		DBUS_SESSION_DIR="$(DBUS_SESSION_DIR)" \
		DBUS_SYSTEM_DIR="$(DBUS_SYSTEM_DIR)" \
		DBUS_POLICY_DIR="$(DBUS_POLICY_DIR)" \
		POLKIT_POLICY_DIR="$(POLKIT_POLICY_DIR)"

install-files:
	@test -f "$(DIST_APPLET_DIR)/applet.js" || { echo "Run 'make build' first."; exit 1; }
	install -d "$(APPLET_INSTALL_DIR)"
	cp -R "$(DIST_APPLET_DIR)/." "$(APPLET_INSTALL_DIR)/"
	install -Dm755 src/timer-service/cinnamon_power_timer_service.py "$(PYTHON_LIB_DIR)/cinnamon_power_timer_service.py"
	install -Dm755 src/privileged-helper/cinnamon_power_timer_helper.py "$(PYTHON_LIB_DIR)/cinnamon_power_timer_helper.py"
	install -Dm644 src/cinnamon_power_timer/__init__.py "$(PYTHON_LIB_DIR)/cinnamon_power_timer/__init__.py"
	install -Dm644 src/cinnamon_power_timer/helper_core.py "$(PYTHON_LIB_DIR)/cinnamon_power_timer/helper_core.py"
	install -Dm644 src/cinnamon_power_timer/timer_core.py "$(PYTHON_LIB_DIR)/cinnamon_power_timer/timer_core.py"
	install -Dm644 packaging/systemd/cinnamon-power-timer.service "$(SYSTEMD_USER_DIR)/cinnamon-power-timer.service"
	install -Dm644 packaging/systemd/cinnamon-power-timer-helper.service "$(SYSTEMD_SYSTEM_DIR)/cinnamon-power-timer-helper.service"
	install -Dm644 packaging/dbus/org.irian.CinnamonPowerTimer.service "$(DBUS_SESSION_DIR)/org.irian.CinnamonPowerTimer.service"
	install -Dm644 packaging/dbus/org.irian.CinnamonPowerTimer.Helper.service "$(DBUS_SYSTEM_DIR)/org.irian.CinnamonPowerTimer.Helper.service"
	install -Dm644 packaging/dbus/org.irian.CinnamonPowerTimer.Helper.conf "$(DBUS_POLICY_DIR)/org.irian.CinnamonPowerTimer.Helper.conf"
	install -Dm644 packaging/polkit/org.irian.CinnamonPowerTimer.policy "$(POLKIT_POLICY_DIR)/org.irian.CinnamonPowerTimer.policy"

install-applet: build
	install -d "$(USER_APPLET_DIR)"
	cp -R "$(DIST_APPLET_DIR)/." "$(USER_APPLET_DIR)/"
	@echo "Installed applet into $(USER_APPLET_DIR)"

uninstall-applet:
	rm -rf "$(USER_APPLET_DIR)"

clean:
	rm -rf dist
