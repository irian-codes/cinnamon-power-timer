from __future__ import annotations

from typing import Any

from cinnamon_power_timer.session_actions import (
    CINNAMON_SCREENSAVER_INTERFACE,
    CINNAMON_SCREENSAVER_NAME,
    CINNAMON_SCREENSAVER_PATH,
    lock_cinnamon_screen,
)


class FakeSessionBus:
    def __init__(self) -> None:
        self.requested_object: tuple[str, str] | None = None
        self.proxy = object()

    def get_object(self, bus_name: str, object_path: str) -> object:
        self.requested_object = (bus_name, object_path)
        return self.proxy


class FakeScreenSaver:
    def __init__(self) -> None:
        self.lock_messages: list[str] = []

    def Lock(self, message: str) -> None:
        self.lock_messages.append(message)


def test_lock_activates_cinnamon_screensaver_over_session_bus() -> None:
    bus = FakeSessionBus()
    screensaver = FakeScreenSaver()
    requested_interface: list[tuple[object, str]] = []

    def interface_factory(proxy: Any, interface_name: str) -> FakeScreenSaver:
        requested_interface.append((proxy, interface_name))
        return screensaver

    lock_cinnamon_screen(bus, interface_factory)

    assert bus.requested_object == (CINNAMON_SCREENSAVER_NAME, CINNAMON_SCREENSAVER_PATH)
    assert requested_interface == [(bus.proxy, CINNAMON_SCREENSAVER_INTERFACE)]
    assert screensaver.lock_messages == [""]
