"""Session-scoped action adapters."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

CINNAMON_SCREENSAVER_NAME = "org.cinnamon.ScreenSaver"
CINNAMON_SCREENSAVER_PATH = "/org/cinnamon/ScreenSaver"
CINNAMON_SCREENSAVER_INTERFACE = CINNAMON_SCREENSAVER_NAME


def lock_cinnamon_screen(session_bus: Any, interface_factory: Callable[[Any, str], Any]) -> None:
    """Activate Cinnamon's screensaver and wait until locking completes."""
    proxy = session_bus.get_object(CINNAMON_SCREENSAVER_NAME, CINNAMON_SCREENSAVER_PATH)
    interface_factory(proxy, CINNAMON_SCREENSAVER_INTERFACE).Lock("")
