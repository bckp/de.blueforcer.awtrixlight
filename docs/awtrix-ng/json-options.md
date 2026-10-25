# AWTRIX NG JSON options

These fields apply to the Homey NG notification and pushed-app JSON cards. Use one
JSON object with case-sensitive NG field names. Unknown fields, AWTRIX 3 aliases
and pushed-app arrays are rejected. The RAW HTTP card sends valid JSON unchanged
and does not use this field validation.

## Colors and text

`ColorInput` accepts a color string such as `"#FF0000"`, a number, an RGB tuple
`[255,0,0]`, or an HSV tuple `["HSV",120,255,255]`. Fields marked with `palette`
also accept the string `"palette"`.

Text is a string or an array of fragments. Each fragment has required `text` and
optional `color`. Legacy fragments with `t` and `c` are rejected.

```json
{"text":[{"text":"Temp ","color":"#FFFFFF"},{"text":"21 C","color":"#00AAFF"}]}
```

## Common page fields

Both notifications and pushed apps accept these fields.

| Field | Type | Meaning |
|---|---|---|
| `text` | String or fragment array | Main text. |
| `layout` | Object | Region layout; see [layouts](#layouts). |
| `textCase` | `inherit`, `upper`, `asTyped` | Text casing. |
| `font` | String | `small`, `large`, or a font advertised by the clock. |
| `textColor` | ColorInput or `palette` | Text color. |
| `textBlinkMs`, `textFadeMs` | Number | Blink interval or fade time in milliseconds. |
| `textAlign` | `start`, `center`, `end` | Still-text alignment; firmware 1.1.7+. |
| `textCenter` | Boolean | Compatibility input: center/start on 1.1.7+, sent unchanged on older firmware. |
| `textOffsetX` | Number | Horizontal text offset; integer for pushed apps. |
| `textInFront` | Boolean | Text in front of decorations and effects. |
| `scroll` | Object | [Scroll options](#scroll). Top-level string shorthand is rejected. |
| `icon` | String | Icon name or inline image supported by the firmware. HTTP(S) image URLs require TC002. |
| `iconMode` | `fixed`, `pushOnce`, `push` | Icon movement. |
| `iconOffsetX` | Number | Horizontal icon offset. |
| `iconGap` | Integer 0–128 | Gap between icon and text; firmware 1.1.2+. |
| `icons` | Array of `{icon, x?, y?}` | Up to four icons; integer coordinates −65535…65535; firmware 1.1.2+. |
| `durationMs` | Number | Display duration in milliseconds. |
| `repeat` | Number | Completed scrolling-text passes. Use a non-negative integer; zero disables waiting for passes. |
| `backgroundColor` | ColorInput | Background color. |
| `barChart`, `lineChart` | Number array | Chart values. |
| `chartAutoscale` | Boolean | Automatic chart scaling. |
| `chartColor` | ColorInput or `palette` | Chart color. |
| `progress` | Number | Progress value. |
| `progressColor` | ColorInput or `palette` | Progress foreground. |
| `progressTrackColor` | ColorInput | Progress background. |
| `effect` | String | Firmware effect name. |
| `effectSpeed` | Number | Effect speed. |
| `palette` | Name, color array, stop array or `null` | 1–16 colors or `{color, pos}` stops. Stop positions are 0–100; do not mix plain colors and stops. |
| `paletteBlend` | Boolean | Palette blending. |
| `paletteSpan`, `paletteSpeed` | Number | Palette span and animation speed. |
| `overlay` | String | Firmware overlay name. |
| `draw` | Command array | [Draw commands](#draw). |

Do not combine `textCenter` and `textAlign`. Scrolling text does not use
`textAlign`. New fields require the listed firmware version and current device
support; the app does not remove unsupported fields.

## Scroll

| Field | Values |
|---|---|
| `mode` | `static`, `wrap`, `loop`, `bounce`. |
| `direction` | `left`, `right`. |
| `entry` | `inline`, `offscreen`. |
| `whenFits` | `static`, `scroll`. |
| `speed` | Non-negative integer. |
| `gap` | Non-negative integer. |
| `holdMs` | Non-negative integer pause in milliseconds, including bounce turning points. |

```json
{
  "text": "Hello",
  "scroll": {"mode":"loop","direction":"left","entry":"inline","whenFits":"static","speed":80,"gap":8,"holdMs":1000}
}
```

## Timing

| Card | Duration rule |
|---|---|
| Regular notification | Homey **Add duration**, otherwise the clock default. |
| Regular pushed app | Homey **Add duration** overrides JSON `durationMs`; otherwise JSON or the clock default. |
| RAW JSON notification/app | Set `durationMs` in JSON. |
| Title-and-text preset | Use Homey **Add duration** or JSON `durationMs`, not both. |

`repeat` counts completed scroll passes. Still text ignores the pass count.
An explicit duration sets a minimum time when combined with `repeat`.
`durationMs` zero or less uses the clock default. A zero scroll speed cannot
complete a pass. `hold: true` keeps a notification until it is dismissed.

## Notifications

Notifications use `POST /api/v1/notifications`. They accept the common fields plus:

| Field | Type | Meaning |
|---|---|---|
| `name` | String | Name for later dismissal. `active` is reserved. |
| `hold` | Boolean | Keep until dismissed. The sticky card forces `true`. |
| `stack` | Boolean | Firmware notification queue behavior. |
| `wakeup` | Boolean | Wake the display. |
| `sound` | String, number, sound object or list | Sound source. Objects/lists require the new audio API. |
| `soundRtttl` | String | Embedded RTTTL melody. |
| `soundLoop` | Boolean | Repeat the notification sound. |

```json
{
  "name": "doorbell",
  "text": "Doorbell",
  "textColor": "#FF0000",
  "durationMs": 5000,
  "stack": true,
  "wakeup": true,
  "soundRtttl": "beep:d=4,o=5,b=120:c",
  "soundLoop": false
}
```

Use **Dismiss a named notification** to remove an exact name from the active slot
or queue. Empty names and the URL dot segments `.` and `..` are rejected. A missing
notification returns the firmware's 404 error. The active-notification dismissal
card is a separate operation.

### Sound objects

A sound object has one source and an optional boolean `loop`:

| Source | Value |
|---|---|
| `file` | Stored sound name, `Script/name`, or an MP3 URL supported by the clock. |
| `rtttl` | RTTTL melody text. |
| `song` | Synthesizer song text. |
| `speech` | Text, 1–512 UTF-8 bytes. Requires a voice. |
| `track` | Integer 1–2999, where the clock supports tracks. |

A fallback list contains 1–4 names or sound objects. Firmware plays the first
usable entry. A single source requires its matching audio capability.

```json
{"text":"Door open","sound":[{"speech":"The front door is open."},"ding"]}
```

Use the radio cards for stations. The sound `station` source is not available in
notifications or fallback lists. `nextBar` belongs to looping songs in clock
scripts, not HTTP notifications. Conflicting `sound`/`soundRtttl` or loop settings
are rejected. The NG facade adapts numeric `sound`, `soundRtttl` and `soundLoop`
to the new audio schema; older audio APIs do not accept sound objects or lists.

## Pushed apps

Pushed apps use `PUT /api/v1/apps/pushed/{name}`. Enter the app name separately in
Homey, without `homey-`. Names must match `^[A-Za-z0-9_-]{1,26}$`. Homey sends
`homey-<name>` to the clock. Names are not shortened or rewritten.

Pushed apps accept the common fields plus:

| Field | Type | Meaning |
|---|---|---|
| `lifetimeMs` | Number | App lifetime in milliseconds. |
| `lifetimeExpiry` | `remove`, `mark` | Action after lifetime expiry. |

Notification-only fields are rejected in pushed apps. Lifetime fields are rejected
in notifications. Both targets accept `repeat`.

```json
{
  "text": "21 C",
  "textColor": "#00AAFF",
  "durationMs": 7000,
  "repeat": 3,
  "lifetimeMs": 60000,
  "lifetimeExpiry": "mark",
  "scroll": {"mode":"loop","speed":80}
}
```

## Layouts

Use `layout` for custom regions on any NG panel that advertises
`capabilities.layouts.version: 1`. Every region must fit the reported display size.
The app checks current fonts, effects, overlays, named palettes and layout limits
before each write. Firmware checks memory and image decoding.

The layout accepts `version`, `regions`, `backgroundColor`, `effect`, `effectSpeed`,
`overlay`, `palette`, `paletteBlend`, `paletteSpan` and `paletteSpeed`.
`backgroundColor` conflicts with `effect`. Palette modifiers require a palette in
the same object.

Each region needs a unique `id` of at most 64 UTF-8 bytes, a `box` of
`[x,y,width,height]`, and exactly one content field:

| Content | Region options |
|---|---|
| `text`: string or fragment array | `font`, `color` or `textColor`, palette options, `align`, `valign`, `scroll`, `repeat`, `textCase`, `textBlinkMs`, `textFadeMs`. |
| `icon`: icon reference | `align`, `valign`. |
| `chart`: `{values, type?, min?, max?}` | Integer values; type `line` or `bar`; both range bounds when either is set; region color and palette options. |
| `progress`: number 0–100 | Region color, palette options and `trackColor`. |
| `draw`: command array | Region color and `font`; coordinates are relative to the region. |

Alignment values are `start`, `center`, `end`. Region scroll accepts a mode string
or the [scroll object](#scroll). Top-level scroll accepts an object only.
Unknown nested fields and duplicate region IDs are rejected.

Move all visual page fields inside `layout`. Only `durationMs`, `repeat` and the
target's notification or app lifetime fields stay outside it. Layouts are sent
directly, without uploading a file or resizing them.

Example for a 52 × 16 panel:

```json
{
  "durationMs": 10000,
  "layout": {
    "version": 1,
    "regions": [
      {"id":"header","box":[0,0,52,8],"text":"OUTSIDE","font":"small","color":"#00AAFF","scroll":"static"},
      {"id":"value","box":[0,8,52,8],"text":"21 C","font":"small","scroll":{"mode":"loop"}}
    ]
  }
}
```

A 32 × 8 panel needs its own region geometry. The app rejects the example above
on that panel.

## Preset card options

The [title-and-text cards](README.md#title-and-text-cards) have fixed visual fields.
Their optional JSON must be an object. An empty input or `{}` adds no options.

| Both cards | Notification only | Pushed app only |
|---|---|---|
| `durationMs`, `repeat` | `name`, `hold`, `stack`, `wakeup`, `sound`, `soundRtttl`, `soundLoop` | `lifetimeMs`, `lifetimeExpiry` |

All other options, including `layout`, `text`, `icon`, `color`, `font` and `scroll`,
are rejected. Use the card's own arguments or a RAW JSON card for visual changes.

- `durationMs` must be an integer. Zero or less uses the clock default.
- `repeat` must be a non-negative integer. Zero disables waiting for scroll passes.
- With no timing options, the preset sends `repeat: 1`.
- Homey **Add duration** and JSON `durationMs` cannot be combined.
- An explicit duration and `repeat` are both kept; duration sets the minimum time.

Example of a named, held notification:

```json
{"name":"window-open","hold":true,"stack":false,"wakeup":true}
```

## Draw

`draw` is an array of command arrays. The command name is first; coordinates and
sizes are integers. Optional colors inherit the page text color. Firmware clips
pixels outside the canvas. AWTRIX 3 object commands such as `{"dp":[...]}` are
rejected.

| Command | Format |
|---|---|
| Pixel | `["pixel", x, y, color?]` |
| Pixels | `["pixels", colorOrNull, x1, y1, ...]` |
| Line | `["line", x1, y1, x2, y2, color?]` |
| Rectangle | `["rect", x, y, w, h, color?]` |
| Filled rectangle | `["rectFill", x, y, w, h, color?]` |
| Circle | `["circle", cx, cy, radius, color?]` |
| Filled circle | `["circleFill", cx, cy, radius, color?]` |
| Text | `["text", x, y, text, color?]` |
| Bitmap | `["bitmap", x, y, w, h, data]`; color array or base64 RGB888. |

## Rejected AWTRIX 3 fields

Use the NG field explicitly. Similar field names do not guarantee identical rendering.

| AWTRIX 3 field | NG field or status |
|---|---|
| `background` | `backgroundColor`. |
| `bar` | `barChart`. |
| `blinkText` | `textBlinkMs`. |
| `center` | `textAlign` or the supported `textCenter` compatibility input. |
| `color` | `textColor`. |
| `duration` | `durationMs`; convert seconds to milliseconds yourself. |
| `effectSettings` | `effectSpeed`, `palette`, `paletteBlend`. |
| `fadeText` | `textFadeMs`. |
| `gradient`, `rainbow` | NG palette options and `textColor: "palette"`. |
| `lifetime` | `lifetimeMs`. |
| `lifetimeMode` | `lifetimeExpiry`. |
| `line` | `lineChart`. |
| `loopSound` | `soundLoop`. |
| `noScroll`, `scrollMode` | `scroll.mode` in an object. |
| `progressBC` | `progressTrackColor`. |
| `progressC` | `progressColor`. |
| `pushIcon` | `iconMode`. |
| `rtttl` | `soundRtttl` or the RTTTL card. |
| `scrollSpeed` | `scroll.speed`. |
| `textOffset` | `textOffsetX`. |
| `topText` | `textInFront`. |
| `barBC`, `clients` | No supported equivalent. |
| `pos` | Not part of pushed app JSON; rotation order is separate. |
| `save` | Not supported. |

[AWTRIX NG guide](README.md) · [API references](../README.md#api-references)
