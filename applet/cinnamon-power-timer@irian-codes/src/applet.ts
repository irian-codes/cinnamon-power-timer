import { formatRemaining } from './timer-format';
import { positionDropdown } from './menu-layout';
import {
  appendTimeDigit,
  formatTimeDigits,
  removeLastTimeDigit,
  sanitizeTimeDigits,
} from './time-input';
import { parseTimerValue } from './timer-request';

const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const St = imports.gi.St;

const BUS_NAME = 'org.irian.CinnamonPowerTimer';
const OBJECT_PATH = '/org/irian/CinnamonPowerTimer';

const TIMER_IFACE = `<node>
  <interface name="org.irian.CinnamonPowerTimer">
    <method name="CreateTimer"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
    <method name="GetState"><arg type="s" direction="out"/></method>
    <method name="BeginCancellation"><arg type="s" direction="out"/></method>
    <method name="AbortCancellation"><arg type="s" direction="out"/></method>
    <method name="ConfirmCancellation"><arg type="s" direction="out"/></method>
    <method name="AcknowledgeTerminalState"><arg type="s" direction="out"/></method>
    <method name="GetCapabilities"><arg type="s" direction="out"/></method>
    <signal name="StateChanged"><arg type="s"/></signal>
    <signal name="WarningCrossed"><arg type="s"/></signal>
    <signal name="TimerExpired"><arg type="s"/></signal>
  </interface>
</node>`;

type DynamicCinnamonObject = any;
type TimerActionId = 'lock' | 'suspend' | 'hibernate' | 'reboot' | 'power-off';
type TimerStatus = 'idle' | 'unavailable' | 'active' | 'cancellation-paused' | 'missed' | 'failed';
type RemoteCallback = (result: [string], error?: unknown) => void;
type NoArgumentRemoteMethod =
  | 'AbortCancellationRemote'
  | 'AcknowledgeTerminalStateRemote'
  | 'ConfirmCancellationRemote';

interface TimerState {
  status: TimerStatus;
  action?: TimerActionId;
  remaining_seconds?: number;
  warning_level?: 'normal' | 'yellow' | 'red';
  mode?: 'at-time' | 'countdown';
  original_value?: string;
  cancellation_delay?: number;
  message?: string;
}

interface TimerActionDefinition {
  id: TimerActionId;
  label: string;
  icon: string;
}

interface TimerProxyInstance {
  AbortCancellationRemote(callback: RemoteCallback): void;
  AcknowledgeTerminalStateRemote(callback: RemoteCallback): void;
  BeginCancellationRemote(callback: RemoteCallback): void;
  ConfirmCancellationRemote(callback: RemoteCallback): void;
  CreateTimerRemote(request: string, callback: RemoteCallback): void;
  GetCapabilitiesRemote(callback: RemoteCallback): void;
  GetStateRemote(callback: RemoteCallback): void;
  connectSignal(
    signal: string,
    callback: (proxy: TimerProxyInstance, sender: string, values: [string]) => void,
  ): void;
}

interface TimerProxyConstructor {
  new (
    bus: DynamicCinnamonObject,
    busName: string,
    objectPath: string,
    callback: (proxy: TimerProxyInstance, error?: unknown) => void,
  ): TimerProxyInstance;
}

interface AppletMetadata {
  uuid: string;
}

interface CreateTimerRequest {
  mode: 'at-time' | 'countdown';
  action: TimerActionId;
  session_id: string;
  confirmed_tomorrow: boolean;
  needsTomorrowConfirmation?: boolean;
  time?: string;
  duration_seconds?: number;
  settings: {
    cancellation_delay_seconds: number;
    warning_one_enabled: boolean;
    warning_one_minutes: number;
    warning_two_enabled: boolean;
    warning_two_minutes: number;
    cancel_on_user_switch: boolean;
  };
}

interface TimerWarning {
  level: 'yellow' | 'red';
  remaining_seconds: number;
}

interface TimerResult {
  status: 'completed' | 'missed' | 'failed';
  message: string;
}

const TimerProxy = Gio.DBusProxy.makeProxyWrapper(TIMER_IFACE) as TimerProxyConstructor;
const DEFAULT_ACTION: TimerActionDefinition = {
  id: 'lock',
  label: 'Lock',
  icon: 'system-lock-screen-symbolic',
};
const ACTIONS: readonly TimerActionDefinition[] = [
  DEFAULT_ACTION,
  { id: 'suspend', label: 'Suspend', icon: 'media-playback-pause-symbolic' },
  { id: 'hibernate', label: 'Hibernate', icon: 'weather-clear-night-symbolic' },
  { id: 'reboot', label: 'Reboot', icon: 'view-refresh-symbolic' },
  { id: 'power-off', label: 'Power Off', icon: 'system-shutdown-symbolic' },
];

var CancellationDialog = GObject.registerClass(
  class CancellationDialog extends ModalDialog.ModalDialog {
    private _remaining = 0;
    private _confirmed = false;
    private _abortCallback: () => void = () => undefined;
    private _timeoutId = 0;
    private _confirmButton!: DynamicCinnamonObject;

    _init(delay: number, confirmCallback: () => void, abortCallback: () => void): void {
      super._init();
      this._remaining = delay;
      this._confirmed = false;
      this._abortCallback = abortCallback;
      this._timeoutId = 0;

      const box = new St.BoxLayout({ vertical: true, style_class: 'cpt-dialog-content' });
      box.add_child(new St.Label({ text: 'Cancel Timer', style_class: 'cpt-dialog-title' }));
      box.add_child(new St.Label({ text: 'The timer stays paused during confirmation.' }));
      this.contentLayout.add_child(box);

      this.addButton({
        label: 'Keep Timer',
        action: () => this.destroy(),
        key: Clutter.KEY_Escape,
      });
      this._confirmButton = this.addButton({
        label: this._buttonLabel(),
        action: () => {
          if (this._remaining > 0) return;
          this._confirmed = true;
          confirmCallback();
          this.destroy();
        },
        destructive_action: true,
      });
      this._confirmButton.reactive = delay === 0;
      this.connect('destroy', () => {
        if (this._timeoutId) Mainloop.source_remove(this._timeoutId);
        if (!this._confirmed) this._abortCallback();
      });
      if (delay > 0) {
        this._timeoutId = Mainloop.timeout_add_seconds(1, () => {
          this._remaining -= 1;
          this._confirmButton.label = this._buttonLabel();
          if (this._remaining <= 0) {
            this._confirmButton.reactive = true;
            this._timeoutId = 0;
            return GLib.SOURCE_REMOVE;
          }
          return GLib.SOURCE_CONTINUE;
        });
      }
    }

    private _buttonLabel(): string {
      return this._remaining > 0 ? `Cancel Timer (${this._remaining})` : 'Cancel Timer';
    }
  },
);

class CinnamonPowerTimerApplet extends Applet.TextIconApplet {
  private _state: TimerState;
  private _capabilities: Partial<Record<TimerActionId, boolean>>;
  private _mode: 'at-time' | 'countdown';
  private _action: TimerActionId;
  private _atTimeDigits: string;
  private _countdownDigits: string;
  private _proxy: TimerProxyInstance | null;
  private _removed: boolean;
  private _cancellationDialog: DynamicCinnamonObject | null;
  private _menuManager: DynamicCinnamonObject;
  private _timeEntry!: DynamicCinnamonObject;
  private _atTimeButton!: DynamicCinnamonObject;
  private _countdownButton!: DynamicCinnamonObject;
  private _timeSectionLabel!: DynamicCinnamonObject;
  private _formErrorRow!: DynamicCinnamonObject;
  private _formErrorLabel!: DynamicCinnamonObject;
  private _updatingTimeEntry = false;
  private _replaceTimeInputOnNextDigit = false;
  private _formError: string | null = null;
  private cancellationDelay!: number;
  private warningOneEnabled!: boolean;
  private warningOneMinutes!: number;
  private warningTwoEnabled!: boolean;
  private warningTwoMinutes!: number;
  private cancelOnUserSwitch!: boolean;
  private menu: DynamicCinnamonObject;
  private settings: DynamicCinnamonObject;

  constructor(
    metadata: AppletMetadata,
    orientation: DynamicCinnamonObject,
    panelHeight: number,
    instanceId: number,
  ) {
    super(orientation, panelHeight, instanceId);
    this._state = { status: 'idle' };
    this._capabilities = { lock: true };
    this._mode = 'at-time';
    this._action = 'lock';
    this._atTimeDigits = '1900';
    this._countdownDigits = '0045';
    this._proxy = null;
    this._removed = false;
    this._cancellationDialog = null;

    this.set_applet_tooltip('Cinnamon Power Timer');
    this._menuManager = new PopupMenu.PopupMenuManager(this);
    this.menu = new Applet.AppletPopupMenu(this, orientation);
    this.menu.actor.add_style_class_name('cpt-menu');
    this._menuManager.addMenu(this.menu);
    this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
    this.settings.bind('cancellation-delay-seconds', 'cancellationDelay');
    this.settings.bind('warning-one-enabled', 'warningOneEnabled');
    this.settings.bind('warning-one-minutes', 'warningOneMinutes');
    this.settings.bind('warning-two-enabled', 'warningTwoEnabled');
    this.settings.bind('warning-two-minutes', 'warningTwoMinutes');
    this.settings.bind('cancel-on-user-switch', 'cancelOnUserSwitch');

    this._render();
    this._connectBackend();
  }

  private _connectBackend(): void {
    this._proxy = new TimerProxy(Gio.DBus.session, BUS_NAME, OBJECT_PATH, (proxy, error) => {
      if (this._removed) return;
      if (error) {
        this._showBackendUnavailable(error);
        return;
      }
      proxy.connectSignal('StateChanged', (_proxy, _sender, [stateJson]) =>
        this._acceptState(stateJson),
      );
      proxy.connectSignal('WarningCrossed', (_proxy, _sender, [warningJson]) =>
        this._onWarning(warningJson),
      );
      proxy.connectSignal('TimerExpired', (_proxy, _sender, [resultJson]) =>
        this._onExpired(resultJson),
      );
      proxy.GetStateRemote((result, getError) => {
        if (getError) this._showBackendUnavailable(getError);
        else this._acceptState(result[0]);
      });
      proxy.GetCapabilitiesRemote((result, capabilityError) => {
        if (!capabilityError) {
          this._capabilities = JSON.parse(result[0]) as Partial<Record<TimerActionId, boolean>>;
          if (!this._capabilities[this._action]) this._action = 'lock';
          this._renderMenu();
        }
      });
    });
  }

  private _showBackendUnavailable(error: unknown): void {
    this._state = { status: 'unavailable', message: this._errorMessage(error) };
    this._render();
  }

  private _acceptState(stateJson: string): void {
    try {
      this._state = JSON.parse(stateJson) as TimerState;
      if (this._cancellationDialog && this._state.status !== 'cancellation-paused') {
        this._cancellationDialog.destroy();
      }
      this._render();
    } catch (error) {
      global.logError(error, 'Cinnamon Power Timer received invalid state');
    }
  }

  private _render(): void {
    this.actor.remove_style_class_name('cpt-warning-yellow');
    this.actor.remove_style_class_name('cpt-warning-red');
    this.actor.remove_style_class_name('cpt-paused');
    const status = this._state.status;
    if (status === 'idle') {
      this.set_applet_icon_symbolic_name('list-add-symbolic');
      this.set_applet_label('New Timer');
    } else if (status === 'unavailable') {
      this.set_applet_icon_symbolic_name('dialog-error-symbolic');
      this.set_applet_label('Timer unavailable');
    } else if (status === 'missed' || status === 'failed') {
      this.set_applet_icon_symbolic_name('dialog-warning-symbolic');
      this.set_applet_label(status === 'missed' ? 'Missed timer' : 'Timer failed');
      this.actor.add_style_class_name('cpt-warning-red');
    } else {
      const action = ACTIONS.find((item) => item.id === this._state.action) ?? DEFAULT_ACTION;
      this.set_applet_icon_symbolic_name(
        status === 'cancellation-paused' ? 'media-playback-pause-symbolic' : action.icon,
      );
      this.set_applet_label(formatRemaining(this._state.remaining_seconds ?? 0));
      if (status === 'cancellation-paused') this.actor.add_style_class_name('cpt-paused');
      else if (this._state.warning_level === 'red')
        this.actor.add_style_class_name('cpt-warning-red');
      else if (this._state.warning_level === 'yellow')
        this.actor.add_style_class_name('cpt-warning-yellow');
    }
    this._renderMenu();
  }

  private _renderMenu(): void {
    this.menu.removeAll();
    if (this._state.status === 'idle') this._buildNewTimerMenu();
    else if (this._state.status === 'unavailable') this._buildUnavailableMenu();
    else if (this._state.status === 'missed' || this._state.status === 'failed')
      this._buildTerminalMenu();
    else this._buildActiveMenu();
  }

  private _buildNewTimerMenu(): void {
    this._addStaticLabel('New Timer', 'cpt-title');
    const modeRow = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    const modeBox = new St.BoxLayout({ style_class: 'cpt-mode-box' });
    this._atTimeButton = new St.Button({
      label: 'At time',
      style_class: this._modeButtonStyle('at-time'),
    });
    this._countdownButton = new St.Button({
      label: 'Countdown',
      style_class: this._modeButtonStyle('countdown'),
    });
    this._atTimeButton.connect('clicked', () => this._setMode('at-time'));
    this._countdownButton.connect('clicked', () => this._setMode('countdown'));
    modeBox.add_child(this._atTimeButton);
    modeBox.add_child(this._countdownButton);
    modeRow.addActor(modeBox);
    this.menu.addMenuItem(modeRow);

    this._timeSectionLabel = this._addStaticLabel(this._mode === 'at-time' ? 'Time' : 'Duration');
    const inputRow = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    this._timeEntry = new St.Entry({
      text: formatTimeDigits(this._currentTimeDigits()),
      can_focus: true,
      style_class: 'run-dialog-entry cpt-time-entry',
      hint_text: 'HH:MM',
    });
    this._timeEntry.clutter_text.connect('key-focus-in', () => {
      this._timeEntry.clutter_text.set_selection(0, -1);
      this._replaceTimeInputOnNextDigit = true;
    });
    this._timeEntry.clutter_text.connect(
      'key-press-event',
      (_actor: DynamicCinnamonObject, event: DynamicCinnamonObject) =>
        this._onTimeEntryKeyPress(event),
    );
    this._timeEntry.clutter_text.connect('text-changed', () => {
      this._onTimeEntryTextChanged();
    });
    this._timeEntry.clutter_text.connect('activate', () => this._startTimer());
    inputRow.addActor(this._timeEntry, { expand: true });
    this.menu.addMenuItem(inputRow);

    this._addStaticLabel('Action');
    const actionCombo = new PopupMenu.PopupComboBoxMenuItem({});
    const comboMenu = actionCombo._menu as DynamicCinnamonObject;
    comboMenu.actor.add_style_class_name('cpt-action-menu');
    if (typeof comboMenu.getActiveItem !== 'function') {
      comboMenu.getActiveItem = () => comboMenu._getMenuItems()[comboMenu._activeItemPos] ?? null;
    }
    const originalOpen = comboMenu.open.bind(comboMenu);
    comboMenu.open = () => {
      // Cinnamon 6.6 moves focus before announcing this detached child menu.
      // Prime the manager so that focus movement cannot close the parent.
      if (this._menuManager._activeMenu === this.menu) {
        this._menuManager._menuStack.push(this.menu);
        this._menuManager._activeMenu = comboMenu;
      }
      originalOpen();
      const [anchorX] = actionCombo.actor.get_transformed_position();
      const [, parentY] = this.menu.actor.get_transformed_position();
      const [, parentHeight] = this.menu.actor.get_transformed_size();
      const [width, height] = comboMenu.actor.get_transformed_size();
      const monitor = Main.layoutManager.findMonitorForActor(actionCombo.actor);
      const position = positionDropdown(
        anchorX,
        parentY + parentHeight,
        { width, height },
        monitor,
      );
      comboMenu.actor.set_position(position.x, position.y);
    };
    ACTIONS.forEach((action, position) => {
      const item = this._createIconMenuItem(action.label, action.icon);
      item.setSensitive(this._capabilities[action.id] === true);
      this._keepMenuOpenOnActivate(item);
      actionCombo.addMenuItem(item);
      item.connect('activate', () => {
        actionCombo.setActiveItem(position);
        this._action = action.id;
        comboMenu.close();
      });
    });
    const activeIndex = Math.max(
      0,
      ACTIONS.findIndex((item) => item.id === this._action),
    );
    actionCombo.setActiveItem(activeIndex);
    actionCombo.connect(
      'active-item-changed',
      (_combo: DynamicCinnamonObject, position: number) => {
        const action = ACTIONS[position];
        if (action) this._action = action.id;
        comboMenu.close();
      },
    );
    this.menu.addMenuItem(actionCombo);

    this._formErrorRow = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      style_class: 'cpt-static-row',
    });
    this._formErrorLabel = new St.Label({ text: '', style_class: 'cpt-error' });
    this._formErrorRow.addActor(this._formErrorLabel);
    this.menu.addMenuItem(this._formErrorRow);
    this._syncFormError();
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    const start = this._createIconMenuItem('Start Timer', 'media-playback-start-symbolic');
    start.actor.add_style_class_name('cpt-primary-action');
    this._keepMenuOpenOnActivate(start);
    start.connect('activate', () => this._startTimer());
    this.menu.addMenuItem(start);
  }

  private _modeButtonStyle(mode: 'at-time' | 'countdown'): string {
    const state = this._mode === mode ? 'menu-category-button-selected' : 'menu-category-button';
    return `${state} cpt-mode-button`;
  }

  private _setMode(mode: 'at-time' | 'countdown'): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this._atTimeButton.set_style_class_name(this._modeButtonStyle('at-time'));
    this._countdownButton.set_style_class_name(this._modeButtonStyle('countdown'));
    this._timeSectionLabel.set_text(mode === 'at-time' ? 'Time' : 'Duration');
    this._replaceTimeInputOnNextDigit = true;
    this._updateTimeEntry();
    this._setFormError(null);
  }

  private _currentTimeDigits(): string {
    return this._mode === 'at-time' ? this._atTimeDigits : this._countdownDigits;
  }

  private _setCurrentTimeDigits(digits: string): void {
    if (this._mode === 'at-time') this._atTimeDigits = digits;
    else this._countdownDigits = digits;
  }

  private _updateTimeEntry(): void {
    this._updatingTimeEntry = true;
    this._timeEntry.set_text(formatTimeDigits(this._currentTimeDigits()));
    this._timeEntry.clutter_text.set_cursor_position(-1);
    this._updatingTimeEntry = false;
  }

  private _onTimeEntryKeyPress(event: DynamicCinnamonObject): boolean {
    const symbol = event.get_key_symbol();
    const state = event.get_state();
    if ((state & Clutter.ModifierType.CONTROL_MASK) !== 0) {
      if (symbol === Clutter.KEY_a || symbol === Clutter.KEY_A) {
        this._replaceTimeInputOnNextDigit = true;
      }
      return Clutter.EVENT_PROPAGATE;
    }

    let digit: string | null = null;
    if (symbol >= Clutter.KEY_0 && symbol <= Clutter.KEY_9) {
      digit = String(symbol - Clutter.KEY_0);
    } else if (symbol >= Clutter.KEY_KP_0 && symbol <= Clutter.KEY_KP_9) {
      digit = String(symbol - Clutter.KEY_KP_0);
    }
    if (digit !== null) {
      this._setCurrentTimeDigits(
        appendTimeDigit(
          this._currentTimeDigits(),
          digit,
          this._mode,
          this._replaceTimeInputOnNextDigit,
        ),
      );
      this._replaceTimeInputOnNextDigit = false;
      this._updateTimeEntry();
      this._setFormError(null);
      return Clutter.EVENT_STOP;
    }
    if (symbol === Clutter.KEY_BackSpace) {
      this._setCurrentTimeDigits(
        this._replaceTimeInputOnNextDigit ? '' : removeLastTimeDigit(this._currentTimeDigits()),
      );
      this._replaceTimeInputOnNextDigit = false;
      this._updateTimeEntry();
      return Clutter.EVENT_STOP;
    }
    if (symbol === Clutter.KEY_Delete) {
      this._setCurrentTimeDigits('');
      this._replaceTimeInputOnNextDigit = false;
      this._updateTimeEntry();
      return Clutter.EVENT_STOP;
    }
    return Clutter.keysym_to_unicode(symbol) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
  }

  private _onTimeEntryTextChanged(): void {
    if (this._updatingTimeEntry) return;
    this._setCurrentTimeDigits(sanitizeTimeDigits(this._timeEntry.get_text(), this._mode));
    this._replaceTimeInputOnNextDigit = false;
    this._updateTimeEntry();
    this._setFormError(null);
  }

  private _keepMenuOpenOnActivate(item: DynamicCinnamonObject): void {
    item.activate = (event: DynamicCinnamonObject) => item.emit('activate', event, true);
  }

  private _buildActiveMenu(): void {
    const action = ACTIONS.find((item) => item.id === this._state.action) ?? DEFAULT_ACTION;
    this.menu.addMenuItem(this._createIconMenuItem(action.label, action.icon, { reactive: false }));
    this._addDetail('Remaining', formatRemaining(this._state.remaining_seconds ?? 0));
    this._addDetail('Mode', this._state.mode === 'at-time' ? 'At time' : 'Countdown');
    this._addDetail(
      this._state.mode === 'at-time' ? 'Target time' : 'Duration',
      this._state.original_value ?? '',
    );
    if (this._state.status === 'cancellation-paused') {
      this._addStaticLabel('Cancellation confirmation is open.', 'cpt-paused-text');
    } else {
      const cancel = this._createIconMenuItem('Cancel Timer', 'edit-delete-symbolic');
      cancel.connect('activate', () => this._beginCancellation());
      this.menu.addMenuItem(cancel);
    }
  }

  private _buildTerminalMenu(): void {
    this._addStaticLabel(
      this._state.status === 'missed' ? 'Missed Timer' : 'Timer Failed',
      'cpt-title',
    );
    this._addStaticLabel(this._state.message || 'The timer could not complete.');
    const acknowledge = this._createIconMenuItem('Acknowledge', 'emblem-ok-symbolic');
    acknowledge.connect('activate', () => this._callNoArgs('AcknowledgeTerminalStateRemote'));
    this.menu.addMenuItem(acknowledge);
  }

  private _buildUnavailableMenu(): void {
    this._addStaticLabel('Backend unavailable', 'cpt-title');
    this._addStaticLabel(this._state.message || 'Install and start the timer service.');
    const retry = this._createIconMenuItem('Reconnect', 'view-refresh-symbolic');
    retry.connect('activate', () => this._connectBackend());
    this.menu.addMenuItem(retry);
  }

  private _addStaticLabel(text: string, styleClass = 'cpt-section-label'): DynamicCinnamonObject {
    const row = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      style_class: 'cpt-static-row',
    });
    const label = new St.Label({ text, style_class: styleClass });
    row.addActor(label);
    this.menu.addMenuItem(row);
    return label;
  }

  private _createIconMenuItem(
    text: string,
    icon: string,
    params?: DynamicCinnamonObject,
  ): DynamicCinnamonObject {
    const item = new PopupMenu.PopupIconMenuItem(text, icon, St.IconType.SYMBOLIC, params);
    item._icon.add_style_class_name('cpt-menu-icon');
    return item;
  }

  private _addDetail(label: string, value: string): void {
    const row = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    row.addActor(new St.Label({ text: label }));
    row.addActor(new St.Label({ text: value, style_class: 'cpt-detail-value' }), {
      align: St.Align.END,
      span: -1,
    });
    this.menu.addMenuItem(row);
  }

  private _startTimer(confirmedTomorrow = false): void {
    if (!this._proxy) return;
    let request: CreateTimerRequest;
    try {
      request = this._buildRequest(confirmedTomorrow);
    } catch (error) {
      this._setFormError(this._errorMessage(error));
      return;
    }
    if (request.needsTomorrowConfirmation && !confirmedTomorrow) {
      new ModalDialog.ConfirmDialog(`${request.time} has passed today. Schedule it tomorrow?`, () =>
        this._startTimer(true),
      ).open();
      return;
    }
    delete request.needsTomorrowConfirmation;
    this._formError = null;
    this._proxy.CreateTimerRemote(JSON.stringify(request), (result, error) => {
      if (error) {
        this._setFormError(this._errorMessage(error));
        return;
      }
      this.menu.close();
      this._acceptState(result[0]);
    });
  }

  private _setFormError(message: string | null): void {
    this._formError = message;
    this._syncFormError();
  }

  private _syncFormError(): void {
    if (!this._formErrorRow || !this._formErrorLabel) return;
    this._formErrorLabel.set_text(this._formError ?? '');
    this._formErrorRow.actor.visible = this._formError !== null;
  }

  private _buildRequest(confirmedTomorrow: boolean): CreateTimerRequest {
    const value = this._timeEntry.get_text().trim();
    const parsed = parseTimerValue(this._mode, value);
    const request: CreateTimerRequest = {
      mode: this._mode,
      action: this._action,
      session_id: GLib.getenv('XDG_SESSION_ID') || '',
      confirmed_tomorrow: confirmedTomorrow,
      settings: {
        cancellation_delay_seconds: this.cancellationDelay,
        warning_one_enabled: this.warningOneEnabled,
        warning_one_minutes: this.warningOneMinutes,
        warning_two_enabled: this.warningTwoEnabled,
        warning_two_minutes: this.warningTwoMinutes,
        cancel_on_user_switch: this.cancelOnUserSwitch,
      },
    };
    if (parsed.mode === 'at-time') {
      request.time = parsed.time;
      request.needsTomorrowConfirmation = parsed.needsTomorrowConfirmation;
    } else {
      request.duration_seconds = parsed.durationSeconds;
    }
    return request;
  }

  private _beginCancellation(): void {
    if (!this._proxy) return;
    this.menu.close();
    this._proxy.BeginCancellationRemote((result, error) => {
      if (error) {
        Main.notifyError('Cinnamon Power Timer', this._errorMessage(error));
        return;
      }
      this._acceptState(result[0]);
      this._cancellationDialog = new CancellationDialog(
        this._state.cancellation_delay ?? 0,
        () => this._confirmCancellation(),
        () => this._abortCancellation(),
      );
      this._cancellationDialog.open();
    });
  }

  private _confirmCancellation(): void {
    this._cancellationDialog = null;
    this._callNoArgs('ConfirmCancellationRemote');
  }

  private _abortCancellation(): void {
    this._cancellationDialog = null;
    this._callNoArgs('AbortCancellationRemote');
  }

  private _callNoArgs(methodName: NoArgumentRemoteMethod): void {
    if (!this._proxy) return;
    this._proxy[methodName]((result, error) => {
      if (error) Main.notifyError('Cinnamon Power Timer', this._errorMessage(error));
      else this._acceptState(result[0]);
    });
  }

  private _onWarning(warningJson: string): void {
    const warning = JSON.parse(warningJson) as TimerWarning;
    const title = warning.level === 'red' ? 'Power timer almost finished' : 'Power timer warning';
    Main.notify(title, `${formatRemaining(warning.remaining_seconds)} remaining.`);
  }

  private _onExpired(resultJson: string): void {
    const result = JSON.parse(resultJson) as TimerResult;
    if (result.status === 'missed' || result.status === 'failed')
      Main.notifyError('Cinnamon Power Timer', result.message);
  }

  private _errorMessage(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.replace(/^GDBus\.Error:[^:]+:\s*/, '');
  }

  on_applet_clicked(): void {
    this.menu.toggle();
  }

  on_applet_removed_from_panel(): void {
    this._removed = true;
    if (this._cancellationDialog) this._cancellationDialog.destroy();
    this.settings.finalize();
  }
}

export function main(
  metadata: AppletMetadata,
  orientation: DynamicCinnamonObject,
  panelHeight: number,
  instanceId: number,
): CinnamonPowerTimerApplet {
  return new CinnamonPowerTimerApplet(metadata, orientation, panelHeight, instanceId);
}
