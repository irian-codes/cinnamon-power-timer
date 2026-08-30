#!/usr/bin/env python3
"""Polkit-authorized system helper for scheduled power actions."""

from __future__ import annotations

import json
import signal
from time import monotonic

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

from cinnamon_power_timer.helper_core import (
    LOGIN1_ACTIONS,
    LOGIN1_ROOT_CHECK_INHIBITORS,
    PrivilegedAction,
    ScheduledAction,
    ScheduleRegistry,
    authorize_available_action,
    validate_action,
    validate_delay,
)

BUS_NAME = "org.irian.CinnamonPowerTimer.Helper"
OBJECT_PATH = "/org/irian/CinnamonPowerTimer/Helper"
INTERFACE = BUS_NAME
LOGIN1_NAME = "org.freedesktop.login1"
LOGIN1_PATH = "/org/freedesktop/login1"
LOGIN1_MANAGER = "org.freedesktop.login1.Manager"
POLKIT_NAME = "org.freedesktop.PolicyKit1"
POLKIT_PATH = "/org/freedesktop/PolicyKit1/Authority"
POLKIT_INTERFACE = "org.freedesktop.PolicyKit1.Authority"
SCHEDULE_ACTION = "org.irian.CinnamonPowerTimer.schedule-power-action"
IDLE_EXIT_SECONDS = 30


class PowerTimerHelper(dbus.service.Object):
    def __init__(self, bus: dbus.Bus, loop: GLib.MainLoop) -> None:
        self.bus = bus
        self.loop = loop
        self.schedules = ScheduleRegistry()
        self.idle_since = monotonic()
        self.login1 = dbus.Interface(bus.get_object(LOGIN1_NAME, LOGIN1_PATH), LOGIN1_MANAGER)
        bus_name = dbus.service.BusName(BUS_NAME, bus=bus, do_not_queue=True)
        super().__init__(bus_name, OBJECT_PATH)
        bus.add_signal_receiver(
            self._on_prepare_for_sleep,
            signal_name="PrepareForSleep",
            dbus_interface=LOGIN1_MANAGER,
            bus_name=LOGIN1_NAME,
        )
        bus.add_signal_receiver(
            self._on_session_removed, signal_name="SessionRemoved", dbus_interface=LOGIN1_MANAGER, bus_name=LOGIN1_NAME
        )
        GLib.timeout_add(200, self._tick)

    def _caller_uid(self, sender: str) -> int:
        dbus_proxy = dbus.Interface(
            self.bus.get_object("org.freedesktop.DBus", "/org/freedesktop/DBus"), "org.freedesktop.DBus"
        )
        return int(dbus_proxy.GetConnectionUnixUser(sender))

    def _authorize(self, sender: str) -> None:
        authority = dbus.Interface(self.bus.get_object(POLKIT_NAME, POLKIT_PATH), POLKIT_INTERFACE)
        subject = ("system-bus-name", {"name": dbus.String(sender, variant_level=1)})
        authorized, _challenge, _details = authority.CheckAuthorization(
            subject,
            SCHEDULE_ACTION,
            {},
            dbus.UInt32(1),
            "",
            timeout=120,
        )
        if not bool(authorized):
            raise PermissionError("Authorization was denied")

    def _capability(self, action: PrivilegedAction) -> str:
        return str(getattr(self.login1, LOGIN1_ACTIONS[action].capability_method)())

    def _session_properties(self, session_id: str):
        session_path = self.login1.GetSession(session_id)
        proxy = self.bus.get_object(LOGIN1_NAME, session_path)
        return dbus.Interface(proxy, "org.freedesktop.DBus.Properties")

    def _validate_session_owner(self, session_id: str, uid: int) -> None:
        user = self._session_properties(session_id).Get("org.freedesktop.login1.Session", "User")
        if int(user[0]) != uid:
            raise PermissionError("The selected session belongs to another user")

    def _session_active(self, session_id: str) -> bool:
        try:
            return bool(self._session_properties(session_id).Get("org.freedesktop.login1.Session", "Active"))
        except dbus.DBusException:
            return False

    @dbus.service.method(INTERFACE, in_signature="sst", out_signature="s", sender_keyword="sender")
    def Schedule(self, session_id: str, action_value: str, delay_milliseconds: int, sender: str) -> str:
        action = validate_action(str(action_value))
        uid = self._caller_uid(str(sender))
        self._validate_session_owner(str(session_id), uid)
        if not self._session_active(str(session_id)):
            raise PermissionError("The selected session is not active")
        delay = int(delay_milliseconds)
        if self.schedules.contains(uid):
            raise RuntimeError("Only one privileged timer per user is allowed")
        validate_delay(delay)
        authorize_available_action(action, self._capability(action), lambda: self._authorize(str(sender)))
        self.schedules.add(uid, str(session_id), action, delay, monotonic())
        self.idle_since = 0.0
        return json.dumps({"scheduled": True})

    @dbus.service.method(INTERFACE, in_signature="", out_signature="b", sender_keyword="sender")
    def Cancel(self, sender: str) -> bool:
        uid = self._caller_uid(str(sender))
        return self.schedules.cancel(uid)

    @dbus.service.method(INTERFACE, in_signature="", out_signature="b", sender_keyword="sender")
    def Pause(self, sender: str) -> bool:
        uid = self._caller_uid(str(sender))
        return self.schedules.pause(uid, monotonic())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="b", sender_keyword="sender")
    def Resume(self, sender: str) -> bool:
        uid = self._caller_uid(str(sender))
        return self.schedules.resume(uid, monotonic())

    @dbus.service.method(INTERFACE, in_signature="", out_signature="s")
    def GetCapabilities(self) -> str:
        capabilities: dict[str, bool] = {}
        for action, action_methods in LOGIN1_ACTIONS.items():
            try:
                value = str(getattr(self.login1, action_methods.capability_method)())
                capabilities[action.value] = value in ("yes", "challenge")
            except dbus.DBusException:
                capabilities[action.value] = False
        return json.dumps(capabilities)

    @dbus.service.signal(INTERFACE, signature="uss")
    def ActionFinished(self, uid: int, result: str, message: str) -> None:
        pass

    def _tick(self) -> bool:
        now = monotonic()
        if not self.schedules:
            if not self.idle_since:
                self.idle_since = now
            elif now - self.idle_since >= IDLE_EXIT_SECONDS:
                self.loop.quit()
                return GLib.SOURCE_REMOVE
        else:
            self.idle_since = 0.0
        expired = self.schedules.pop_expired(now)
        for schedule in expired:
            self._execute(schedule)
        return GLib.SOURCE_CONTINUE

    def _execute(self, schedule: ScheduledAction) -> None:
        if not self._session_active(schedule.session_id):
            self.ActionFinished(
                schedule.uid,
                "missed",
                f"The {schedule.action.value} action was skipped because your session was inactive.",
            )
            return
        try:
            method = LOGIN1_ACTIONS[schedule.action].execution_method
            getattr(self.login1, method)(dbus.UInt64(LOGIN1_ROOT_CHECK_INHIBITORS))
        except dbus.DBusException as exc:
            self.ActionFinished(schedule.uid, "failed", f"The {schedule.action.value} action failed: {exc}")
            return
        self.ActionFinished(schedule.uid, "completed", f"The {schedule.action.value} timer completed.")

    def _on_prepare_for_sleep(self, sleeping: bool) -> None:
        if bool(sleeping):
            self.schedules.clear()

    def _on_session_removed(self, session_id: str, session_path: dbus.ObjectPath) -> None:
        del session_path
        self.schedules.remove_session(str(session_id))

    def shutdown(self) -> bool:
        self.schedules.clear()
        self.loop.quit()
        return GLib.SOURCE_REMOVE


def main() -> None:
    DBusGMainLoop(set_as_default=True)
    loop = GLib.MainLoop()
    helper = PowerTimerHelper(dbus.SystemBus(), loop)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, helper.shutdown)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, helper.shutdown)
    loop.run()


if __name__ == "__main__":
    main()
