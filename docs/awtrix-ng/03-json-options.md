# AWTRIX NG JSON options

This document lists the JSON fields accepted by the Homey AWTRIX NG JSON flow cards.

AWTRIX NG is treated as a separate implementation from AWTRIX 3. These JSON payloads must use AWTRIX NG field names. AWTRIX 3 aliases are not translated and unknown fields are rejected before the HTTP request so they cannot be silently dropped.

## General rules

- Payload must be a single JSON object.
- Pushed app payload arrays are not supported by this Homey app.
- Field names are case-sensitive.
- JSON payload durations use milliseconds and fields are named with the `Ms` suffix.
- Basic Homey flow cards use Homey's native **Add duration** option instead of a visible `durationMs` argument. If the user does not add a duration, `durationMs` is omitted and AWTRIX NG uses its device default.
- Colors follow the AWTRIX NG API color input model:
  - CSS-like color string, for example `"#FF0000"`,
  - number,
  - RGB tuple, for example `[255, 0, 0]`,
  - HSV tuple, for example `["HSV", 120, 255, 255]`.
- Some color fields also accept the string `"palette"`.
- Any field not listed here is rejected.

## JSON Properties for AWTRIX NG that are available for users

This table lists the JSON properties accepted by the Homey app for AWTRIX NG notification and pushed app payloads.

| property | type | notify | app |
|---|---|---|---|
| `text` | `string` or `TextFragment[]` | X | X |
| `textCase` | `"inherit" \| "upper" \| "asTyped"` | X | X |
| `textColor` | `ColorInput \| "palette"` | X | X |
| `textBlinkMs` | `number` | X | X |
| `textFadeMs` | `number` | X | X |
| `textCenter` | `boolean` | X | X |
| `textOffsetX` | `number` | X | X |
| `textInFront` | `boolean` | X | X |
| `scroll` | `ScrollObject` | X | X |
| `icon` | `string` | X | X |
| `iconMode` | `"fixed" \| "pushOnce" \| "push"` | X | X |
| `iconOffsetX` | `number` | X | X |
| `durationMs` | `number` | X | X |
| `backgroundColor` | `ColorInput` | X | X |
| `barChart` | `number[]` | X | X |
| `lineChart` | `number[]` | X | X |
| `chartAutoscale` | `boolean` | X | X |
| `chartColor` | `ColorInput \| "palette"` | X | X |
| `progress` | `number` | X | X |
| `progressColor` | `ColorInput \| "palette"` | X | X |
| `progressTrackColor` | `ColorInput` | X | X |
| `effect` | `string` | X | X |
| `effectSpeed` | `number` | X | X |
| `palette` | `string \| string[] \| null` | X | X |
| `paletteBlend` | `boolean` | X | X |
| `paletteSpan` | `number` | X | X |
| `paletteSpeed` | `number` | X | X |
| `overlay` | `string` | X | X |
| `draw` | `DrawCommand[]` | X | X |
| `name` | `string` | X |  |
| `hold` | `boolean` | X |  |
| `stack` | `boolean` | X |  |
| `wakeup` | `boolean` | X |  |
| `sound` | `string \| number` | X |  |
| `soundRtttl` | `string` | X |  |
| `soundLoop` | `boolean` | X |  |
| `lifetimeMs` | `number` |  | X |
| `lifetimeExpiry` | `"remove" \| "mark"` |  | X |
| `repeat` | `number` |  | X |

Nested object summaries:

| object | property | type |
|---|---|---|
| `TextFragment` | `text` | `string` |
| `TextFragment` | `color` | `ColorInput` |
| `ScrollObject` | `mode` | `"static" \| "wrap" \| "loop" \| "bounce"` |
| `ScrollObject` | `direction` | `"left" \| "right"` |
| `ScrollObject` | `entry` | `"inline" \| "offscreen"` |
| `ScrollObject` | `whenFits` | `"static" \| "scroll"` |
| `ScrollObject` | `speed` | `number` |
| `ScrollObject` | `gap` | `number` |
| `DrawCommand` | `dp` | `[x, y, color]` |
| `DrawCommand` | `dl` | `[x1, y1, x2, y2, color]` |
| `DrawCommand` | `dr` | `[x, y, w, h, color]` |
| `DrawCommand` | `df` | `[x, y, w, h, color]` |
| `DrawCommand` | `dc` | `[x, y, r, color]` |
| `DrawCommand` | `dfc` | `[x, y, r, color]` |
| `DrawCommand` | `dt` | `[x, y, text, color]` |
| `DrawCommand` | `db` | `[x, y, w, h, bitmap]` |

## Common page options

These fields are accepted by both notification/message JSON payloads and pushed app JSON payloads.

| Field | Type | Description / notes |
|---|---|---|
| `text` | `string` or `TextFragment[]` | Main text. Text fragments must use `{ "text": string, "color"?: ColorInput }`. Legacy `{ "t", "c" }` fragments are rejected. |
| `textCase` | `"inherit" \| "upper" \| "asTyped"` | Text casing mode. |
| `textColor` | `ColorInput \| "palette"` | Text color. Use `"palette"` together with `palette` for palette-based rendering. |
| `textBlinkMs` | `number` | Text blink interval in milliseconds. |
| `textFadeMs` | `number` | Text fade duration in milliseconds. |
| `textCenter` | `boolean` | Center text when applicable. |
| `textOffsetX` | `number` | Horizontal text offset. |
| `textInFront` | `boolean` | Draw text in front of decorations/effects where supported by AWTRIX NG. |
| `scroll` | `ScrollObject` | Scroll configuration object. String shorthand is not accepted by the Homey transformer; use an object. |
| `icon` | `string` | Icon ID/name or AWTRIX NG-supported inline icon value. Exact inline data URL compatibility is not guaranteed. |
| `iconMode` | `"fixed" \| "pushOnce" \| "push"` | Icon movement mode. |
| `iconOffsetX` | `number` | Horizontal icon offset. |
| `durationMs` | `number` | Page/notification duration in milliseconds. In regular Homey flows this is normally set via Homey's native Add duration option; in JSON-only flows use this field directly. |
| `backgroundColor` | `ColorInput` | Background color. |
| `barChart` | `number[]` | Bar chart values. |
| `lineChart` | `number[]` | Line chart values. |
| `chartAutoscale` | `boolean` | Enable chart autoscaling. |
| `chartColor` | `ColorInput \| "palette"` | Chart color. |
| `progress` | `number` | Progress value. AWTRIX NG handles value bounds according to its API. |
| `progressColor` | `ColorInput \| "palette"` | Progress foreground color. |
| `progressTrackColor` | `ColorInput` | Progress track/background color. |
| `effect` | `string` | AWTRIX NG effect name. Invalid effects are rejected by the device API. |
| `effectSpeed` | `number` | AWTRIX NG effect speed. |
| `palette` | `string \| string[] \| null` | Palette name, palette color array, or `null`. |
| `paletteBlend` | `boolean` | Enable palette blending. |
| `paletteSpan` | `number` | Palette span. |
| `paletteSpeed` | `number` | Palette animation speed. |
| `overlay` | `string` | Per-page overlay string. Use documented AWTRIX NG overlay names. `"clear"` semantics are UNKNOWN and not treated as AWTRIX 3 compatibility. |
| `draw` | `DrawCommand[]` | Low-level draw commands accepted by AWTRIX NG. |

### Text fragments

```json
{
  "text": [
    { "text": "Temp ", "color": "#FFFFFF" },
    { "text": "21°C", "color": "#00AAFF" }
  ]
}
```

Allowed text fragment fields:

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Fragment text. Required. |
| `color` | `ColorInput` | Optional fragment color. |

### Scroll object

`scroll` must be an object. AWTRIX 3-style `noScroll`, `scrollMode`, and `scrollSpeed` are not accepted.

| Field | Type | Description |
|---|---|---|
| `mode` | `"static" \| "wrap" \| "loop" \| "bounce"` | Scroll mode. |
| `direction` | `"left" \| "right"` | Scroll direction. |
| `entry` | `"inline" \| "offscreen"` | Entry behavior. |
| `whenFits` | `"static" \| "scroll"` | Behavior when content fits. |
| `speed` | `number` | Scroll speed. |
| `gap` | `number` | Gap between repeated content. |

Example:

```json
{
  "text": "Hello",
  "scroll": {
    "mode": "loop",
    "direction": "left",
    "entry": "inline",
    "whenFits": "static",
    "speed": 80,
    "gap": 8
  }
}
```

### Draw commands

`draw` is an array of AWTRIX NG draw command objects. Each command object must contain one supported command key.

| Command | Payload | Meaning |
|---|---|---|
| `dp` | `[x, y, color]` | Draw pixel. |
| `dl` | `[x1, y1, x2, y2, color]` | Draw line. |
| `dr` | `[x, y, w, h, color]` | Draw rectangle. |
| `df` | `[x, y, w, h, color]` | Draw filled rectangle. |
| `dc` | `[x, y, r, color]` | Draw circle. |
| `dfc` | `[x, y, r, color]` | Draw filled circle. |
| `dt` | `[x, y, text, color]` | Draw text. |
| `db` | `[x, y, w, h, bitmap]` | Draw bitmap. `bitmap` is a number array. |

Example:

```json
{
  "draw": [
    { "dp": [0, 0, "#FF0000"] },
    { "dl": [0, 7, 31, 7, "#00FF00"] },
    { "dt": [1, 1, "Hi", "#FFFFFF"] }
  ]
}
```

## Duration handling in Homey flows

There are two ways to set duration, depending on the flow type.

### Basic notification flow

The regular notification flow uses Homey's native **Add duration** option.

- If Homey duration is set, the app sends it to AWTRIX NG as `durationMs`.
- If Homey duration is not set, the app does not send `durationMs`.
- AWTRIX NG then uses its configured/default duration.

### Basic custom app flow

The regular custom app flow also uses Homey's native **Add duration** option.

Precedence is:

```text
Homey Add duration > JSON options durationMs > omitted
```

This means:

1. If Homey duration is set, it overrides `durationMs` from the JSON options field.
2. If Homey duration is not set, but JSON options contain `durationMs`, the JSON value is preserved.
3. If neither is set, `durationMs` is omitted and AWTRIX NG uses its default behavior.

### JSON-only flows

JSON-only notification and JSON-only pushed app flows do not have Homey-native duration mapping. Use the AWTRIX NG field `durationMs` directly in the JSON payload if a custom duration is needed.

## Message / notification JSON options

Message JSON payloads are sent to:

```http
POST /api/v1/notifications
```

They accept all common page options plus the notification-only fields below.

| Field | Type | Description / notes |
|---|---|---|
| `name` | `string` | Notification name. Useful for AWTRIX NG notification semantics. |
| `hold` | `boolean` | Keep the notification active until dismissed. Sticky notification flow forces this to `true`. |
| `stack` | `boolean` | AWTRIX NG stack behavior. |
| `wakeup` | `boolean` | Wake display/device behavior according to AWTRIX NG API. |
| `sound` | `string \| number` | AWTRIX NG sound reference. |
| `soundRtttl` | `string` | RTTTL sound embedded in the notification payload. |
| `soundLoop` | `boolean` | Loop notification sound. |

Notification JSON does not support pushed-app-only fields:

- `lifetimeMs`,
- `lifetimeExpiry`,
- `repeat`.

Example:

```json
{
  "text": "Doorbell",
  "textColor": "#FF0000",
  "icon": "1234",
  "iconMode": "pushOnce",
  "durationMs": 5000,
  "stack": true,
  "wakeup": true,
  "soundRtttl": "beep:d=4,o=5,b=120:c",
  "soundLoop": false
}
```

Sticky notification example:

```json
{
  "text": "Window open",
  "textColor": "#FFAA00",
  "hold": true
}
```

## App / pushed app JSON options

Pushed app JSON payloads are sent to:

```http
PUT /api/v1/apps/pushed/{name}
```

The app name is not part of the JSON payload. In Homey flows the user enters the app name separately. The app internally sends it as `homey-<user_app_name>`.

User app name rules:

- allowed pattern: `^[A-Za-z0-9_-]{1,26}$`,
- no automatic sanitizing or slugifying,
- spaces, colons, diacritics, and longer names are rejected.

Pushed app JSON accepts all common page options plus the app-only fields below.

| Field | Type | Description / notes |
|---|---|---|
| `lifetimeMs` | `number` | Pushed app lifetime in milliseconds. |
| `lifetimeExpiry` | `"remove" \| "mark"` | What AWTRIX NG should do when lifetime expires. |
| `repeat` | `number` | Repeat count for pushed apps. This is app-only; notification JSON rejects it. |

Pushed app JSON does not support notification-only fields:

- `name`,
- `hold`,
- `stack`,
- `wakeup`,
- `sound`,
- `soundRtttl`,
- `soundLoop`.

Array/multi-object pushed app payloads are not supported by this Homey app.

Example:

```json
{
  "text": "21°C",
  "textColor": "#00AAFF",
  "icon": "2422",
  "iconMode": "push",
  "durationMs": 7000,
  "repeat": 3,
  "lifetimeMs": 60000,
  "lifetimeExpiry": "mark",
  "scroll": {
    "mode": "loop",
    "speed": 80
  }
}
```

## Explicitly rejected legacy AWTRIX 3 fields

The AWTRIX NG JSON flows do not accept AWTRIX 3 option names. Use the AWTRIX NG field names listed above instead.

| Legacy AWTRIX 3 field | Use / status in AWTRIX NG JSON |
|---|---|
| `background` | Use `backgroundColor`. |
| `bar` | Use `barChart`. |
| `blinkText` | Use `textBlinkMs`. |
| `center` | Use `textCenter`. |
| `color` | Use `textColor`. |
| `duration` | Use `durationMs`; no automatic seconds-to-milliseconds conversion. |
| `effectSettings` | Use `effectSpeed`, `palette`, and/or `paletteBlend`. |
| `fadeText` | Use `textFadeMs`. |
| `gradient` | Use AWTRIX NG `palette` plus `textColor: "palette"` if appropriate. |
| `lifetime` | Use `lifetimeMs`. |
| `lifetimeMode` | Use `lifetimeExpiry`. |
| `line` | Use `lineChart`. |
| `loopSound` | Use `soundLoop`. |
| `noScroll` | Use the `scroll` object. |
| `progressBC` | Use `progressTrackColor`. |
| `progressC` | Use `progressColor`. |
| `pushIcon` | Use `iconMode`. |
| `rainbow` | Use AWTRIX NG `palette` plus `textColor: "palette"` if appropriate. |
| `rtttl` | Use `soundRtttl` for notification JSON or the dedicated RTTTL flow. |
| `scrollMode` | Use `scroll.mode`. |
| `scrollSpeed` | Use `scroll.speed`. |
| `textOffset` | Use `textOffsetX`. |
| `topText` | Use `textInFront`. |
| `barBC` | Unsupported / UNKNOWN; no documented AWTRIX NG equivalent. |
| `clients` | Unsupported; no documented AWTRIX NG equivalent. |
| `pos` | Unsupported in pushed app payloads; app order is a separate AWTRIX NG concept. |
| `save` | Unsupported; AWTRIX NG pushed app lifecycle is different from AWTRIX 3 custom app save semantics. |
