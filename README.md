# Cinnamon Power Timer

A Linux Mint Cinnamon applet for creating one per-user timer that performs a predefined session or power action when it expires.

This repository is being scaffolded from the product requirements in `docs/plans/001-product-requirements.md`.

## Status

Early scaffold. The applet, user timer service, privileged helper, Polkit policy, and Debian packaging are not yet production-ready.

## Planned architecture

- Cinnamon applet: UI, settings, panel countdown, notifications.
- `systemd --user` timer service: authoritative per-user timer state and session lifecycle handling.
- Privileged system helper: narrowly scoped execution of Suspend, Hibernate, Reboot, and Power Off after authorization at timer creation.

## License

GPL-3.0-or-later.
