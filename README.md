# AWTRIX

Connect your AWTRIX pixel clock to Homey and see notifications, sensor readings and custom apps from your smart home at a glance.

## Supported clocks

- **AWTRIX 3:** Ulanzi TC001 with its 32 × 8 pixel display, compatible AWTRIX 2 mainboards and self-built ESP32 matrix clocks running AWTRIX 3.
- **AWTRIX NG:** TC002 with its 52 × 16 pixel display and compatible ESP32 matrix clocks running AWTRIX NG.

Use Homey Flow to show messages, icons and custom apps, adjust brightness and control the display. TC002 also supports title-and-text layouts, audio and radio controls, script settings/data, state Flow triggers, and physical button and knob events. Available features depend on the clock and firmware.

The clock must already run the matching AWTRIX firmware. Add AWTRIX 3 clocks using **Awtrix3** and TC002/AWTRIX NG clocks using **Awtrix NG**.

## AWTRIX NG support

This app also contains an AWTRIX NG driver as a separate implementation. AWTRIX NG is not treated as a drop-in replacement for AWTRIX 3:

- existing AWTRIX 3 devices and flows are not migrated automatically,
- AWTRIX NG devices must be added as **Awtrix NG** devices,
- supported AWTRIX NG actions use shared flow cards where behavior is safely equivalent,
- NG-specific features include RAW layouts, title-and-text cards for TC002, audio/radio controls, script settings/data and state Flow triggers,
- AWTRIX NG JSON flow cards accept AWTRIX NG-shaped payloads only,
- AWTRIX 3 JSON options such as `duration`, `noScroll`, `clients`, `barBC`, `pos` and `save` are not silently translated for AWTRIX NG.

For user and maintainer notes, supported features, unsupported features and known `UNKNOWN` areas, see [`docs/awtrix-ng/06-user-maintainer-guide.md`](docs/awtrix-ng/06-user-maintainer-guide.md).

Feature status and deferred clockfaces are tracked in the [feature roadmap](docs/awtrix-ng/10-homey-feature-roadmap.md). See the [live TC002/Homey test report](docs/awtrix-ng/13-live-qa-2026-10-06.md) for verified behavior, pixel previews and remaining release checks.
