# AWTRIX NG guide

Use the **Awtrix NG** driver for TC002 and other clocks running AWTRIX NG.
Use **Awtrix3** for AWTRIX 3. Devices, settings and JSON payloads use separate
formats. There is no automatic migration between the drivers.

| Item | AWTRIX 3 | AWTRIX NG |
|---|---|---|
| Driver | `awtrixlight` | `awtrixng` |
| Discovery | `_awtrix._tcp` | `_awtrixng._tcp`, TXT `type=awtrixng` |
| API | `/api/*` | `/api/v1/*` |
| Homey app name on the clock | `homey:<name>` | `homey-<name>` |

## Add a clock

1. Install the matching AWTRIX firmware and connect the clock to your network.
2. In Homey, add a device from the AWTRIX app and select **Awtrix NG**.
3. Select the discovered clock, or choose **Add manually** and enter its host and port.
4. If the clock requires HTTP Basic authentication, enter both username and password.

Homey verifies the clock through `GET /api/v1/device`. Its `uid` must match the
paired device ID, including after rediscovery or an address change. Failed checks
leave the active connection unchanged. Host, port and credentials are stored in
Homey; they do not change the clock's own network or login settings.

## Display and notifications

The shared Flow cards provide notifications, sticky notifications, display power,
indicators, weather overlays, RTTTL melodies and pushed apps. JSON cards accept
[NG fields](json-options.md) only. Buttons on the Homey device select the next or
previous app.

- Set a notification's duration with Homey's **Add duration** option. Without it,
  the clock uses its default duration.
- A sticky notification stays active until dismissed.
- **Dismiss a named notification** removes the exact `name`, including a queued
  notification. A missing name returns an error. Use the active-notification card
  for the reserved name `active`.
- Enter pushed app names without the `homey-` prefix. Use 1–26 letters, digits,
  underscores or hyphens. For example, `weather` is stored as `homey-weather`.
- Creating or updating a pushed app adds it to the rotation; it does not select it
  for immediate display. App lifetime and display duration are separate options.
- Icons come from the selected clock. The `-` choice removes an optional icon.

## Settings and sensors

| Control | Behavior |
|---|---|
| Brightness | 0–100%, mapped to 0–255 on the clock. Manual changes disable automatic brightness where supported. Display power stays separate. |
| Automatic brightness | Requires a light sensor. TC002 does not support it. |
| Image settings | Saturation 0–100, positive gamma, color correction and tint. Colors use `#RRGGBB`; an empty correction or tint clears it. Black is valid. |
| Rotation and text | Automatic transitions, transition effect, navigation lock and uppercase text. |
| Built-in apps | Time, date, temperature, humidity and battery switches, where the clock provides those apps. |
| Weather overlay | `none`, `drizzle`, `frost`, `rain`, `snow`, `storm`, `thunder`. `none` sends `overlay: null`. |

Settings and capabilities refresh every minute. Built-in app preferences are read
from the clock during initial setup and reapplied after a firmware version change.
Writes preserve the other apps and their order. An unavailable built-in app cannot
be enabled through its switch.

Available sensors appear at pairing or init: battery percentage, temperature and
humidity. Polling updates existing capabilities. `lightLevel`, `pressureHpa` and
`lowBattery` are not mapped to Homey measurements or alarms.

## Title-and-text cards

The notification and pushed-app title-and-text cards use a fixed 52 × 16 layout.
They require layout version 1 and the 16-pixel display capability.

| Region | With an icon | Without an icon |
|---|---|---|
| Icon | `[0,0,16,16]` | Omitted. |
| Title | `[17,0,35,8]` | `[0,0,52,8]` |
| Text | `[17,8,35,8]` | `[0,8,52,8]` |

Both rows use the `small` font. The title is centered and defaults to blue
`#00AAFF`; its color can be changed. Body text is white. Empty rows are valid.
Short rows stay still. Long rows scroll independently at the clock's scroll
settings. Icons are centered in their region without scaling.

Without a duration or repeat option, the card waits for one complete scroll of
both rows. Still text uses the clock's default duration. With scroll speed zero,
a scrolling pass never finishes; use an explicit duration with `repeat: 0` to
limit display time.

JSON options on these preset cards accept timing and notification or app lifetime
fields only. See [preset options](json-options.md#preset-card-options). Use RAW
JSON for custom fonts, body colors, geometry or a 32 × 8 layout.

## Scripts

Install scripts through the clock's web UI or AWTRIX Hub. Homey controls scripts
that are already installed. Use the script's native name, without `homey-`.

| Flow section | Card | Behavior |
|---|---|---|
| Then | Show an installed script | Selects a working, enabled display script, including on-demand scripts. Next/previous app ends an on-demand script. |
| Then | Enable an installed script | Enables it and keeps its rotation position. Use Show afterwards to display it immediately. |
| Then | Disable an installed script | Stops it, including background work and HTTP/MQTT callbacks. Files and stored data remain. |
| And | A script is / is not enabled | Reads its current `enabled` flag from the clock. Supports Homey's condition inversion. |
| Then | Set / read a script setting | Uses the script's declared settings and current schema. |
| Then | Change / read stored data | Changes selected keys or reads one existing key. |
| Then | Read a shared script value | Reads an available `owner.key` value. |

Enable, disable, condition and settings/data cards include disabled, broken and
background scripts. Show excludes these scripts, modules and scripts for a different
panel. Missing scripts, disabled scripting and connection failures return errors.
The condition checks whether a script is enabled, not whether it is on screen.
The enable state survives a clock reboot.

Setting values use plain text for text/select, numbers for number/slider, `true`
or `false` for booleans, and `#RRGGBB` or an integer for colors. Bounds are checked;
text `maxlen` is measured in UTF-8 bytes. A data patch is a non-empty JSON object,
such as `{"counter":0,"old":null}`. Only named keys change; `null` removes a key.
Use the settings card for declared settings.

Saving settings or data restarts the script. A restart failure is reported even if
the values were saved. Read cards return a text **Value** token in Advanced Flow.
Strings stay as text; other values use JSON. Zero, `false` and empty text are
preserved. Missing keys and shared values return errors.

Per-script switching uses `PUT /api/v1/apps/{name}/enabled` with a JSON boolean.
Release 1.2.2 supports this endpoint. Its earliest firmware version is not specified in the
[upstream contract](https://github.com/Blueforcer/awtrix-ng/blob/40985fe6c93530bc9323fdb758fae8ce34d4b03f/docs/reference/http.md#put-apiv1appsnameenabled).
Unsupported firmware returns its own HTTP error. A `507` response means the change
applied but was not saved for the next reboot.

## Audio

Audio cards depend on the clock's reported capabilities. Master and group volumes
are integer percentages from 0 to 100. The output level is master × group / 100.
Zero mutes that group. A new alert replaces the current alert.

| Card | Input and completion |
|---|---|
| Read text aloud | Non-empty text, up to 512 UTF-8 bytes. Requires an installed voice. Finishes when the playback request is accepted. |
| Play stored sound | Select an MP3 from the clock's `/MP3` directory. Plays once as an alert and finishes when accepted. |
| Play synthesized sound | Song text on the new audio API; an `fx` effect on older firmware. |
| Play MP3 from URL / Soundboard | The clock fetches an MP3, up to 4 MB. The action waits for playback to end, with a 120-second app timeout. |
| Send and play audio from URL / Soundboard | Homey sends MP3 or 16-bit PCM WAV, up to 2 MiB. No stored copy. Finishes when playback starts. |
| Play radio station / URL | A saved station or MP3 stream; M3U/PLS playlists are supported. Plays until stopped. |
| Save radio station | Adds or replaces one exact station name. Keeps the others, up to 32 stations. |
| Stop audio | Stops alert, app, radio or all groups. Alert/all also cancels pending URL or clip work. |

The stored-sound picker reloads the MP3 list on every search. It sends the name
without `.mp3`. Existing Flow values stored as text, including `Script/name`,
remain accepted. Script-directory sounds are not listed in the picker.

Soundboard must be installed and its files must be reachable through Homey's local
address. URL playback accepts MP3 only; direct sending also accepts PCM WAV. After
deleting and re-uploading a Soundboard file, select it again in the Flow.

URL actions report download and playback errors, replacement by another alert and
cancellation. Concurrent URL actions on the same clock are rejected. The app's
120-second timeout is not a documented Homey core timeout. The API cannot identify
two external playbacks of the same URL as separate sessions.

Radio starts after an immediate error check. Later playback errors can be observed
with the state Flow triggers. Saving stations is serialized within this app;
simultaneous edits in the clock's web UI are not locked.

## Buttons and knob

Enable **Miscellaneous → Enable button callbacks** in the Homey device settings.
The default is off. Enabling requires detected firmware 1.1.1 or newer and a local
HTTP connection from the clock to Homey.

Button cards trigger on press, not release. The knob offers press and signed turn
events on supported clocks: negative means left and positive means right. Normal
clock navigation remains active unless blocked in settings. Scripts may handle
knob events themselves.

Homey writes its callback only when the clock's callback is empty or already owned
by this device. A different callback causes a conflict. Disabling or deleting a
Homey device clears only its own callback. Enabled callbacks are checked at startup
and after connection changes; failures appear as warnings.

The callback URL contains a device token and travels over local HTTP. Keep it
private. If the token is lost, disable the integration, clear `buttonCallback` in
the clock's system configuration, then enable the integration again.

## Messages from scripts

The **Message received** device trigger receives an event from a Berry script.
It provides two text tokens: **Event** and **Data**. Data contains serialized JSON;
parse it with HomeyScript or another tool if needed.

Send `POST /api/app/de.blueforcer.awtrixlight/awtrixng/message/<clock-uid>` to
Homey's local address, with `Content-Type: application/json` and this body:

```json
{"event":"washing_done","data":{"program":"cotton","minutes":65}}
```

Use the AWTRIX `uid` that was paired with Homey. Only that device's Flows fire.
`event` must be non-empty text, up to 128 UTF-8 bytes. `data` is required and may
contain any JSON value, including `null`, `false`, zero, arrays and empty strings.
The message accepts only these two fields and is limited to 16 KiB of UTF-8 JSON.

The endpoint uses [Homey's standard API authentication](https://apps.developer.homey.app/advanced/web-api).
Supply a Homey API key with access to this app in `Authorization: Bearer <key>`.
Create the key in Homey's API Keys settings where supported; it is not an AWTRIX
device credential. No token or extra setting is stored by this app. Keep the key
private and use HTTPS where available.

In Berry, send the request from an event handler or `loop()`, not `draw()`:

```berry
import json

http.post("http://HOMEY/api/app/de.blueforcer.awtrixlight/awtrixng/message/CLOCK_UID",
          json.dump({'event': "washing_done", 'data': {'program': "cotton", 'minutes': 65}}),
          / body, status -> print(status),
          {'headers': {'Content-Type': "application/json",
                       'Authorization': "Bearer HOMEY_API_KEY"}})
```

Replace the address, clock UID and API key. Berry's
[HTTP methods](https://github.com/Blueforcer/awtrix-ng/blob/40985fe6c93530bc9323fdb758fae8ce34d4b03f/docs/guides/scripting/network.md#methods-headers-and-a-request-body)
return immediately and deliver the HTTP status to the callback.

A successful request returns `{"ok":true}` after submitting the trigger. It does
not wait for the user's Flow to finish. Invalid messages and unknown devices fail
the request. There is no stored message history or automatic retry; sending the
same message again triggers another event. The app does not parse Data into extra
Flow tokens or add JSON-reading action cards.

## State Flow triggers

| Trigger | Output tokens |
|---|---|
| Active application changed | `application`, `previous` (text). |
| Audio playback changed | `group`, `name`, `previous_name` (text); `playing`, `previous_playing` (boolean). Groups: `alert`, `app`. |
| Radio playback changed | `station`, `title`, `previous_station` (text); `playing`, `previous_playing` (boolean). |
| New playback error | `group`, `error` (text). Supported audio groups only. |

These triggers check the clock every 5 seconds while at least one of their cards
is used. They do not report every event: changes between checks can be missed.
Initial reads and reads after reconnection or a detected hardware restart establish
a baseline without firing a Flow.

Application names include `homey-` for Homey pushed apps. Notifications do not change
the active app. During a transition, the firmware may still report the outgoing app.
Audio names may remain after stop; use `playing` to check playback.

A persistent playback error is reported once. Clearing it allows the same error to
be reported again. HTTP connection failures reset observation and go to diagnostics;
they are not playback-error events. A process restart without an observed outage
or uptime reset may not be detected.

## RAW HTTP card

**Send an API request** uses the selected clock's connection and credentials. Enter
a relative `/api/v1/` endpoint, a method and optional JSON. For example:

| Argument | Value |
|---|---|
| Method | `POST` |
| Endpoint | `/api/v1/audio/play` |
| JSON | `{"file":"ding"}` |

Allowed methods are GET, POST, PUT, PATCH and DELETE. GET has no body. Empty JSON
means no body. Other JSON is checked for valid syntax and sent unchanged. Absolute
URLs, paths outside the API, binary bodies and multipart uploads are rejected.

Advanced Flow output tokens are `status` (number) and `response` (text). HTTP errors
fail the card and preserve the firmware details. Responses are limited to 8 MiB.

RAW responses and firmware errors are not redacted and may contain credentials or
callback tokens. RAW system writes bypass managed callback ownership checks. Do not
share these outputs. RAW debug logs redact the endpoint, query, headers, body and
error details; they retain the method and HTTP status.

## Compatibility and limits

| Feature | Requirement or limit |
|---|---|
| RTTTL card | Firmware 1.1.0 or newer. |
| Button callback activation | Firmware 1.1.1 or newer. Disabling remains available on older firmware. |
| `icons`, `iconGap` | Firmware 1.1.2 or newer. |
| `textAlign` | App requires firmware 1.1.7 or newer. |
| Layouts and named fonts | Current capabilities, display dimensions and reported limits. |
| Internet image URLs | TC002 only. |

Feature markers are added at pairing or init; polling does not add them. Homey's
Flow picker may not refresh capability filters for an existing device. RAW JSON
cards still check the clock's current capabilities when they run.

Pushed app arrays, automatic AWTRIX 3 JSON conversion, dedicated clockface controls,
moodlight controls and overlay speed/palette/blend settings are not provided.
Exact cross-firmware rendering, inline image data URL formats and an NG equivalent
of `overlay: "clear"` are unverified. Use the NG fields and formats documented for
your firmware.

[JSON options](json-options.md) · [Development rules](../development.md) ·
[API references](../README.md#api-references)
