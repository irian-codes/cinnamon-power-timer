'use strict';

const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;

const UUID = 'cinnamon-power-timer@irian-codes';

class CinnamonPowerTimerApplet extends Applet.TextIconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this.set_applet_icon_symbolic_name('alarm-symbolic');
        this.set_applet_label('New Timer');
        this.set_applet_tooltip('Cinnamon Power Timer');

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this._menuManager.addMenu(this.menu);

        this._buildIdleMenu();
    }

    _buildIdleMenu() {
        this.menu.removeAll();

        const title = new PopupMenu.PopupMenuItem('New Timer', { reactive: false });
        this.menu.addMenuItem(title);

        const placeholder = new PopupMenu.PopupMenuItem(
            'Timer creation UI scaffolded; backend wiring pending.',
            { reactive: false }
        );
        this.menu.addMenuItem(placeholder);
    }

    on_applet_clicked() {
        this.menu.toggle();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new CinnamonPowerTimerApplet(metadata, orientation, panelHeight, instanceId);
}
