# AWTRIX 3

Create a unique atmosphere in your home and access essential information at a glance with ease!

Integration with Awtrix 3 allows you and your entire family to receive notifications from your smart home devices on the screen of Ulanzi smart clock or any self build ESP32 matrix device. This can be done from a distance and with just a glance, eliminating the need to pick up your phone whenever something happens at home.

## AWTRIX NG support

This app also contains an AWTRIX NG driver as a separate implementation. AWTRIX NG is not treated as a drop-in replacement for AWTRIX 3:

- existing AWTRIX 3 devices and flows are not migrated automatically,
- AWTRIX NG devices must be added as **Awtrix NG** devices,
- supported AWTRIX NG actions use shared flow cards where behavior is safely equivalent; NG-only actions are `applicationRaw` and `weatherOverlay`,
- AWTRIX NG JSON flow cards accept AWTRIX NG-shaped payloads only,
- AWTRIX 3 JSON options such as `duration`, `noScroll`, `clients`, `barBC`, `pos` and `save` are not silently translated for AWTRIX NG.

For user and maintainer notes, supported features, unsupported features and known `UNKNOWN` areas, see [`docs/awtrix-ng/06-user-maintainer-guide.md`](docs/awtrix-ng/06-user-maintainer-guide.md).
