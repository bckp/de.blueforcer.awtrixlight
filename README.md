# AWTRIX

Connect your AWTRIX pixel clock to Homey and see notifications, sensor readings and custom apps from your smart home at a glance.

## Supported clocks

- **AWTRIX 3:** Ulanzi TC001 with its 32 × 8 pixel display, compatible AWTRIX 2 mainboards and self-built ESP32 matrix clocks running AWTRIX 3.
- **AWTRIX NG:** TC002 with its 52 × 16 pixel display and compatible ESP32 matrix clocks running AWTRIX NG.

Use Homey Flow to show messages, icons and custom apps, adjust brightness and control the display. TC002 also supports title-and-text layouts, audio, radio, script controls, state Flow triggers, and button and knob events. Available features depend on the clock and firmware.

The clock must already run the matching AWTRIX firmware. Add AWTRIX 3 clocks using **Awtrix3** and TC002/AWTRIX NG clocks using **Awtrix NG**.

AWTRIX 3 and AWTRIX NG use separate drivers and JSON formats. Devices and flows
are not migrated automatically. Shared Flow cards support both drivers where listed.

## Documentation

- [AWTRIX NG guide](docs/awtrix-ng/README.md)
- [AWTRIX NG JSON options](docs/awtrix-ng/json-options.md)
- [Development rules](docs/development.md)
- [API references](docs/README.md#api-references)
