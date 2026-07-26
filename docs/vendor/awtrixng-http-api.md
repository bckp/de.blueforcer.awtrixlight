# HTTP API v1

The complete HTTP surface of an AWTRIX NG device. Every route, every field, every status code.

The [Conventions](conventions.md) - camelCase keys, `...Ms` millisecond durations, the color
grammar, the mandatory `Content-Type`, the error envelope, auth-off-by-default - hold everywhere
below and are not repeated per route.

<swagger-ui src="../api/openapi.yaml"/>

## Base URL

All routes live under `http://<device-ip>:<webPort>`. `webPort` is device configuration
(default `80`; a value `<= 0` falls back to `80`). In access-point / provisioning mode the
server **always** listens on port 80 regardless of the configured value.

The device also answers on its mDNS hostname - see [Finding your device](../getting-started/discovery.md).

### Captive-portal redirect (AP mode only)

While the device is in provisioning mode, any request whose `Host` header is non-empty and is
neither the soft-AP IP nor `<apIp>:<port>` is answered with **302** `text/plain` and
`Location: http://<apIp>/`. This runs *before* authentication and before routing, and it is
what makes iOS/Android/Windows connectivity checks pop the setup page open. In normal
(station) mode no redirect ever happens.

## Authentication

HTTP Basic. The check is skipped - the request is allowed - only when `authEnabled` is
`false` (the shipping default: no auth at all). Once enabled it is enforced in **every** mode,
**including AP/provisioning** - there is no blanket bypass, so the setup portal can be password
protected. (During provisioning the reachable surface is also narrowed to reads, Wi-Fi setup and
[reboot](#post-apiv1devicereboot); the file routes and [firmware upload](#firmware-upload) return
`403 forbidden` there.)

Otherwise credentials are verified against `authUser` / `authPass` from
[system configuration](system.md). On failure the device answers:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="AWTRIX NG"
Content-Type: application/json

{"error":{"code":"unauthorized","message":"authentication required"}}
```

The `WWW-Authenticate` header still drives the browser login prompt, but the body is the same
JSON envelope every other status uses - never HTML.

Auth applies to everything the device serves: the API, the web UI at `/`, and the
static asset directories. The two multipart routes - `POST /update` and `POST /api/v1/files` -
are registered separately and re-check auth inside their upload handler instead
(see [Firmware upload](#firmware-upload)).

```bash
curl -u admin:secret http://<device-ip>/api/v1/device
```

## Content-Type

A body sent as `application/x-www-form-urlencoded` arrives as an **empty string**. To stop that
from being read as an intentional payload,
`PUT` and `PATCH` **reject a non-JSON `Content-Type` up front** with
**`415 unsupportedMediaType`** (`Content-Type must be application/json`) - this is where a `curl -d`
without the header lands. Always send `-H "Content-Type: application/json"`.

!!! tip "An empty body is not a clear"
    Sending an empty or `{}` body to the three routes that can be cleared returns
    **`422 validationFailed`**:

    | Route | Empty / `{}` body |
    |---|---|
    | `PUT /api/v1/apps/pushed/{name}` | `422` - `a JSON body is required (use DELETE to remove the app)` |
    | `PUT /api/v1/display/moodlight` | `422` - `a JSON body is required (use DELETE to turn the moodlight off)` |
    | `PUT /api/v1/indicators/{id}` | `422` - `a JSON body is required (use DELETE to turn the indicator off)` |

    Removing an app, turning the mood light off, or clearing an indicator is done **only** through the
    explicit `DELETE` route (or the empty-payload clear idiom over MQTT).
    See [Errors](errors.md#content-type-the-empty-body-trap).

## Errors

One envelope, every non-2xx status:

```json
{ "error": { "code": "validationFailed", "message": "out of range", "field": "brightness" } }
```

`field` is omitted entirely when no specific input key is at fault.

Seventeen codes exist and that is the complete set - `invalidJson`, `invalidPinConfig`,
`invalidPath`, `invalidName`, `badRequest`, `wrongChip`, `unauthorized`, `forbidden`, `notFound`,
`methodNotAllowed`, `payloadTooLarge`, `unsupportedMediaType`, `validationFailed`, `internalError`,
`unavailable`, `serviceBusy`, `insufficientStorage`. Which route raises each, the status it comes
with, and the exact messages: **[Errors](errors.md#error-codes)**.

### Status mapping for command routes

Write routes are translated into a core command and executed synchronously. The command result
maps to HTTP as:

| Command result | Status | Body |
|---|---|---|
| Ok | 200 | `{"ok":true}` |
| Parse error | 400 | `invalidJson`, message `request body is not valid JSON` |
| Validation error | 422 | `validationFailed`, message + `field` from the validator |
| Not found | 404 | `notFound` - `app not found` / `sound not found` / `not found` |
| Capacity | 507 | `insufficientStorage`, message `storage capacity reached` |
| Failed / unknown | 500 | `internalError`, message `command failed` |

`PATCH /api/v1/settings` is the one exception: on success it returns the **full resulting
settings resource** instead of `{"ok":true}`.

---

## Device

### GET /api/v1/device

Device state and statistics. Always 200.

| Key | Type | Units / range | Meaning |
|---|---|---|---|
| `version` | string | - | firmware version, e.g. `1.0.4-dev` |
| `uid` | string | - | device unique id |
| `boardType` | string | - | always `"awtrix"` - does not vary with the wiring |
| `soc` | string | - | chip this image was built for: `esp32` or `esp32s3`. Pin rules live under `gpio` in `/api/v1/capabilities` |
| `ipAddress` | string | - | current station IP |
| `wifiRssi` | integer | dBm | |
| `uptimeSeconds` | integer | s | since boot |
| `resetReason` | string | - | why the device last booted - see [Device state](device.md) |
| `freeHeapBytes` | integer | bytes | |
| `minFreeHeapBytes` | integer | bytes | low-water mark since boot - the leak canary; see [Device state](device.md) |
| `largestFreeBlockBytes` | integer | bytes | largest contiguous free block - what the install/TLS guards refuse on; see [Device state](device.md) |
| `psramTotalBytes` | integer | bytes | external PSRAM; absent on boards without it |
| `psramFreeBytes` | integer | bytes | free PSRAM; never add it to `freeHeapBytes` - see [Device state](device.md) |
| `scriptHeapPool` | string | - | pool the Berry VM allocates from: `internal` or `psram` |
| `scriptHeapBudgetBytes` | integer | bytes | ceiling on the shared Berry heap before installs are refused |
| `fps` | integer | frames/s | measured render-loop rate |
| `brightness` | integer | 0–255 | **effective** brightness after auto-brightness, not the setting |
| `lightLevel` | number | 0–100 % | relative ambient light, rounded to 1 decimal; not lux |
| `ldrRaw` | integer | ADC counts | raw value behind `lightLevel` (diagnostic) |
| `matrixPower` | boolean | - | `false` while the display is switched off |
| `currentApp` | string | - | id of the app on screen |
| `indicators` | array | 3 entries | `{on: bool, color: "#RRGGBB", blinkMs: int, fadeMs: int}` |
| `messageCount` | integer | - | **MQTT** commands received since boot; HTTP requests are not counted |

Conditional keys - present only when the hardware provides them:

| Key | Type | Units | Present when |
|---|---|---|---|
| `batteryPercent` | integer | 0–100 % | `pinBattery >= 0` |
| `batteryVoltage` | number | V, 2 decimals | `pinBattery >= 0` - voltage at the cell |
| `batteryMillivolts` | integer | mV | `pinBattery >= 0` - at the **pin**, before the divider; use it to calibrate `batteryDividerRatio` |
| `lowBattery` | boolean | - | `pinBattery >= 0` - `true` while `batteryPercent` is below `lowBatteryThreshold`; always `false` when the threshold is `0` |
| `temperature` | number | °C | any I²C sensor was detected - every supported sensor reads temperature |
| `humidity` | number | % | the detected sensor measures humidity - omitted on temperature-only sensors such as the BMP280 |
| `pressureHpa` | number | hPa, 1 decimal | the detected sensor measures pressure (BMP280/BME280) |

Setting `pinBattery` to `-1` removes all four battery keys on any board. There is no board
type to key off - the GPIO map is runtime configuration. Which sensor keys appear likewise
depends on what was probed on the I²C bus, not on a configured board type; ask
[`GET /api/v1/capabilities`](#get-apiv1capabilities) if you need to know before reading.

!!! note "`indicators` drives real pixels"
    The three corner indicators render on the right edge of the panel - id 1 top, id 2 middle, id 3
    bottom - honouring `blinkMs` (50% blink) and `fadeMs` (breathe). The values echoed here and
    published over MQTT/Home Assistant match what is on screen.

```bash
curl http://<device-ip>/api/v1/device
```

### GET /api/v1/version

```json
{"version":"1.0.4-dev"}
```

GET only. Any other method → 405, `allowed method(s): GET`.

```bash
curl http://<device-ip>/api/v1/version
```

### GET /version

The same string as **`text/plain`**, with no JSON wrapper - the body is exactly the version string, e.g. `1.0.4-dev`.
Convenient for shell scripts and health checks. GET only.

```bash
curl http://<device-ip>/version
```

### POST /api/v1/device/reboot

No body. Reboots the device.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - delivered before the restart |
| 405 | wrong method - `allowed method(s): POST` |

!!! note "200 is delivered, then the device restarts"
    The `200 {"ok":true}` is written **before** the reboot is triggered - the restart is deferred
    until after the response is on the wire. Poll [`GET /version`](#get-version) until the device
    answers again to know it is back.

!!! note "Reachable during provisioning"
    This is the only write besides [`PUT /api/v1/system`](#put-apiv1system) that the provisioning
    access point accepts - it is what applies the Wi-Fi credentials written there. See
    [First boot](../getting-started/first-boot.md#step-3-reboot).

```bash
curl -X POST http://<device-ip>/api/v1/device/reboot
```

### POST /api/v1/device/sleep

Deep-sleep for a duration, then wake and boot normally.

| Key | Type | Range | Default | Units | Required |
|---|---|---|---|---|---|
| `durationMs` | integer | `> 0` | - | ms | yes |

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - delivered before the device sleeps |
| 400 | body is not valid JSON (`invalidJson`) |
| 422 | `durationMs` missing, not an integer, or `<= 0` - `field: "durationMs"`, message `must be a positive integer (milliseconds)` |
| 405 | wrong method - `allowed method(s): POST` |

Before sleeping, the display is switched off and a power-change event is emitted.

!!! note "200 is delivered, then the device sleeps"
    On a valid request the `200 {"ok":true}` is written first; the deep-sleep is deferred until after
    the response is on the wire. The device then wakes and boots normally after `durationMs`.

```bash
curl -X POST http://<device-ip>/api/v1/device/sleep \
  -H "Content-Type: application/json" \
  -d '{"durationMs":60000}'
```

### POST /api/v1/device/factory-reset

No body. Clears the settings and configuration NVS namespaces (plus a legacy one), formats
LittleFS, erases the stored Wi-Fi credentials, and reboots into provisioning mode.

Deliberately **HTTP only** - this command is not reachable over MQTT.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - delivered before the reset |
| 405 | wrong method - `allowed method(s): POST` |

!!! note "200 is delivered, then the device resets"
    The `200 {"ok":true}` is written before the erase-and-restart runs, so the response arrives
    normally. Note that the erase is unconditional and there is no confirmation step: the device then
    reboots into the setup access point.

```bash
curl -X POST http://<device-ip>/api/v1/device/factory-reset
```

---

## Settings

### GET /api/v1/settings

Returns the full settings resource - all **46** keys, always present. Enum fields emit their
wire name, colors emit `"#RRGGBB"`, nullable colors emit `null` when unset.

Methods other than GET/PATCH → 405, `allowed method(s): GET, PATCH`.

```bash
curl http://<device-ip>/api/v1/settings
```

### PATCH /api/v1/settings

Partial, atomic, validate-then-apply. **Every** key in the payload is validated first; the
first offender aborts the whole request and nothing is applied. On success the device answers
**200 with the complete resulting settings resource** - not `{"ok":true}`.

| Status | Condition |
|---|---|
| 200 | applied - body is the full settings resource |
| 400 | body is not valid JSON (`invalidJson`) |
| 415 | body sent with a non-JSON `Content-Type` (`unsupportedMediaType`) |
| 422 | a field failed validation - `field` names it |
| 405 | wrong method - `allowed method(s): GET, PATCH` |

Unknown keys are **rejected**, not ignored: `field: "<key>"`, message `unknown field`.

Validator messages by field kind:

| Kind | 422 message |
|---|---|
| boolean | `must be a boolean` |
| integer | `must be an integer` (booleans are explicitly excluded) or `out of range` |
| millisecond long | `must be a non-negative integer (milliseconds)` |
| float | `must be a positive number` |
| enum | `must be one of: <space-separated names>` |
| color | `must be a color ("#RGB", "#RRGGBB", [r,g,b], ["HSV",h,s,v] or a packed integer)` |
| nullable color | `must be a color or null` |
| transition | `must be one of: <comma-separated transition names>` |

#### Fields

Prose and behaviour for each: [Settings](settings.md).

| Key | Type | Range | Default | Units |
|---|---|---|---|---|
| `autoBrightness` | boolean | - | `false` | - |
| `brightness` | integer | 0–255 | `120` | - |
| `autoTransition` | boolean | - | `true` | - |
| `textColor` | color | - | `"#FFFFFF"` | - |
| `transitionEffect` | string | one of `capabilities.transitions` | `"Rain"` | - |
| `transitionDurationMs` | integer | 0–2147483647 | `1000` | ms |
| `appDurationMs` | integer | `>= 0` | `7000` | ms |
| `timeMode` | integer | 0–6 | `1` | - |
| `calendarHeaderColor` | color | - | `"#FF0000"` | - |
| `calendarTextColor` | color | - | `"#000000"` | - |
| `calendarBodyColor` | color | - | `"#FFFFFF"` | - |
| `time24h` | boolean | - | `true` | - |
| `timeLeadingZero` | boolean | - | `true` | - |
| `timeShowSeconds` | boolean | - | `false` | - |
| `timeShowAmPm` | boolean | - | `false` | - |
| `timeSeparatorMode` | enum | `steady` \| `blink` \| `pulse` | `"pulse"` | - |
| `dateOrder` | enum | `dayMonthYear` \| `monthDayYear` \| `yearMonthDay` | `"dayMonthYear"` | - |
| `dateSeparator` | enum | `dot` \| `slash` \| `dash` | `"dot"` | - |
| `dateYearMode` | enum | `none` \| `twoDigit` \| `fourDigit` | `"twoDigit"` | - |
| `dateShowWeekday` | boolean | - | `false` | - |
| `dateMonthNames` | boolean | - | `false` | - |
| `useCelsius` | boolean | - | `true` | - |
| `blockNavigation` | boolean | - | `false` | - |
| `soundEnabled` | boolean | - | `true` | - |
| `uppercase` | boolean | - | `true` | - |
| `smoothScroll` | boolean | - | `false` | - |
| `weekdayBar` | object | see below | `{"show":true,"startOnMonday":true,"weekendDays":["sunday","saturday"],"activeColor":"#FFFFFF","inactiveColor":"#666666","weekendActiveColor":"#FFFFFF","weekendInactiveColor":"#666666"}` | - |
| `timeColor` | color \| null | - | `null` | - |
| `dateColor` | color \| null | - | `null` | - |
| `humidityColor` | color \| null | - | `null` | - |
| `temperatureColor` | color \| null | - | `null` | - |
| `batteryColor` | color \| null | - | `null` | - |
| `scroll` | object | see below | `{"mode":"wrap","direction":"left","entry":"inline","whenFits":"static","speed":100,"gap":8}` | - |
| `volume` | integer | 0–30 | `25` | - |
| `radioVolume` | integer | 0–100 | `60` | - |
| `radioMeta` | boolean | - | `true` | - |
| `saturation` | integer | 0-100 | `100` | % |
| `gamma` | number | `> 0`, no upper bound | `1.9` | - |
| `colorCorrection` | color \| null | - | `null` | - |
| `colorTint` | color \| null | - | `null` | - |

Notes that bite:

* `null` on the five per-app `*Color` fields means **inherit `textColor`**; on
  `colorCorrection` and `colorTint` it means **off**. That is what they read back as by
  default.
* Panel size and wiring are **not** here: they are
  [system configuration](system.md#panel-and-orientation).
* `soundEnabled: false` mutes **all** of `POST /api/v1/sounds/play` - melody files, RTTTL and the
  `builtin` melody alike. [`POST /api/v1/sounds/stop`](#post-apiv1soundsstop) is the one sound
  route it does not affect. See [Sounds](#post-apiv1soundsplay).
* `transitionEffect` is matched **case-insensitively** against the names from
  [`GET /api/v1/capabilities`](#get-apiv1capabilities) - `"slide"`, `"Slide"` and `"SLIDE"` are the
  same transition. The string enums (`timeSeparatorMode`, `dateOrder`, `dateSeparator`,
  `dateYearMode`) accept any casing too. Responses always use the canonical spelling.
* `scroll` is the device-wide text motion - `mode` (`static` · `wrap` · `loop` · `bounce`),
  `direction` (`left` · `right`), `entry` (`inline` · `offscreen`), `whenFits`
  (`static` · `scroll`), `speed` in percent of 21 px/s and `gap` in pixels. It merges field by
  field, so `{"scroll":{"mode":"loop"}}` keeps the configured speed, and `{"scroll":"loop"}` is
  shorthand for the same. A negative number, an unknown value or an unknown field is `422
  validationFailed` with `field` naming the key, e.g. `scroll.speed`. A payload's own `scroll`
  overrides this one field by field - see [Payload → Scrolling](payload.md#scrolling).
* `weekdayBar` is the whole weekday bar - `show`, `startOnMonday`, `weekendDays` (lowercase
  English day names, any subset, `[]` for no weekend) and four colors: `activeColor` /
  `inactiveColor` for a workday, `weekendActiveColor` / `weekendInactiveColor` for a weekend
  day, each pair split into today and not-today. The weekend colors default to the workday
  colors, so the bar looks unchanged until they are set. It merges field by field, so
  `{"weekdayBar":{"weekendDays":["friday","saturday"]}}` leaves the other six alone. An unknown
  field, a wrong type or an unknown day name is `422 validationFailed` with `field` naming the
  key, e.g. `weekdayBar.weekendDays`. `startOnMonday` only rotates the display order -
  weekend membership follows the calendar day. Not to be confused with `dateShowWeekday`,
  which prefixes a weekday name to the date text.

```bash
curl -X PATCH http://<device-ip>/api/v1/settings \
  -H "Content-Type: application/json" \
  -d '{"brightness":80,"autoBrightness":false,"timeColor":"#00FF00"}'
```

### POST /api/v1/settings/reset

No body. Clears the settings NVS namespace (and a legacy one) and reboots. Device configuration
- Wi-Fi, MQTT, GPIO - is **not** touched; only settings.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - delivered before the reset |
| 405 | wrong method - `allowed method(s): POST` |

!!! note "200 is delivered, then the device resets"
    The `200 {"ok":true}` is written before the reset-and-restart runs, so the response arrives
    normally.

```bash
curl -X POST http://<device-ip>/api/v1/settings/reset
```

---

## Display

### GET /api/v1/display

| Key | Type | Meaning |
|---|---|---|
| `power` | boolean | `false` while the matrix is switched off |
| `brightness` | integer 0–255 | effective brightness after auto-brightness |
| `overlay` | string \| null | active global overlay name, `null` when none |
| `overlaySettings` | object | always present - `{speed, palette, blend}` for the global overlay; `palette` is `null` when unset. See [Weather overlays](visuals.md#weather-overlays) |
| `moodlight` | object \| null | `{color: "#RRGGBB", brightness: 0–255}`, or `null` when off |

```bash
curl http://<device-ip>/api/v1/display
```

### PATCH /api/v1/display

Validate-then-apply. All fields optional.

| Key | Type | Range | Default | Meaning |
|---|---|---|---|---|
| `power` | boolean | - | unchanged | `false` blanks the matrix |
| `overlay` | string \| null | an overlay name, `""`, or `null` | unchanged | global weather overlay over **all** apps |
| `overlaySettings` | object | `{speed, palette, blend}` | unchanged | tunes the global overlay; see [Weather overlays](visuals.md#weather-overlays) |

`overlay` is matched **case-insensitively**. `null` or `""` clears it. Valid names - from
[`GET /api/v1/capabilities`](#get-apiv1capabilities) - are `drizzle`, `frost`, `rain`, `snow`,
`storm`, `thunder`.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | body is not valid JSON (`invalidJson`) |
| 415 | body sent with a non-JSON `Content-Type` (`unsupportedMediaType`) |
| 422 | `field: "power"`, `must be a boolean` |
| 422 | `field: "overlay"`, `must be a string or null` |
| 422 | `field: "overlay"`, `unknown overlay` |
| 422 | `field: "overlaySettings"`, `must be an object` |
| 405 | wrong method - `allowed method(s): GET, PATCH` |

Unknown overlay names are rejected here, and the per-app `overlay` payload field is validated
the same way - see [`PUT /api/v1/apps/pushed/{name}`](#put-apiv1appspushedname).

```bash
curl -X PATCH http://<device-ip>/api/v1/display \
  -H "Content-Type: application/json" \
  -d '{"power":true,"overlay":"snow"}'
```

### PUT /api/v1/display/moodlight

Floods the whole matrix with one color. All fields optional.

| Key | Type | Range | Default | Units |
|---|---|---|---|---|
| `kelvin` | integer | clamped to 1000–40000 | - | K |
| `color` | color | any color form | unchanged | - |
| `brightness` | integer | **not validated** - see below | unchanged | 0–255 |

Precedence, not exclusion: **if `kelvin` is present, `color` is ignored entirely.** An
unparseable `color` is rejected with `422 validationFailed` (`field: "color"`) rather than
being guessed at.

**Both fields are sticky.** Omitting one keeps the value it had, so `{"brightness":30}` dims
without touching the color and `{"color":"#FF0000"}` recolors without touching the level -
which is what a Home Assistant light needs, since it sends the two on separate messages. On a
device where the mood light has never been given a color it is white, at brightness `120`.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | body is not valid JSON (`invalidJson`) |
| 415 | body sent with a non-JSON `Content-Type` (`unsupportedMediaType`) |
| 422 | empty or `{}` body - `a JSON body is required (use DELETE to turn the moodlight off)` |
| 405 | wrong method - `allowed method(s): PUT, DELETE` |

The only 422 is an empty or `{}` body (above); field *values* are never rejected - see the warning.

!!! warning "`brightness` is not range-checked"
    An empty body or `{}` does not switch the mood light off - it returns `422` (use
    [`DELETE`](#delete-apiv1displaymoodlight) to turn it off). `brightness`, however, is cast to an
    8-bit value with no validation: `300` wraps to `44`, `256` wraps to `0`. No error is returned.
    Keep it inside 0–255 yourself.

```bash
curl -X PUT http://<device-ip>/api/v1/display/moodlight \
  -H "Content-Type: application/json" \
  -d '{"kelvin":2700,"brightness":90}'
```

### DELETE /api/v1/display/moodlight

No body. Turns the mood light off. Always 200 `{"ok":true}`.

```bash
curl -X DELETE http://<device-ip>/api/v1/display/moodlight
```

### GET /api/v1/display/screen

The current framebuffer.

| Key | Type | Meaning |
|---|---|---|
| `width` | integer | canvas width, `32` by default |
| `height` | integer | canvas height, `8` by default |
| `pixels` | array of integers | `width * height` entries (256 by default), row-major |

Each pixel is the packed `0xRRGGBB` value printed as an **unsigned decimal integer**, not hex.

These are the pixels the apps drew. Brightness and the panel colour settings (`saturation`,
`gamma`, `colorCorrection`, `colorTint`) change what the LEDs show, not what this endpoint
returns.

GET only; other methods → 405, `allowed method(s): GET`.

```bash
curl http://<device-ip>/api/v1/display/screen
```

---

## Apps

One collection. An app is a **name** plus an `origin` that says where its content comes from:

| `origin` | Content decided by | Written where | Survives a reboot |
|---|---|---|---|
| `builtin` | firmware code | - | - |
| `pushed` | a JSON spec sent from outside | RAM | no |
| `script` | Berry source stored on the device | `/SCRIPTS` | yes |

The two sub-collections - `/api/v1/apps/pushed/{name}` and `/api/v1/apps/script/{name}` - carry
different payloads and fail in different ways. Everything that treats an
app as an app (the inventory, the loop order, removal) is addressed at the collection and is
kind-agnostic.

### Names

Every app name, pushed or script, must match `[A-Za-z0-9_-]{1,32}`. The name is checked **before
anything else looks at the request**; a malformed one answers **`400 invalidName`**
(`name must match [A-Za-z0-9_-]{1,32}`, `field: "name"`) and nothing is stored.

A bare sub-collection path leaves a tail that is not a valid name, so `/api/v1/apps/pushed/` and
`/api/v1/apps/script/` are also `400 invalidName` (not `405`).

`active`, `next`, `previous` and `order` are matched before any name, so they are reserved:
`DELETE /api/v1/apps/next` is a `405`, not the deletion of an app called `next`.

### GET /api/v1/apps

The full inventory: loop apps first in rotation order, then hidden apps (so a UI can re-enable
them).

| Key | Type | Meaning |
|---|---|---|
| `name` | string | app id |
| `inLoop` | boolean | whether it is in the rotation |
| `position` | integer \| null | 0-based rotation index; `null` when hidden |
| `origin` | string | `"builtin"`, `"pushed"` or `"script"` |
| `icon` | string | **pushed only**, and only when the spec set a non-empty `icon` |
| `skipped` | boolean | **script only** - the app's own [`should_show()`](../guides/scripting.md#sitting-a-round-out) last said no, so the rotation walks past it |
| `error` | object \| null | **script only** - `null` while healthy, otherwise the latched error (see [below](#the-error-object)) |
| `meta` | object | **script only** - `{name, desc, author, version}` from the `@` headers; each entry `""` when the header is absent |

`icon`, `skipped`, `error` and `meta` are **omitted**, not emitted empty, where they do not apply -
absent means "does not apply here", not "is blank". `skipped`, `error` and `meta` are also absent on
a build with no scripting platform.

`skipped` is not `inLoop` inverted. `inLoop: false` is the user's app order leaving the app out;
`skipped: true` is the app in the rotation declining its turn, which it can reverse by itself at any
moment. It reports the last answer the app gave, not one taken for this request.

```json
[
  {"name":"Time","inLoop":true,"position":0,"origin":"builtin"},
  {"name":"weather","inLoop":true,"position":1,"origin":"pushed","icon":"1"},
  {"name":"clock","inLoop":false,"position":null,"origin":"script","skipped":false,
   "error":null,"meta":{"name":"Wall Clock","desc":"","author":"me","version":"1.2"}}
]
```

#### The error object

The same shape wherever a script error is reported - here and in the
[`PUT`](#put-apiv1appsscriptname) reply.

| Key | Type | Meaning |
|---|---|---|
| `message` | string | human-readable text, with any source position lifted out |
| `line` | integer | **optional** - 1-based line in the submitted source |
| `hook` | string | **optional** - lifecycle hook that raised: `setup`, `loop`, `draw`, `on_show`, `on_hide`, `on_button`, `should_show` |

`line` and `hook` are omitted rather than sent as `0`/`""`. Both are genuinely absent much of the
time: `"no draw() method"` and `"source too large"` have no position and no hook, and a failure that
names a `hook` usually has no `line`. A compile error is the reliable source of `line`.

```json
{"message":"syntax_error: unexpected token ')'","line":12}
{"message":"runtime_error: operand must be number","hook":"setup"}
```

Built-in names are `Time`, `Date`, `Temperature`, `Humidity`, `Battery`. Each appears only when
its `show*` setting is on; `Battery` additionally requires a battery pin to be configured.

Methods other than GET → 405, `allowed method(s): GET`.

```bash
curl http://<device-ip>/api/v1/apps
```

### PUT /api/v1/apps/active

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | - | app id to show |
| `fast` | boolean | `false` | `true` jumps instantly, `false` plays the transition |

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 404 | `notFound`, `app not found` |
| 405 | wrong method - `allowed method(s): PUT` |

Parsing quirks worth knowing:

* A body that does **not** start with `{` is taken as a **literal app name**.
* A **malformed** JSON body does not produce 400. The parse failure is swallowed and the raw
  body string is used as the app name, so you get **404 `app not found`** instead.

```bash
curl -X PUT http://<device-ip>/api/v1/apps/active \
  -H "Content-Type: application/json" \
  -d '{"name":"Time","fast":true}'
```

### POST /api/v1/apps/next

No body. Advances the rotation. Always 200 `{"ok":true}`.
Other methods → 405, `allowed method(s): POST`.

```bash
curl -X POST http://<device-ip>/api/v1/apps/next
```

### POST /api/v1/apps/previous

No body. Steps back. Always 200 `{"ok":true}`.
Other methods → 405, `allowed method(s): POST`.

```bash
curl -X POST http://<device-ip>/api/v1/apps/previous
```

### PUT /api/v1/apps/order

Sets the rotation loop. **The list *is* the loop** - exact membership and exact order.

Three accepted body shapes:

| Shape | Example |
|---|---|
| object with `order` | `{"order":["Time","Date"]}` |
| bare array | `["Time","Date"]` |
| array of objects | `[{"name":"Time"},{"name":"Date","show":false}]` |

Elements may be strings or objects `{"name": <string>, "show": <boolean>}`. `show` defaults to
`true`; `show: false` is exactly equivalent to leaving the app out.

Semantics:

* **Duplicates are kept** - list an app twice and it rotates twice per cycle, each
  instance with its own `position`.
* Known apps omitted from the list become **hidden**: they leave the loop but stay in
  `GET /api/v1/apps` and can be re-enabled by listing them again.
* Apps registered **later** are not hidden and join the loop automatically - into the slot this
  list gave them if it named one, appended after the ordered entries otherwise.
* The order is persisted and survives reboots.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | not valid JSON, or a top-level type that is neither an object with `order` nor an array (`invalidJson`) |
| 405 | wrong method - `allowed method(s): PUT` |

```bash
curl -X PUT http://<device-ip>/api/v1/apps/order \
  -H "Content-Type: application/json" \
  -d '{"order":["Time","weather","Time","Date"]}'
```

### PUT /api/v1/apps/pushed/{name}

Creates or updates a pushed app. `{name}` is the raw path tail - everything after
`/api/v1/apps/pushed/`.

The body is an app payload: `text`, `icon`, `color`, `draw`, `effect`, charts and the rest.
The complete field table is in [App & notification payload](payload.md).

| Body shape | Effect |
|---|---|
| object | stores one app under `{name}` |
| array of objects | stores each element as `{name}0`, `{name}1`, … (non-object elements are skipped) |
| empty or `{}` | `422` - a JSON body is required; use `DELETE` to remove the app |
| any other top-level type | 400 `invalidJson` |

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | not valid JSON, or a top-level scalar (`invalidJson`) |
| 415 | body sent with a non-JSON `Content-Type` (`unsupportedMediaType`) |
| 422 | empty or `{}` body - `a JSON body is required (use DELETE to remove the app)` |
| 422 | `field: "<key>"` - an unknown key, an unreadable colour, an unrecognised mode word, a malformed `scroll`, a malformed `draw` command, or an `effect`/`overlay` name that is not in the registries |
| 507 | 50 pushed apps are already resident and this would add a new one (`insufficientStorage`) |
| 400 | `invalidName` - `{name}` is not `[A-Za-z0-9_-]{1,32}`, or the tail is empty (`/api/v1/apps/pushed/`) |
| 405 | wrong method - `allowed method(s): PUT` |

A pushed app is held in RAM only. It lasts until it is replaced, deleted, expired by `lifetimeMs`,
or the device restarts - nothing is written to flash for it. For content that must come back by
itself after a reboot, write a [script](#scripts).

!!! note "Unknown `effect` and `overlay` names are rejected"
    An `effect` or `overlay` the device does not know answers `422 validationFailed` with `field` naming
    the key, and **nothing is stored** - for an array payload that means the whole batch is
    rejected, not just the offending element. Both are matched case-insensitively against
    [`GET /api/v1/capabilities`](#get-apiv1capabilities).

!!! note "Empty body is rejected, and the 50-app cap is honest"
    An empty or `{}` body returns `422` (use `DELETE` to remove an app), and a wrong `Content-Type`
    returns `415`. Neither one deletes or clears the existing app.

    **50** pushed apps may be resident at once. A *new* app beyond that cap is rejected with
    **`507 insufficientStorage`**; an array payload is **all-or-nothing** - if the whole batch will
    not fit, the entire request is rejected and nothing is stored. Updates to apps that already exist
    are never counted against the cap. Confirm with `GET /api/v1/apps`.

```bash
curl -X PUT http://<device-ip>/api/v1/apps/pushed/weather \
  -H "Content-Type: application/json" \
  -d '{"text":"21.5C","icon":"2422","textColor":"#00AAFF"}'
```

### DELETE /api/v1/apps/{name}

No body, and **kind-agnostic**: it removes whatever `{name}` is. For a pushed app that is the exact
key **and every indexed child** - any app whose name starts with `{name}` and whose remainder is all
digits (`{name}0`, `{name}1`, …). For a script it is the source **and** its persisted store file,
which is the only way to reset a script's store.

Always 200 `{"ok":true}`. Deleting an app that does not exist is **not** a 404, and neither is
naming a built-in - which stays in the rotation regardless.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - always, for any valid name |
| 400 | `invalidName` - `{name}` is not `[A-Za-z0-9_-]{1,32}` |
| 403 | `forbidden` - the write API is closed in AP/provisioning mode |
| 405 | any other method on a valid name - `allowed method(s): DELETE` |

```bash
curl -X DELETE http://<device-ip>/api/v1/apps/weather
```

---

## Scripts

Berry scripts. An installed script becomes an app in the rotation - a class instance running in the
interpreter every script app shares - and its source is stored on the device so it comes back by
itself after a reboot. The language, the callbacks and the worked examples are in
[Scripting](../guides/scripting.md); this section is the wire contract.

A script is addressed like any other app: `/api/v1/apps/script/{name}`, where `{name}` is the app id
**and** the filename under `/SCRIPTS`, held to the one [app name rule](#names). Removal is not here
- it is the kind-agnostic [`DELETE /api/v1/apps/{name}`](#delete-apiv1appsname).

Methods other than GET/PUT → 405, `allowed method(s): GET, PUT`.

### GET /api/v1/apps/script/{name}

That script's raw Berry source as **`text/plain`**, byte for byte as it was installed, so an
editor can round-trip it straight back into `PUT` without unwrapping anything.

| Status | Condition |
|---|---|
| 200 | `text/plain` - the source |
| 400 | `invalidName` - the name is not `[A-Za-z0-9_-]{1,32}` |
| 404 | `notFound`, `no such script` |
| 503 | `unavailable`, `scripting is not available` - this build has no scripting platform |

The inventory - which scripts exist, whether each compiled, and the metadata from its `@` headers -
is part of [`GET /api/v1/apps`](#get-apiv1apps), under `origin`, `error` and `meta`. The source is
not in that listing; it can be as large as [`scriptMaxBytes`](system.md#miscellaneous) allows.

```bash
curl "http://<device-ip>/api/v1/apps/script/clock" -o clock.ax
```

### PUT /api/v1/apps/script/{name}

The body is the raw Berry source, **not JSON**. Installs the script, or replaces one already under
that name.

| Status | Body / condition |
|---|---|
| 200 | `{"ok":true,"name":"X","error":null}` - installed and compiled |
| 200 | `{"ok":true,"name":"X","error":{...}}` - installed but broken; see [the error object](#the-error-object) |
| 400 | `invalidName` - the name is malformed, or the tail is empty (`/api/v1/apps/script/`) |
| 403 | `forbidden` - the write API is closed in AP/provisioning mode |
| 413 | `payloadTooLarge` - over [`scriptMaxBytes`](system.md#miscellaneous) (`8192` by default); refused, never truncated |
| 422 | `validationFailed`, `request body must be the script source`, `field: "source"` - empty body |
| 500 | `internalError`, `scripting is disabled (scriptingEnabled is off)` |
| 507 | `insufficientStorage`, `field: "name"` - see the four refusals below |

A `507` carries one of four reasons in `message`, because the remedies differ:

| Reason | Message | What helps |
|---|---|---|
| Count | `script limit reached (<n> installed)` | delete a script, or raise [`scriptLimit`](system.md#miscellaneous) |
| Berry heap | `shared Berry heap <n> bytes is over the … soft limit; remove a script` | delete a script |
| System heap | `not enough free memory to compile (<n> bytes free, needs <m>); remove a script or reboot` | delete a script, or reboot to defragment |
| Fragmentation | `heap too fragmented to compile (largest contiguous block <n> bytes, source is <m>)` | reboot |

The last two apply to **replacements as well as new names**, unlike the first
two. The memory requirement scales with the source size, so a short script still
installs on a device that has just refused a long one. Every cap on this route is
listed in [Limits](limits.md#scripting).

!!! note "`Content-Type` on a script upload"
    The body is Berry source, not JSON, so this is the one write route exempt from the
    `application/json` guard described under [Content-Type](#content-type). Send
    `text/plain`:

    ```bash
    curl -X PUT "http://<device-ip>/api/v1/apps/script/clock" \
      -H "Content-Type: text/plain" --data-binary @clock.ax
    ```

    Any content type is accepted here, including none - the route reads the body verbatim
    either way.

Replacing an installed name builds a **fresh instance**: subscriptions, in-flight requests and
in-memory state are dropped and the old instance released, the persisted store is carried across.
The script keeps its position in the rotation.

[`scriptLimit`](system.md#miscellaneous) caps how many scripts may be resident (default `16`). A
**new** name past the cap - or past the shared-heap soft limit - is rejected with `507` and nothing
is stored; replacing a name that is already installed always works, whatever the limit says.

!!! note "A non-empty `error` is a successful install, not a failure"
    A script that does not compile **still installs**. The source is stored and survives a reboot,
    the app joins the rotation, and it renders an `ERR:<name>` frame. The reply is `200` with the
    compiler message in `error`. Read `error` on every install: an empty string is the only "it works".

    The value also **latches**. A script that raised once keeps reporting that error, and keeps
    rendering `ERR:<name>`, until another `PUT` replaces it.

### Removing a script

`DELETE /api/v1/apps/{name}` - the same call that removes a pushed app. It erases the source, the
persisted store and the app from the rotation, and is idempotent. See
[`DELETE /api/v1/apps/{name}`](#delete-apiv1appsname).

```bash
curl -X DELETE "http://<device-ip>/api/v1/apps/clock"
```

### GET /api/v1/scripts/shared

Everything the installed scripts have published to each other through the `shared` module - the
volatile, owner-scoped key/value space described under
[Talking to other apps](../guides/scripting.md#talking-to-other-apps).

```json
[{"owner":"weather","key":"temp","type":"real","value":21.5,"ageMs":3200},
 {"owner":"weather","key":"unit","type":"string","value":"C","ageMs":3200}]
```

| Field | Meaning |
|---|---|
| `owner` | the install name of the script that wrote it - the only script that may |
| `key` | the bare key inside that script's namespace; scripts address it as `owner.key` |
| `type` | `int`, `real`, `bool` or `string` - the space holds scalars only |
| `value` | the value, in its own JSON type (a non-finite real is `null`) |
| `ageMs` | milliseconds since it was last written |

Grouped by owner, ordered by key within each. An empty space is `[]`.

| Status | Condition |
|---|---|
| 200 | the array above |
| 405 | `methodNotAllowed`, `allowed method(s): GET` |
| 503 | `unavailable`, `scripting is not available` - this build has no scripting platform |

Read-only. Nothing here survives a reboot, and
removing or re-saving a script drops everything it had published.

The path is **not** under `/api/v1/apps/script/`, where it would be indistinguishable from a script
named `shared`.

```bash
curl "http://<device-ip>/api/v1/scripts/shared"
```

---

## Notifications

### POST /api/v1/notifications

Interrupts the rotation with a one-shot message. Accepts every app payload field
([App & notification payload](payload.md)) plus the notification-only fields below.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | - | an identifier for [targeted dismissal](#delete-apiv1notificationsname) - see below |
| `hold` | boolean | `false` | keep it on screen until dismissed |
| `stack` | boolean | `true` | queue behind other notifications instead of replacing |
| `wakeup` | boolean | `false` | wake the display if it is off |
| `sound` | string \| integer | - | melody file `/MELODIES/<x>.txt`, or a DFPlayer track number; an integer is converted to its decimal string |
| `soundRtttl` | string | - | inline RTTTL melody |
| `soundLoop` | boolean | `false` | repeat the sound |

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | body is not valid JSON (`invalidJson`) |
| 422 | `field: "<key>"` - an unknown key, an unreadable colour, an unrecognised mode word, a malformed `scroll`, a malformed `draw` command, or an `effect`/`overlay` name that is not in the registries |
| 507 | the notification queue is full (32) - `insufficientStorage` |
| 405 | wrong method - `allowed method(s): POST` |

The payload is applied whole or rejected whole: any unknown key, unreadable colour or malformed
draw command answers 422 with the offending key in `field` and queues nothing. `effect` and
`overlay` must name something the registries know
([`GET /api/v1/capabilities`](#get-apiv1capabilities)). The full contract is in
[payload → Errors](payload.md#errors).

An **array** payload is accepted only when it holds exactly one element, which must be an object -
that element becomes the notification. More than one element is rejected whole with
`422 validationFailed` (`send one notification per request; an array of more than one is not
accepted`). This is *not* the pushed-app behaviour: notifications do not expand an array into
several entries.

The queue holds **32** notifications; a 33rd is rejected with **`507 insufficientStorage`** rather
than silently dropped.

```bash
curl -X POST http://<device-ip>/api/v1/notifications \
  -H "Content-Type: application/json" \
  -d '{"text":"Doorbell","icon":"1234","textColor":"#FF0000","hold":true,"soundRtttl":"d:d=4,o=5,b=120:c,e,g"}'
```

### DELETE /api/v1/notifications/active

No body. Dismisses the current notification. Always 200 `{"ok":true}` - even when there is
none. Other methods → 405, `allowed method(s): DELETE`.

```bash
curl -X DELETE http://<device-ip>/api/v1/notifications/active
```

### DELETE /api/v1/notifications/{name}

No body. Dismisses the notification carrying `name`, **wherever it sits in the queue** - it does
not have to be the one on screen. Removing a notification that was still waiting is invisible and
leaves the current one running.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - a notification with that name was removed |
| 404 | nothing in the queue carries that name (`notFound`) |
| 405 | wrong method - `allowed method(s): DELETE` |

```bash
# push one that can be retracted later
curl -X POST http://<device-ip>/api/v1/notifications   -H "Content-Type: application/json"   -d '{"name":"backup-job","text":"Backup running","hold":true}'

# retract it, whatever else has arrived since
curl -X DELETE http://<device-ip>/api/v1/notifications/backup-job
```

!!! note "`active` is a reserved name"
    `/api/v1/notifications/active` means "whichever notification is on screen", so a notification
    named literally `active` cannot be addressed through this route. Pick any other name.

!!! warning "A name identifies, it does not protect"
    The name exists so that several senders sharing one device do not dismiss each other's
    messages by accident - the unnamed dismiss takes whatever is on top, regardless of who sent
    it. It is **not** an access control: anyone who can reach the API can dismiss any name they
    know or guess. Restricting who may call the API at all is
    [HTTP authentication](system.md#identity-web-server-and-authentication).

---

## Indicators

!!! note "Indicators render on the panel"
    These routes store the indicator state, echo it back in
    [`GET /api/v1/device`](#get-apiv1device), publish it over MQTT/Home Assistant, **and drive real
    pixels**: the right edge of the panel - id 1 top, id 2 middle, id 3 bottom - honouring `blinkMs`
    (50% blink) and `fadeMs` (breathe).

### PUT /api/v1/indicators/{id}

`{id}` must be a **single character**, `1`, `2` or `3`.

| Key | Type | Range | Default when absent | Units |
|---|---|---|---|---|
| `color` | color | any color form | on/off state unchanged | - |
| `blinkMs` | integer | 0–65535, **not validated** | **reset to `0`** | ms |
| `fadeMs` | integer | 0–65535, **not validated** | **reset to `0`** | ms |

Semantics, all of which surprise people:

* **Only the presence of `color` changes the on/off state.** A payload without `color` leaves
  on/off and the stored color untouched.
* A `color` of `0` or `null` sets the indicator **off** but **keeps the previously stored
  color**, so Home Assistant can republish it unchanged.
* Any other `color` sets the color and turns the indicator **on**. A value the color parser
  cannot read is rejected with `422 validationFailed` (`field: "color"`), leaving the indicator
  and its stored color untouched.
* `blinkMs` and `fadeMs` are **reset to 0 whenever they are absent**. A PUT with only `color`
  silently clears blinking and fading.
* Both are read as 16-bit values with no range check. A value that does not fit reads back as `0`, the same as an absent key.
* An empty body or `{}` does not reset the indicator - it returns `422` (`a JSON body is required
  (use DELETE to turn the indicator off)`). Use [`DELETE`](#delete-apiv1indicatorsid) to clear it.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | body is not valid JSON (`invalidJson`) |
| 415 | body sent with a non-JSON `Content-Type` (`unsupportedMediaType`) |
| 422 | empty or `{}` body - `a JSON body is required (use DELETE to turn the indicator off)` |
| 404 | `notFound`, `indicator id must be 1..3` - for any other id, including `10` |
| 404 | `unknown route` - for the bare path `/api/v1/indicators/` |
| 405 | wrong method - `allowed method(s): PUT, DELETE` |

```bash
curl -X PUT http://<device-ip>/api/v1/indicators/1 \
  -H "Content-Type: application/json" \
  -d '{"color":"#FF0000","blinkMs":500}'
```

### DELETE /api/v1/indicators/{id}

No body. Full reset: off, color `0`, `blinkMs` `0`, `fadeMs` `0`. Always 200 `{"ok":true}`.
Same 404 rule for ids outside 1–3.

```bash
curl -X DELETE http://<device-ip>/api/v1/indicators/1
```

---

## Sounds

### GET /api/v1/sounds

Every melody on the device, with its stored contents and the facts that fall out of parsing it.
One request for the whole list - the response is streamed, so a large collection does not have to
fit in RAM at once.

```json
{"melodies":[{"name":"doorbell","rtttl":"doorbell:d=4,o=5,b=100:e,c",
              "bytes":26,"notes":2,"durationMs":2400,"valid":true}],
 "usedBytes":41216,"totalBytes":1048576}
```

| Field | Meaning |
|---|---|
| `name` | the melody's address - the file is `/MELODIES/<name>.txt` |
| `rtttl` | the file's contents, verbatim |
| `bytes` | file size |
| `notes`, `durationMs` | from parsing `rtttl`; both `0` when it does not parse |
| `valid` | whether it parses |
| `error`, `index` | present only when `valid` is `false`: the reason and the offset |

`usedBytes` and `totalBytes` cover the whole filesystem, not just melodies.

A file that does not parse is **listed, not hidden** - it may have been written by hand or by an
older build, and the editor is the only place it can be repaired.

| Status | Condition |
|---|---|
| 200 | the listing |
| 405 | wrong method - `allowed method(s): GET` |

### PUT /api/v1/sounds/{name}

Saves a melody. Body: `{"rtttl": "d=4,o=5,b=100:e,c"}`.

`{name}` is 1–24 characters of `A-Z`, `a-z`, `0-9`, `_` and `-`.

**The title is normalised to `{name}`.** A two-part `defaults:notes` string gets the name put in
front; a three-part string has its title replaced. The stored file therefore always carries the
name it is filed under, and cannot come to claim a different one.

| Status | Condition |
|---|---|
| 201 | created |
| 200 | replaced an existing melody |
| 400 | body is not valid JSON (`invalidJson`) |
| 415 | `Content-Type` is not `application/json` |
| 422 | `field: "name"` - the name is not 1–24 of `[A-Za-z0-9_-]` |
| 422 | `field: "rtttl"` - missing, not a string, or does not parse; `message` carries the reason and the byte offset |
| 507 | `insufficientStorage` - the flash is full |

```bash
curl -X PUT http://<device-ip>/api/v1/sounds/doorbell \
  -H "Content-Type: application/json" \
  -d '{"rtttl":"d=4,o=5,b=100:e,c"}'
```

### DELETE /api/v1/sounds/{name}

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 404 | `notFound`, `melody not found` |
| 405 | wrong method - `allowed method(s): PUT, DELETE` |

There is no rename route: PUT the new name, then DELETE the old one.

### POST /api/v1/sounds/stop

Stops whatever is playing. `{"ok":true}`, always.

**Ignores `soundEnabled`.** Every other sound route returns early on a muted device; this one does
not.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 405 | wrong method - `allowed method(s): POST` |

### POST /api/v1/sounds/play

| Key | Type | Meaning |
|---|---|---|
| `name` | string | melody file - plays `/MELODIES/<name>.txt`, or a DFPlayer track |
| `rtttl` | string | inline RTTTL melody |
| `builtin` | string | plays the built-in R2D2 melody |

**Send exactly one of the three.** Any of them counts as present whatever its type, and a body
carrying more than one is rejected whole - nothing plays.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | body is not valid JSON (`invalidJson`) |
| 404 | `notFound`, `sound not found` - `name` only: the melody file is missing or unparseable, or there is no buzzer |
| 422 | `field: "name"`, `exactly one of "name", "rtttl" or "builtin" is allowed` - more than one of the three keys is present |
| 422 | `field: "name"`, `one of "name", "rtttl" or "builtin" is required` - none of the three keys held a string |
| 422 | `field: "rtttl"` - the inline melody does not parse; `message` carries the reason and the byte offset |
| 422 | `field: "rtttl"` / `"builtin"` - the DFPlayer backend supports neither RTTTL nor the built-in melody |
| 405 | wrong method - `allowed method(s): POST` |

!!! warning "`builtin` ignores its value"
    `builtin` plays the same built-in R2D2 melody for **any** string - the value is discarded,
    so no name is ever rejected and 404 is impossible on this key.

    When `settings.soundEnabled` is `false`, **all three** keys are muted consistently: `name`,
    `rtttl` and `builtin` each return `200` without producing sound (the 404 for an unknown melody
    disappears on a muted device). On a **DFPlayer** board, which cannot play them, `rtttl` and
    `builtin` return **`422 validationFailed`** (`RTTTL is not supported on this sound backend` / `the
    built-in melody is not supported on this sound backend`) rather than silently doing nothing.

```bash
curl -X POST http://<device-ip>/api/v1/sounds/play \
  -H "Content-Type: application/json" \
  -d '{"rtttl":"beep:d=4,o=5,b=120:c,e,g"}'
```

---

## Radio

Internet radio over an I²S DAC. **ESP32-S3 only**: the classic ESP32 has neither the RAM nor the
flash headroom for stream decoding, and every route here answers `503 unavailable` on it, as it does
on an S3 without PSRAM or with the I²S pins unset. `capabilities.radio` says which it is, and the
web UI hides its Radio tab on a `false` rather than offering a control that always fails.

Editing the station list is the exception: that works on every build. Losing a configured list by
flashing a lean image would be the worse surprise.

Wiring, limits and troubleshooting are in **[Internet radio](../guides/radio.md)**.

### GET /api/v1/radio

Playback status and the station list in one read - the web UI polls this while its tab is open and
has no use for them separately.

```json
{
  "available": true,
  "playing": true,
  "station": "SWR3",
  "title": "Kraftwerk - Das Model",
  "error": "",
  "underruns": 0,
  "decodeUs": 4180,
  "starvedMs": 0,
  "bufferBytes": 12288,
  "stations": [{"name": "SWR3", "url": "https://liveradio.swr.de/sw282p3/swr3/"}]
}
```

| Key | Type | Meaning |
|---|---|---|
| `available` | boolean | Whether this build and this hardware can play at all |
| `playing` | boolean | A stream is running |
| `station` | string | The label that was tuned to - a station name, or the URL for an ad-hoc play |
| `title` | string | Last track title the stream reported, UTF-8, empty until one arrives |
| `error` | string | Why playback stopped, cleared on the next successful play |
| `underruns` | integer | Times the output fell more than one buffer behind real time - each one is a dropout you hear |
| `decodeUs` | integer | Rolling average microseconds to decode one MP3 frame. A frame is 26100 µs of audio, so this over 26100 is the share of one core the decoder needs |
| `starvedMs` | integer | Milliseconds the audio task waited with nothing to decode - separates a slow network from a slow decoder |
| `bufferBytes` | integer | Undecoded bytes still buffered - how long a network stall playback can absorb |
| `stations` | array | The stored list |

The four counters are playback health, not settings. `underruns` and `starvedMs` accumulate for as
long as the radio service is up rather than resetting per station, so read them as the difference
between two polls. All four are `0` when `available` is `false`.

Non-GET methods → 405, `allowed method(s): GET`.

### POST /api/v1/radio/play

One of three spellings, because three are natural:

| Key | Type | Meaning |
|---|---|---|
| `station` | string | A name from the stored list |
| `index` | integer | A position in the stored list |
| `url` | string | A stream that is not in the list; `http://` or `https://` |

`station` wins when more than one is given. A URL that points at an `.m3u` or `.pls` playlist is
resolved to its first playable entry.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - tuning has started; a stream that turns out to be unplayable reports later through `error` |
| 404 | no station by that name or at that index |
| 422 | `{}`, or a `url` with an unsupported scheme |
| 503 | `unavailable` - no audio output on this build; or `serviceBusy` when an HTTPS stream is asked for with too little free heap |

### POST /api/v1/radio/stop

Stops playback. `{"ok":true}`.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 405 | wrong method - `allowed method(s): POST` |
| 503 | `unavailable` - no audio output on this build |

### PUT /api/v1/radio/stations

Replaces the whole list. There is no per-station route: a station has no identity beyond a name the
user can edit, so a partial update would need one invented.

```json
{"stations": [{"name": "SWR3", "url": "https://liveradio.swr.de/sw282p3/swr3/"}]}
```

A bare array is also accepted. Limits: **32** stations, name 1–24 characters, URL at most 255,
scheme `http` or `https`, names unique.

Validation is all-or-nothing and the error names the offending row, so a client editing a long list
is told *which* one is wrong:

```json
{"error":{"code":"validationFailed","message":"must not be empty","field":"stations[1].name"}}
```

| Status | Condition |
|---|---|
| 200 | `{"ok":true}`, stored and persisted |
| 400 | body is not valid JSON |
| 422 | a rejected entry, or more than 32 |
| 405 | wrong method - `allowed method(s): PUT` |

---

## Capabilities

### GET /api/v1/capabilities

The name lists this firmware build actually supports, assembled at boot from the registries.
Fetch this rather than hardcoding names.

```json
{"effects":[...],"transitions":[...],"overlays":[...],"palettes":[...],"radio":bool,"gpio":{...}}
```

| Key | Count | Values |
|---|---|---|
| `effects` | 19 | `BrickBreaker`, `Checkerboard`, `ColorWaves`, `Fade`, `Fireworks`, `LookingEyes`, `Matrix`, `MovingLine`, `Pacifica`, `PingPong`, `Plasma`, `PlasmaCloud`, `Radar`, `Ripple`, `Snake`, `SwirlIn`, `SwirlOut`, `TheaterChase`, `TwinklingStars` |
| `transitions` | 22 | `Random`, `Slide`, `Dim`, `Zoom`, `Rotate`, `Pixelate`, `Curtain`, `Ripple`, `Blink`, `Reload`, `Fade`, `Cover`, `Uncover`, `Split`, `Blinds`, `Blocks`, `Flash`, `Diamond`, `Wave`, `Rain`, `Melt`, `Interlace` |
| `overlays` | 6 | `drizzle`, `frost`, `rain`, `snow`, `storm`, `thunder` |
| `palettes` | 8 | `Cloud`, `Lava`, `Ocean`, `Forest`, `Stripe`, `Party`, `Heat`, `Rainbow` - the built-ins only; list palette files with `GET /api/v1/files?dir=/PALETTES` |
| `gpio` | - | the chip's pin rules - see below |

#### `gpio`: what the chip can do

The pin fields under [`/api/v1/system`](#get-apiv1system) are validated against the chip the
firmware was built for, and the rules differ sharply between them: an ESP32 has GPIO 0–39 with
34–39 input-only and ADC1 on 32–39, an ESP32-S3 has 0–48 with no input-only pins at all and ADC1
on 1–10. Read them here instead of hardcoding a table per chip; the web UI builds its whole GPIO
form from it.

```json
"gpio":{"soc":"esp32s3","label":"ESP32-S3","max":48,
        "missing":[[22,25]],"inputOnly":[],
        "reserved":[{"lo":19,"hi":20,"why":"the USB-JTAG interface"},
                    {"lo":26,"hi":37,"why":"the SPI flash and PSRAM"},
                    {"lo":43,"hi":44,"why":"the UART0 console"}],
        "adc1":[[1,10]],"strapping":[[0,0],[3,3],[45,46]],
        "matrix":[13,14,15,16,17,18,21,38,39,40,41,42,47],
        "defaults":{"pinMatrix":21, ...}}
```

| Key | Meaning |
|---|---|
| `soc`, `label` | chip id and display name; same value as `soc` in the device state |
| `max` | highest GPIO number that exists |
| `missing` | inclusive ranges inside `0…max` the package does not bond out - rejected |
| `inputOnly` | cannot drive an output, so they are refused for the matrix, buttons, buzzer, I²C and DFPlayer TX. Empty on the ESP32-S3 |
| `reserved` | taken by the flash, PSRAM, USB or the console. Each carries `why`, which is also what the rejection message says |
| `adc1` | the only pins accepted for `pinBattery` and `pinLdr` - ADC2 stops working while WiFi is on |
| `strapping` | boot-mode pins. Reported as a caution, **never rejected**: the Ulanzi TC001 defaults already use three of them |
| `matrix` | the only values `pinMatrix` accepts - fixed by the firmware image, not a preference |
| `defaults` | the pin map a factory-fresh device of this chip starts with, and the one it falls back to if the stored map fails validation |

`effects` and `overlays` come out ASCII-sorted; `transitions` is in declaration order, which is
also the `transitionEffect` index order. Effect, overlay, palette and transition names are all
matched **case-insensitively** - `"matrix"`, `"Matrix"` and `"MATRIX"` are the same effect. This
response always advertises the canonical spelling, so it stays the list to copy from.

Non-GET methods → 405, `allowed method(s): GET`.

```bash
curl http://<device-ip>/api/v1/capabilities
```

---

## System

Device configuration: Wi-Fi, MQTT, NTP, auth, hardware and the GPIO map. Prose for each field:
[System configuration](system.md). GPIO rules in depth: [GPIO & boards](gpio.md).

### GET /api/v1/system

Returns **66** of the 69 configuration fields. The JSON key is the field name for every one.

!!! note "Secrets are withheld unless you ask for them"
    `wifiPass`, `mqttPass` and `authPass` are omitted by default - that is the 66 of 69 above.
    Pass `?secrets=1` to include them, so a backup can round-trip the Wi-Fi, MQTT and auth
    credentials:

    ```bash
    curl http://<device-ip>/api/v1/system?secrets=1
    ```

    The parameter is ignored in provisioning (AP) mode, since that access point is open. When
    HTTP auth is enabled it gates this request like any other. `PUT` responses never include
    the secrets.

```bash
curl http://<device-ip>/api/v1/system
```

### PUT /api/v1/system

Partial merge. The payload is applied to a scratch copy, every scalar is range- and type-checked,
the merged GPIO map is validated as a whole, and only then is anything written to NVS. On success
the device answers **200 with the full resulting configuration** (secrets still omitted), saves,
and fires the config-changed callback.

| Status | Condition |
|---|---|
| 200 | the resulting configuration |
| 400 | `invalidJson`, `request body is not valid JSON` |
| 400 | `invalidPinConfig` + the validator's message - nothing was saved |
| 422 | `validationFailed` - a numeric field is out of range or the wrong type, or a load-bearing string was blanked; `field` names it |
| 405 | wrong method - `allowed method(s): GET, PUT` |

Behaviour to know:

* **Numeric fields are validated before anything is stored.** A value outside the documented range
  answers `422 validationFailed` with the offending key in `field`, and nothing is saved. The
  ranges are in the field table below; the full list is also in
  [Errors → `PUT /api/v1/system`](errors.md#put-apiv1system).
* **Unknown keys are silently ignored** - this is a partial merge, not a strict schema. Strings
  (`tz`, `hostname`, `buttonCallback`, …) are not range-checked either.
* **The deeper GPIO rules still answer 400.** Duplicate pins, input-only pins and the matrix
  driver whitelist are `invalidPinConfig`, not 422 - see [GPIO validation](#gpio-validation).
* **Secrets honour skip-empty**: sending `"authPass": ""` leaves the stored password alone
  rather than clearing it. Most other strings *can* be cleared with `""` - `ntpServer`, `ip`,
  `mqttUser` and so on.
* **MQTT and HTTP auth are gated by a switch.** `mqttEnabled` runs the
  MQTT client and `authEnabled` requires HTTP Basic auth; each runs only while its flag is
  `true`, and turning it off keeps the stored host/username/password. `mqttHost` and `authUser`
  are ordinary strings you may blank freely. A gate is refused unless it has what it needs, with
  `422 validationFailed` and the key in `field`:

    | Set | Requires | Field named on `422` |
    |---|---|---|
    | `mqttEnabled: true` | a non-empty `mqttHost` | `mqttHost` |
    | `authEnabled: true` | a non-empty `authUser` **and** `authPass` | `authUser` |

* **`wifiSsid` cannot be blanked**, because an empty SSID drops the device into AP mode. It
  answers `422 validationFailed` (`field: wifiSsid`) and points at
  [`POST /api/v1/device/factory-reset`](#post-apiv1devicefactory-reset). To clear stored
  secrets entirely, use the same factory-reset route - a `PUT` never clears a secret.

* **Most changes, and all pin changes, apply after a reboot.** The web UI shows a
  "reboot required" banner in that case.

#### Fields

| Key | Type | Default | Units / notes |
|---|---|---|---|
| `wifiSsid` | string | `""` | |
| `wifiPass` | string | `""` | **secret** - omitted on read, `""` ignored on write |
| `netStatic` | boolean | `false` | static IP instead of DHCP |
| `ip` | string | `""` | accepts a CIDR suffix (`192.168.1.50/24`), stored as `ip` + `subnet` |
| `gateway` | string | `""` | |
| `subnet` | string | `""` | |
| `dns1` | string | `""` | |
| `dns2` | string | `""` | |
| `wifiConnectTimeout` | long | `15000` | boot join timeout in ms (5000–120000) before falling back to the provisioning AP |
| `wifiRoamRssi` | int | `0` | roam below this RSSI in dBm (−90–0); `0` = off |
| `mqttEnabled` | boolean | `false` | master switch; `true` needs a non-empty `mqttHost` |
| `mqttHost` | string | `""` | |
| `mqttPort` | integer | `1883` | 1–65535 |
| `mqttUser` | string | `""` | |
| `mqttPass` | string | `""` | **secret** |
| `mqttPrefix` | string | `""` | empty falls back to the device uid |
| `haDiscovery` | boolean | `false` | Home Assistant auto-discovery |
| `haPrefix` | string | `"homeassistant"` | |
| `ntpServer` | string | `"pool.ntp.org"` | |
| `tz` | string | `"CET-1CEST,M3.5.0,M10.5.0/3"` | POSIX TZ string, daylight-saving rules included |
| `tzName` | string | `"Europe/Berlin"` | IANA zone `tz` was picked from; display only |
| `hostname` | string | `""` | empty becomes `awtrix_<uid>` |
| `webPort` | integer | `80` | 0–65535; `0` falls back to 80; AP mode always uses 80 |
| `authEnabled` | boolean | `false` | master switch for HTTP Basic auth; `true` needs `authUser` **and** `authPass` |
| `authUser` | string | `""` | |
| `authPass` | string | `""` | **secret** |
| `tempOffset` | number | `-9.0` | °C, −20–20 |
| `humOffset` | number | `0.0` | %, −50–50 |
| `batteryDividerRatio` | number | `1.79` | 0.1–10; V_cell / V_pin - calibrate as `4.2 / (batteryMillivolts / 1000)` on a full cell |
| `minBrightness` | integer | `10` | 0–255 |
| `maxBrightness` | integer | `220` | 0–255 |
| `ldrFactor` | number | `1.0` | 0–10 |
| `ldrGamma` | number | `2.2` | 0.1–10; `1.0` = curve off (neutral) |
| `ldrOnGround` | boolean | `false` | LDR wiring orientation |
| `brightnessSmoothing` | long | `10000` | ms the panel takes to follow an ambient-light change (0–60000); `0` = instantly |
| `lowBatteryThreshold` | integer | `0` | 0–100 %; below it `GET /api/v1/device` reports `lowBattery: true`. `0` = off |
| `panelWidth` | integer | `32` | 1–128; `panelWidth × panels` must come to 32–128 |
| `panels` | integer | `1` | 1–128; how many panels the strip runs through |
| `panelStart` | string | `"topLeft"` | `topLeft` · `topRight` · `bottomLeft` · `bottomRight` |
| `panelWiring` | string | `"rows"` | `rows` · `columns` |
| `panelSerpentine` | boolean | `true` | every second row or column runs backwards |
| `mirror` | boolean | `false` | mirrors the displayed image, not the wiring |
| `rotate` | boolean | `false` | rotates the displayed image 180°; also swaps left/right buttons |
| `swapButtons` | boolean | `false` | |
| `dfplayer` | boolean | `false` | DFPlayer Mini instead of the buzzer; selects the sound backend only - it does **not** gate DF-pin validation |
| `buttonCallback` | string | `""` | HTTP webhook URL fired on button press |
| `artnet` | boolean | `false` | opt-in Art-Net DMX receiver (UDP 6454); the socket stays closed while `false` |
| `statsInterval` | integer | `10000` | ms, 1000–600000 |
| `tempDecimals` | integer | `0` | 0–2 |
| `debugMode` | boolean | `false` | gates verbose request/command tracing |
| `scriptingEnabled` | boolean | `true` | whether the Berry stack exists at all; off frees ~20 KB RAM, script routes answer `503`. Applies after reboot - see [System](system.md#miscellaneous) |
| `scriptLimit` | integer | `16` | 0–32; how many Berry scripts may be resident. Lowering it below the number installed refuses new names without removing any |
| `scriptMaxBytes` | integer | `8192` | 1024–32768; largest script source accepted. Lowering it refuses larger new installs but never drops a stored script |
| `pinMatrix` | integer | `32` | always treated as enabled |
| `pinBtnLeft` | integer | `26` | `-1` = disabled |
| `pinBtnSelect` | integer | `27` | `-1` = disabled |
| `pinBtnRight` | integer | `14` | `-1` = disabled |
| `pinBattery` | integer | `34` | `-1` removes all battery fields and the Battery app |
| `pinLdr` | integer | `35` | `-1` = disabled |
| `pinBuzzer` | integer | `15` | `-1` = disabled |
| `pinI2cSda` | integer | `21` | `-1` = disabled |
| `pinI2cScl` | integer | `22` | `-1` = disabled |
| `pinDfRx` | integer | `23` | validated whenever set (`≥ 0`); `dfplayer` does not gate it |
| `pinDfTx` | integer | `18` | validated whenever set (`≥ 0`); `dfplayer` does not gate it |
| `pinI2sBclk` | integer | `-1` | I²S bit clock. ESP32-S3 only; `-1` on the ESP32 |
| `pinI2sLrclk` | integer | `-1` | I²S word-select clock. ESP32-S3 only; `-1` on the ESP32 |
| `pinI2sDout` | integer | `-1` | I²S data to the DAC. ESP32-S3 only; `-1` on the ESP32 |

The three `pinI2s*` fields are one bus and are validated together: give all three, or `-1` for all
three. A half-configured set is a `422 validationFailed` naming the missing pin, because otherwise
the config would store cleanly and playback would simply never start.

Defaults are the Ulanzi TC001 wiring. `-1` disables a feature. Every `pin*` field must be `-1` or a
GPIO within the compiled chip's range (`0–39` on the ESP32, `0–48` except `22–25` on the ESP32-S3);
anything else is a `422 validationFailed` before the pin map is even considered.

#### GPIO validation

`pinMatrix` is checked first; then every pin is walked in field order - `pinMatrix`, `pinBtnLeft`,
`pinBtnSelect`, `pinBtnRight`, `pinBattery`, `pinLdr`, `pinBuzzer`, `pinI2cSda`, `pinI2cScl`,
`pinDfRx`, `pinDfTx`, `pinI2sBclk`, `pinI2sLrclk`, `pinI2sDout` - each checked against the
range/reserved/input-only rules before the next
pin, so it is the pin earlier in this list that gets reported. The ADC1 and duplicate checks run
after every pin has passed the per-pin rules. The first failure wins and becomes `error.message`
of a `400 invalidPinConfig`.

The six ordered rules, their **exact per-chip messages** (they name the compiled chip - ESP32 vs
ESP32-S3 - and its ranges differ), and the AWTRIX 2 matrix/SDA duplicate-pin fix are documented
once in **[GPIO & boards](gpio.md#validation-rules)** - the canonical GPIO reference.

Output-needing pins are `pinMatrix`, the three button pins (they need `INPUT_PULLUP`),
`pinBuzzer`, `pinI2cSda`, `pinI2cScl`, `pinDfTx` and the three `pinI2s*` lines. `pinMatrix` is always treated as enabled;
every other pin - including `pinDfRx` and `pinDfTx` - is enabled, and validated, whenever it is
`>= 0`; `dfplayer` does not gate whether the DF pins are checked, only whether the DFPlayer is
actually driven.

```bash
curl -X PUT http://<device-ip>/api/v1/system \
  -H "Content-Type: application/json" \
  -d '{"ntpServer":"192.168.1.1","statsInterval":30000}'
```

### GET /api/v1/system/wifi-scan

Asynchronous. Poll it.

| Status | Body | Condition |
|---|---|---|
| 202 | `{"scanning":true}` | no scan had been started - one is kicked off now - or a scan is still running |
| 200 | array of networks | results are ready (possibly `[]`) |

| Key | Type | Meaning |
|---|---|---|
| `ssid` | string | |
| `rssi` | integer | dBm |
| `enc` | boolean | `false` for an open network |

Results are **deleted after being served**, so the next request starts a fresh scan and returns
202 again. There is no caching. GET only; other methods → 405, `allowed method(s): GET`.

```bash
curl http://<device-ip>/api/v1/system/wifi-scan   # 202, then poll
```

### GET /api/v1/logs

The incremental device log behind the web UI console.

| Query param | Type | Default | Meaning |
|---|---|---|---|
| `after` | integer | `0` | return only lines with a sequence number greater than this |

| Key | Type | Meaning |
|---|---|---|
| `next` | integer | sequence of the newest buffered line; `0` when the buffer is empty |
| `lines` | array of strings | every buffered line with `seq > after` |

Poll incrementally by passing the previous `next` back as `after`. The device keeps the **last 34
lines**, each capped at 120 characters; once full, the oldest line is dropped as a new one arrives. Each line is prefixed `HH:MM:SS ` once NTP
has synced, and with uptime seconds in the form `[%6lus] ` before that.

GET only; other methods → 405, `allowed method(s): GET`.

```bash
curl "http://<device-ip>/api/v1/logs?after=0"
```

---

## Files

LittleFS holds your icons, melodies and palettes. The partition takes whatever the two firmware
slots leave: **512 KB** on a 4 MB ESP32, several megabytes on a larger part. `GET /api/v1/files`
reports the real figures as `usedBytes` and `totalBytes`.

### GET /api/v1/files

| Query param | Type | Default | Meaning |
|---|---|---|---|
| `dir` | string | `/ICONS` | directory to list |

| Key | Type | Meaning |
|---|---|---|
| `files` | array | `{name: string, size: integer}` per entry |
| `usedBytes` | integer | LittleFS bytes in use |
| `totalBytes` | integer | LittleFS partition size |

A `dir` that does not exist, or is not a directory, returns **200 with an empty `files` array**
- not a 404. This read path uses `dir` verbatim: no leading-slash fixup and, unlike DELETE and
the static asset routes, **no `..` traversal guard**.

```bash
curl "http://<device-ip>/api/v1/files?dir=/MELODIES"
```

### POST /api/v1/files

`multipart/form-data` upload. There is **no
captive-portal redirect** on this route; auth is re-checked inside the upload handler instead.

| Query param | Type | Default | Meaning |
|---|---|---|---|
| `dir` | string | `/ICONS` | target directory - **ignored** when the multipart filename starts with `/` |

Path resolution:

* filename starts with `/` → used as the absolute path, `?dir=` ignored
* otherwise → `<dir>/<filename>`, with a leading `/` prepended to `dir` if missing
* the resolved path must be under `/ICONS`, `/MELODIES` or `/PALETTES` and contain no `..` -
  anything else is rejected with `400 invalidPath` before a byte is written
* the parent directory is created if it does not exist

The multipart **field name is irrelevant** - any file part is accepted.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | `invalidPath` - the target escapes the three asset folders, or contains `..` |
| 401 | auth failed - returned only *after* the entire body has been consumed |
| 403 | `forbidden` - file upload is disabled in AP/provisioning mode |
| 500 | `internalError` - the write failed (storage full); nothing was left behind |

A failed write is reported as `500`, not a false `200`. Verify with `GET /api/v1/files`.

```bash
curl -X POST "http://<device-ip>/api/v1/files?dir=/ICONS" \
  -F "file=@1234.jpg"
```

### DELETE /api/v1/files

| Query param | Type | Required | Meaning |
|---|---|---|---|
| `path` | string | yes | full path of the file to remove |

Deletion is confined to `/ICONS`, `/MELODIES` and `/PALETTES`: `path` must be under one of those
folders and contain no `..`.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` |
| 400 | `invalidPath` - missing `path`, a `..` traversal, or a path outside the three asset folders |
| 404 | `notFound`, `file not found` - the path is valid but no such file exists |
| 405 | wrong method - `allowed method(s): GET, POST, DELETE` |

```bash
curl -X DELETE "http://<device-ip>/api/v1/files?path=/ICONS/1234.jpg"
```

---

## Firmware upload

### POST /update

`multipart/form-data` upload of a firmware image - the only way firmware reaches the device
over the network, and what the web UI uses. Auth is re-checked inside the upload handler.

| Status | Condition |
|---|---|
| 200 | `{"ok":true}` - the device then reboots into the new image |
| 400 | `wrongChip` - the image was built for the other chip (esp32 vs esp32s3), or carries no valid firmware header |
| 401 | auth failed |
| 403 | `forbidden` - firmware upload is disabled in AP/provisioning mode |
| 500 | `internalError`, `firmware update failed (bad image or storage full)` - the OTA slot could not be written |

The image is size-checked against the free OTA slot before any byte is written, and both routes report
their failures honestly.

```bash
curl -X POST http://<device-ip>/update -F "firmware=@firmware-awtrix.bin"
```

---

## Backup restore

### POST /api/v1/restore

`multipart/form-data` upload of a backup `.zip` - the store-only (uncompressed) archive the web
UI produces. Registered like the other upload routes, so it runs outside dispatch()'s AP-mode
allow-list and **is reachable during provisioning**: a blank device can be restored, wifi
credentials included, from a backup alone. Auth is re-checked inside the upload handler, the same
rule as [`POST /api/v1/files`](#post-apiv1files) - a device with no auth user configured (a blank
device in AP mode) lets the restore through, one with `authEnabled` still requires the
credentials.

Entries are matched by name; `manifest.json` must be first and is validated - app `awtrix-ng`, a
supported `backupFormat` - before anything else in the archive is touched.

| Entry | Effect |
|---|---|
| `manifest.json` | must be first; rejects the whole archive if it does not check out |
| `config/wifi.json` | `{wifiSsid, wifiPass}` merged into the Wi-Fi config |
| `config/system.json` | the rest of device configuration, validated like [`PUT /api/v1/system`](#put-apiv1system) |
| `config/settings.json` | display/behaviour settings, validated like [`PATCH /api/v1/settings`](#patch-apiv1settings) - applied to the running device immediately |
| `apploop.json` | app rotation order, same shape as [`PUT /api/v1/apps/order`](#put-apiv1appsorder) |
| `ICONS/*`, `MELODIES/*`, `PALETTES/*`, `SCRIPTS/*` | written to LittleFS under the matching directory |

Content is checked per folder exactly like [`POST /api/v1/files`](#post-apiv1files): a path that
escapes its folder, an entry whose CRC does not check out, or a file whose content does not match
its folder is **skipped with a warning** rather than trusted, and does not abort the rest of the
restore. An unrecognized entry name is skipped and warned about too.

| Status | Body | Condition |
|---|---|---|
| 200 | `{"ok":true,"applied":{...},"warnings":[...]}` | the archive had a valid manifest - even if every other entry was skipped |
| 400 | `{"ok":false,"error":"..."}` | the archive was rejected outright - not a zip, no `manifest.json`, a manifest naming a different app, or an unsupported `backupFormat` |
| 401 | auth failed |

!!! note "Not the standard error envelope"
    A restore can partially succeed, so this route answers its own JSON shape instead of the
    [error envelope](#errors) used everywhere else: `ok`, an `applied` object counting how many
    entries of each kind were actually applied (`wifi`, `system`, `settings`, `appLoop`, `icons`,
    `melodies`, `palettes`, `scripts`, plus `skipped` for rejected entries), and a `warnings` array
    with one string per skipped or rejected entry.

Config changes that only take effect at boot - new Wi-Fi credentials, `config/system.json` - need
a reboot to apply; [`POST /api/v1/device/reboot`](#post-apiv1devicereboot) is allowed in AP mode
too.

```bash
curl -X POST http://<device-ip>/api/v1/restore -F "file=@backup.zip"
```

---

## Web UI and static assets

### GET /

The gzipped web UI, embedded in the firmware. Served for `/` and `/index.html`.

| Status | Condition |
|---|---|
| 304 | the request's `If-None-Match` matches the build's ETag; empty body |
| 200 | `text/html` with `Content-Encoding: gzip`, `ETag: <build etag>`, `Cache-Control: no-cache` |

Authentication applies. This branch is not method-gated: any method reaches it.

### GET /ICONS/*, /MELODIES/*, /PALETTES/*, /SCRIPTS/*, /apploop.json

Static files from LittleFS. **GET only**. `/ICONS/`, `/MELODIES/` and `/PALETTES/` are served
in every mode; `/SCRIPTS/*` and `/apploop.json` are served over GET **only outside provisioning
AP mode** (they are part of the backup-readable set). Any path containing `..` is rejected before
the filesystem is touched. Everything else falls through to the 404 below.

| Status | Condition |
|---|---|
| 200 | the file, with `Cache-Control: max-age=3600` |
| 404 | `notFound`, `file not found` - missing file, or the path is a directory |

MIME type by extension: `.jpg`/`.jpeg` → `image/jpeg`, `.gif` → `image/gif`, `.png` →
`image/png`, `.txt` → `text/plain`, anything else → `application/octet-stream`.

Authentication applies.

```bash
curl http://<device-ip>/ICONS/1234.jpg -o 1234.jpg
```

### Unknown routes

Anything not matched above answers **404** `notFound` with message `unknown route`.

---

## Route index

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/device` | [state & statistics](#get-apiv1device) |
| GET | `/api/v1/version` | [JSON version](#get-apiv1version) |
| GET | `/version` | [plain-text version](#get-version) |
| POST | `/api/v1/device/reboot` | [200, then reboots](#post-apiv1devicereboot) |
| POST | `/api/v1/device/sleep` | [200, then sleeps](#post-apiv1devicesleep) |
| POST | `/api/v1/device/factory-reset` | [200, then resets](#post-apiv1devicefactory-reset) |
| GET | `/api/v1/settings` | [46 keys](#get-apiv1settings) |
| PATCH | `/api/v1/settings` | [returns the full resource](#patch-apiv1settings) |
| POST | `/api/v1/settings/reset` | [200, then resets](#post-apiv1settingsreset) |
| GET | `/api/v1/display` | [power, brightness, overlay, moodlight](#get-apiv1display) |
| PATCH | `/api/v1/display` | [power / overlay](#patch-apiv1display) |
| PUT | `/api/v1/display/moodlight` | [flood color; `{}` → 422](#put-apiv1displaymoodlight) |
| DELETE | `/api/v1/display/moodlight` | [off](#delete-apiv1displaymoodlight) |
| GET | `/api/v1/display/screen` | [framebuffer](#get-apiv1displayscreen) |
| GET | `/api/v1/apps` | [inventory](#get-apiv1apps) |
| PUT | `/api/v1/apps/active` | [switch](#put-apiv1appsactive) |
| POST | `/api/v1/apps/next` | [next](#post-apiv1appsnext) |
| POST | `/api/v1/apps/previous` | [previous](#post-apiv1appsprevious) |
| PUT | `/api/v1/apps/order` | [the list is the loop](#put-apiv1appsorder) |
| PUT | `/api/v1/apps/pushed/{name}` | [`{}` → 422; 507 at cap](#put-apiv1appspushedname) |
| GET | `/api/v1/apps/script/{name}` | [raw Berry source, `text/plain`](#get-apiv1appsscriptname) |
| PUT | `/api/v1/apps/script/{name}` | [body is Berry source; a compile error is still a 200](#put-apiv1appsscriptname) |
| GET | `/api/v1/scripts/shared` | [what the scripts publish to each other](#get-apiv1scriptsshared) |
| DELETE | `/api/v1/apps/{name}` | [kind-agnostic, idempotent](#delete-apiv1appsname) |
| POST | `/api/v1/notifications` | [400 / 507 on failure](#post-apiv1notifications) |
| DELETE | `/api/v1/notifications/active` | [dismiss](#delete-apiv1notificationsactive) |
| PUT | `/api/v1/indicators/{id}` | [corner pixels](#put-apiv1indicatorsid) |
| DELETE | `/api/v1/indicators/{id}` | [clears the indicator](#delete-apiv1indicatorsid) |
| GET | `/api/v1/sounds` | [every melody, parsed](#get-apiv1sounds) |
| PUT | `/api/v1/sounds/{name}` | [save; the title is normalised to `{name}`](#put-apiv1soundsname) |
| DELETE | `/api/v1/sounds/{name}` | [404 if absent](#delete-apiv1soundsname) |
| POST | `/api/v1/sounds/play` | [exactly one of name/rtttl/builtin](#post-apiv1soundsplay) |
| POST | `/api/v1/sounds/stop` | [ignores the mute](#post-apiv1soundsstop) |
| GET | `/api/v1/radio` | [status and station list](#get-apiv1radio) |
| POST | `/api/v1/radio/play` | [station, index or url](#post-apiv1radioplay) |
| POST | `/api/v1/radio/stop` | [stop](#post-apiv1radiostop) |
| PUT | `/api/v1/radio/stations` | [replaces the whole list](#put-apiv1radiostations) |
| GET | `/api/v1/capabilities` | [names this build supports](#get-apiv1capabilities) |
| GET | `/api/v1/system` | [66 of 69 fields](#get-apiv1system) |
| PUT | `/api/v1/system` | [partial merge + pin validation](#put-apiv1system) |
| GET | `/api/v1/system/wifi-scan` | [async, 202 while running](#get-apiv1systemwifi-scan) |
| GET | `/api/v1/logs` | [incremental](#get-apiv1logs) |
| GET | `/api/v1/files` | [list](#get-apiv1files) |
| POST | `/api/v1/files` | [multipart upload](#post-apiv1files) |
| DELETE | `/api/v1/files` | [by `?path=`, allowlisted](#delete-apiv1files) |
| POST | `/update` | [firmware image](#post-update) |
| POST | `/api/v1/restore` | [backup ZIP; available in AP mode](#post-apiv1restore) |
| GET | `/`, `/index.html` | [web UI](#get) |
| GET | `/ICONS/*`, `/MELODIES/*`, `/PALETTES/*` | [static assets](#web-ui-and-static-assets) |
