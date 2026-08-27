#!/usr/bin/env python3
"""Authoritative per-user timer service for Cinnamon Power Timer."""

from __future__ import annotations

import json
import math
import os
import signal
from contextlib import suppress
from time import monotonic
from typing import Any

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

from cinnamon_power_timer.timer_core import TimerAction, TimerEngine, TimerState, TimerStatus

BUS_NAME = "org.irian.CinnamonPowerTimer"
OBJECT_PATH = "/org/irian/CinnamonPowerTimer"
INTERFACE = BUS_NAME
HELPER_NAME = f"{BUS_NAME}.Helper"
HELPER_PATH = "/org/irian/CinnamonPowerTimer/Helper"
HELPER_INTERFACE = HELPER_NAME
LOGIN1_NAME = "org.freedesktop.login1"
LOGIN1_PATH = "/org/freedesktop/login1"
LOGIN1_MANAGER = "org.freedesktop.login1.Manager"
IDLE_EXIT_SECONDS = 30


class TimerService(dbus.service.Object):
    def __init__(self, bus: dbus.Bus, loop: GLib.MainLoop) -> None:
        self.bus = bus
        self.loop = loop
        self.engine = TimerEngine()
        self.system_bus = dbus.SystemBus()
        self._helper = None
        self._last_state_json = ""
        self._idle_since = monotonic()
        bus_name = dbus.service.BusName(BUS_NAME, bus=bus, do_not_queue=True)
        super().__init__(bus_name, OBJECT_PATH)
        self._connect_system_signals()
        GLib.timeout_add(250, self._tick)

    def _connect_system_signals(self) -> None:
        self.system_bus.add_signal_receiver(
            self._on_prepare_for_sleep,
            signal_name="PrepareForSleep",
            dbus_interface=LOGIN1_MANAGER,
            bus_name=LOGIN1_NAME,
        )
        self.system_bus.add_signal_receiver(
            self._on_helper_finished,
            signal_name="ActionFinished",
            dbus_interface=HELPER_INTERFACE,
            bus_name=HELPER_NAME,
        )
        self.system_bus.add_signal_receiver(
            self._on_system_name_owner_changed,
            signal_name="NameOwnerChanged",
            dbus_interface="org.freedesktop.DBus",
            bus_name="org.freedesktop.DBus",
        )
        self.bus.add_signal_receiver(
            self._on_name_owner_changed,
            signal_name="NameOwnerChanged",
            dbus_interface="org.freedesktop.DBus",
            bus_name="org.freedesktop.DBus",
        )

    def _helper_interface(self):
        if self._helper is None:
            proxy = self.system_bus.get_object(HELPER_NAME, HELPER_PATH)
            self._helper = dbus.Interface(proxy, HELPER_INTERFACE)
        return self._helper

    def _session_path(self, session_id: str) -> dbus.ObjectPath:
        manager = dbus.Interface(self.system_bus.get_object(LOGIN1_NAME, LOGIN1_PATH), LOGIN1_MANAGER)
        return manager.GetSession(session_id)

    def _session_active(self, session_id: str) -> bool:
        try:
            proxy = self.system_bus.get_object(LOGIN1_NAME, self._session_path(session_id))
            props = dbus.Interface(proxy, "org.freedesktop.DBus.Properties")
            return bool(props.Get("org.freedesktop.login1.Session", "Active"))
        except dbus.DBusException:
            return False

    def _session_belongs_to_user(self, session_id: str) -> bool:
        try:
            proxy = self.system_bus.get_object(LOGIN1_NAME, self._session_path(session_id))
            props = dbus.Interface(proxy, "org.freedesktop.DBus.Properties")
            user = props.Get("org.freedesktop.login1.Session", "User")
            return int(user[0]) == os.getuid()
        except (dbus.DBusException, IndexError, TypeError, ValueError):
            return False

    def _schedule_privileged(self, timer: TimerState) -> None:
        delay_ms = max(1, int(timer.remaining() * 1000))
        self._helper_interface().Schedule(timer.session_id, timer.action.value, dbus.UInt64(delay_ms))
        timer.helper_scheduled = True

    def _cancel_helper(self, timer: TimerState | None) -> None:
        if not timer or not timer.helper_scheduled:
            return
        with suppress(dbus.DBusException):
            self._helper_interface().Cancel()
        timer.helper_scheduled = False

    def _pause_helper(self, timer: TimerState) -> None:
        if timer.helper_scheduled and not bool(self._helper_interface().Pause()):
            raise RuntimeError("The privileged action could not be paused")

    def _resume_helper(self, timer: TimerState) -> None:
        if timer.helper_scheduled and not bool(self._helper_interface().Resume()):
            raise RuntimeError("The privileged action could not be resumed")

    def _state(self) -> dict[str, Any]:
        return {"status": "idle"} if self.engine.timer is None else self.engine.timer.as_dict()

    def _emit_state(self, force: bool = False) -> None:
        encoded = json.dumps(self._state(), separators=(",", ":"), sort_keys=True)
        if force or encoded != self._last_state_json:
            self._last_state_json = encoded
            self.StateChanged(encoded)

    @dbus.service.method(INTERFACE, in_signature="s", out_signature="s", sender_keyword="sender")
    def CreateTimer(self, request_json: str, sender: str) -> str:
        del sender
        request = json.loads(str(request_json))
        session_id = str(request.get("session_id") or os.environ.get("XDG_SESSION_ID") or "")
        if not session_id:
            raise ValueError("Unable to identify the graphical session")
        if not self._session_belongs_to_user(session_id):
            raise PermissionError("The graphical session belongs to another user")
        if not self._session_active(session_id):
            raise ValueError("The graphical session is not active")
        timer = self.engine.create(request, session_id)
        self._idle_since = 0.0
        try:
            if timer.action != TimerAction.LOCK:
                self._schedule_privileged(timer)
        except Exception:
            self.engine.clear()
            raise
        self._emit_state(force=True)
        return json.dumps(self._state())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s")
    def GetState(self) -> str:
        return json.dumps(self._state())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s", sender_keyword="sender")
    def BeginCancellation(self, sender: str) -> str:
        timer = self.engine.begin_cancellation(str(sender))
        try:
            self._pause_helper(timer)
        except Exception:
            self.engine.abort_cancellation(str(sender))
            raise
        self._emit_state(force=True)
        return json.dumps(self._state())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s", sender_keyword="sender")
    def AbortCancellation(self, sender: str) -> str:
        timer = self.engine.timer
        if self.engine.abort_cancellation(str(sender)):
            if timer and timer.action != TimerAction.LOCK:
                try:
                    self._resume_helper(timer)
                except Exception as exc:
                    self._fail(f"Could not resume the scheduled action: {exc}")
            self._emit_state(force=True)
        return json.dumps(self._state())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s", sender_keyword="sender")
    def ConfirmCancellation(self, sender: str) -> str:
        timer = self.engine.timer
        if timer is None or timer.status != TimerStatus.CANCELLATION_PAUSED:
            raise RuntimeError("No cancellation is in progress")
        if timer.cancellation_owner != str(sender):
            raise PermissionError("Only the cancellation owner may confirm")
        self._cancel_helper(timer)
        self.engine.clear()
        self._emit_state(force=True)
        return json.dumps(self._state())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s")
    def AcknowledgeTerminalState(self) -> str:
        timer = self.engine.timer
        if timer is None or timer.status not in (TimerStatus.MISSED, TimerStatus.FAILED):
            raise RuntimeError("No terminal state requires acknowledgement")
        self.engine.clear()
        self._emit_state(force=True)
        return json.dumps(self._state())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s")
    def GetCapabilities(self) -> str:
        capabilities = {action.value: action == TimerAction.LOCK for action in TimerAction}
        with suppress(dbus.DBusException, ValueError):
            capabilities.update(json.loads(str(self._helper_interface().GetCapabilities())))
        return json.dumps(capabilities)

    @dbus.service.signal(INTERFACE, signature="s")
    def StateChanged(self, state_json: str) -> None:
        pass

    @dbus.service.signal(INTERFACE, signature="s")
    def WarningCrossed(self, level_json: str) -> None:
        pass

    @dbus.service.signal(INTERFACE, signature="s")
    def TimerExpired(self, result_json: str) -> None:
        pass

    def _tick(self) -> bool:
        timer = self.engine.timer
        if timer is None:
            if not self._idle_since:
                self._idle_since = monotonic()
            elif monotonic() - self._idle_since >= IDLE_EXIT_SECONDS:
                self.loop.quit()
                return GLib.SOURCE_REMOVE
            return GLib.SOURCE_CONTINUE
        active = self._session_active(timer.session_id)
        if active != timer.last_session_active:
            timer.last_session_active = active
            if (
                not active
                and timer.cancel_on_user_switch
                and timer.status in (TimerStatus.ACTIVE, TimerStatus.CANCELLATION_PAUSED)
            ):
                self._cancel_helper(timer)
                self.engine.clear()
                self._emit_state(force=True)
                return GLib.SOURCE_CONTINUE
            if not active and timer.status == TimerStatus.CANCELLATION_PAUSED:
                self.engine.abort_cancellation(timer.cancellation_owner)
                if timer.action != TimerAction.LOCK:
                    try:
                        self._resume_helper(timer)
                    except Exception as exc:
                        self._fail(f"Could not resume the scheduled action: {exc}", active=False)
                self._emit_state(force=True)
            if active:
                self._deliver_deferred(timer)
        if timer.status == TimerStatus.ACTIVE:
            remaining = timer.remaining(self.engine.clock())
            self._check_warnings(timer, remaining, active)
            if remaining <= 0 and timer.action == TimerAction.LOCK:
                self._expire_lock(timer, active)
        self._emit_state()
        return GLib.SOURCE_CONTINUE

    def _check_warnings(self, timer: TimerState, remaining: float, active: bool) -> None:
        crossed: list[str] = []
        for index, warning in enumerate(timer.warnings):
            if warning.enabled and not warning.fired and remaining <= warning.seconds:
                warning.fired = True
                crossed.append("yellow" if index == 0 else "red")
        if not crossed:
            return
        level = "red" if "red" in crossed else "yellow"
        timer.warning_level = level
        if active:
            self.WarningCrossed(json.dumps({"level": level, "remaining_seconds": int(math.ceil(remaining))}))
        else:
            timer.deferred_warning = level if level == "red" or not timer.deferred_warning else timer.deferred_warning

    def _deliver_deferred(self, timer: TimerState) -> None:
        if timer.deferred_warning:
            self.WarningCrossed(
                json.dumps(
                    {
                        "level": timer.deferred_warning,
                        "remaining_seconds": int(math.ceil(timer.remaining())),
                        "deferred": True,
                    }
                )
            )
            timer.deferred_warning = None
        if timer.terminal_notification_pending:
            self.TimerExpired(json.dumps({"status": timer.status.value, "message": timer.terminal_message}))
            timer.terminal_notification_pending = False

    def _expire_lock(self, timer: TimerState, active: bool) -> None:
        if not active:
            self._miss("The lock action was skipped because your session was inactive.", False)
            return
        try:
            proxy = self.system_bus.get_object(LOGIN1_NAME, self._session_path(timer.session_id))
            session = dbus.Interface(proxy, "org.freedesktop.login1.Session")
            props = dbus.Interface(proxy, "org.freedesktop.DBus.Properties")
            if not bool(props.Get("org.freedesktop.login1.Session", "LockedHint")):
                session.Lock()
        except dbus.DBusException as exc:
            self._fail(f"The lock action failed: {exc}")
            return
        self.TimerExpired(json.dumps({"status": "completed", "message": "Lock timer completed."}))
        self.engine.clear()
        self._emit_state(force=True)

    def _on_helper_finished(self, uid: int, result: str, message: str) -> None:
        if int(uid) != os.getuid():
            return
        timer = self.engine.timer
        if timer is None or timer.action == TimerAction.LOCK:
            return
        timer.helper_scheduled = False
        active = self._session_active(timer.session_id)
        if str(result) == "completed":
            self.TimerExpired(json.dumps({"status": "completed", "message": str(message)}))
            self.engine.clear()
            self._emit_state(force=True)
        elif str(result) == "missed":
            self._miss(str(message), active)
        else:
            self._fail(str(message), active)

    def _miss(self, message: str, active: bool) -> None:
        timer = self.engine.timer
        if timer is None:
            return
        timer.status = TimerStatus.MISSED
        timer.terminal_message = message
        timer.deferred_warning = None
        timer.terminal_notification_pending = not active
        if active:
            self.TimerExpired(json.dumps({"status": "missed", "message": message}))
        self._emit_state(force=True)

    def _fail(self, message: str, active: bool | None = None) -> None:
        timer = self.engine.timer
        if timer is None:
            return
        timer.status = TimerStatus.FAILED
        timer.terminal_message = message
        timer.deferred_warning = None
        is_active = self._session_active(timer.session_id) if active is None else active
        timer.terminal_notification_pending = not is_active
        if is_active:
            self.TimerExpired(json.dumps({"status": "failed", "message": message}))
        self._emit_state(force=True)

    def _on_name_owner_changed(self, name: str, old_owner: str, new_owner: str) -> None:
        del name
        timer = self.engine.timer
        if (
            timer
            and timer.status == TimerStatus.CANCELLATION_PAUSED
            and str(old_owner) == timer.cancellation_owner
            and not str(new_owner)
        ):
            self.engine.abort_cancellation(timer.cancellation_owner)
            if timer.action != TimerAction.LOCK:
                try:
                    self._resume_helper(timer)
                except Exception as exc:
                    self._fail(f"Could not resume the scheduled action: {exc}")
            self._emit_state(force=True)

    def _on_system_name_owner_changed(self, name: str, old_owner: str, new_owner: str) -> None:
        timer = self.engine.timer
        if str(name) == HELPER_NAME and str(old_owner) and not str(new_owner) and timer and timer.helper_scheduled:
            timer.helper_scheduled = False
            self._fail("The privileged timer helper stopped before the action completed.")

    def _on_prepare_for_sleep(self, sleeping: bool) -> None:
        if bool(sleeping) and self.engine.timer:
            self._cancel_helper(self.engine.timer)
            self.engine.clear()
            self._emit_state(force=True)

    def shutdown(self) -> bool:
        self._cancel_helper(self.engine.timer)
        self.engine.clear()
        self.loop.quit()
        return GLib.SOURCE_REMOVE


def main() -> None:
    DBusGMainLoop(set_as_default=True)
    loop = GLib.MainLoop()
    service = TimerService(dbus.SessionBus(), loop)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, service.shutdown)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, service.shutdown)
    loop.run()


if __name__ == "__main__":
    main()
