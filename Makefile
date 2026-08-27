APPLET_UUID := cinnamon-power-timer@irian-codes
APPLET_DIR := $(HOME)/.local/share/cinnamon/applets/$(APPLET_UUID)

.PHONY: help install-applet uninstall-applet check-python

help:
	@echo "Targets:"
	@echo "  install-applet   Install/update the Cinnamon applet for the current user"
	@echo "  uninstall-applet Remove the development applet"
	@echo "  check-python     Syntax-check Python service scaffolds"

install-applet:
	mkdir -p "$(APPLET_DIR)"
	cp -R applet/$(APPLET_UUID)/* "$(APPLET_DIR)/"
	@echo "Applet installed to $(APPLET_DIR). Reload Cinnamon or re-add the applet as needed."

uninstall-applet:
	rm -rf "$(APPLET_DIR)"

check-python:
	python3 -m py_compile src/timer-service/cinnamon_power_timer_service.py
	python3 -m py_compile src/privileged-helper/cinnamon_power_timer_helper.py
