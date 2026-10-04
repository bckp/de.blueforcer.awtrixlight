# TC002 in AWTRIX NG: findings, implementation and follow-ups

Status: implementation notes, updated 2026-10-03. TC002 stays in the AWTRIX NG driver.

Update 2026-10-05: these notes preserve the beta investigation and physical 1.1.6 tests. Current 1.2.0 readiness and subsequent changes are in [firmware 1.2.0 readiness](09-firmware-1.2.0-readiness.md). In particular, the earlier uncertainty about `icons`/`iconGap` is resolved: the app now supports them from 1.1.2. Text alignment and installed script selection are covered by the new snapshot; no physical 1.2.0 test is implied here.

## Mixer, radio, clips and flat JSON extensions (2026-10-03)

- Owner-approved scope: mixer, internet radio, group stops, sending transient files
  and extending JSON only where supported. App selection, script integration and
  moodlight remain outside this change. No shared driver interface changes.
- Mixer UI: master/alert/app sliders, and radio slider only on radio-capable
  hardware. All are integer percentages, including zero. A Flow card writes one
  level. Init reads levels; the existing minute poll follows knob/web UI changes.
- New markers: `awtrixng_audio_mixer`, `awtrixng_audio_groups`,
  `awtrixng_audio_radio`, `awtrixng_audio_clip`. The live new API has no `mixer`
  flag: group audio uses its explicit boolean `song`/`rtttl` schema and active
  audio outputs; the mixer additionally validates all four settings. Radio and
  clips use their own flags. Existing 1.1.6+ devices gain markers on app startup.
- Radio cards select a saved station by name, play a stream URL, or save/update
  one station while keeping the rest. Writes from one facade are serialized;
  external web UI edits cannot be locked because station writes replace the list.
  The play action checks the immediate radio error. Future network outages remain
  in device audio state; no new Homey trigger claims to monitor them.
- Group stop supports alert, app, radio and all. Existing alert-stop card remains
  compatible. Stopping alert/all cancels prepared URL playback and clip downloads.
- Clip cards let Homey fetch a URL or freshly resolve a Soundboard MP3/WAV, then
  POST bytes to `/api/v1/audio/clip`. Limit 2 MiB, bounded streaming download,
  30-second download timeout, no filesystem storage. The action completes when
  firmware starts playback; the native URL card still waits for playback to end.
- JSON accepts `iconGap` (0–128), `icons` (at most four with integer coordinates)
  and named fonts advertised by the device. No dedicated capability advertises
  icon gap/multiple icons, so these fields conservatively require the verified
  firmware 1.1.6 contract or newer. Earlier-version support is UNKNOWN. This is
  a protocol gate, independent of display dimensions. Internet image URLs require
  the documented TC002 platform, also in layout regions. Unsupported fields fail
  explicitly; flat visual keys still cannot be combined with layout.
- Notification sound JSON additionally accepts `station` with radio capability;
  station is forbidden in fallback lists and with looping options. Speech length
  is validated as UTF-8 bytes (1–512). Dedicated TTS Flow is outside this scope.
- Live physical TC002 1.1.6: started idle; master temporarily set to zero, alert
  changed to 47; direct silent WAV and Homey-style fetch/send WAV both returned
  success. All four stop requests succeeded. The documented SWR3 stream reported
  `radio.playing: true` with an empty error, then false after radio stop. No
  station was saved. All original mixer levels were restored and checked equal.
- Live flat JSON: Matrix font, icon gap and extra icon accepted by the physical
  device; display read returned 52×16 with rendered pixels. The test notification
  expired after 2.5 seconds. This confirms acceptance/rendering, not a visual
  comparison of every font or icon position.
- Sources: [HTTP audio API](https://ang.blueforcer.de/reference/http/#audio),
  [mixer settings](https://ang.blueforcer.de/reference/settings/#sound),
  [payload reference](https://ang.blueforcer.de/reference/payload/).

## Layouts and header cards (2026-10-03)

- The owner proposed a simple TC002 card with icon, header and text, plus custom
  layout JSON. The assumption that layouts are exclusive to TC002 is disproved by
  the [firmware guide](https://ang.blueforcer.de/guides/layouts/), which includes
  32×8 examples. Actual TC001 hardware has not been tested during this work.
- A fresh read of the physical TC002 1.1.6 reports a 52×16 display,
  `layouts.version: 1`, limits of 16 regions / 8 scrollers / 4 icon assets / 128
  chart points / 8192 text bytes, and 12 named fonts. This is separate evidence
  from the documentation.
- Pairing now probes capabilities for every NG board and records `awtrixng_layout`
  when version 1 is explicitly advertised. The template Flow cards require both
  this marker and the independently established `awtrixng_display_16px` marker.
  Existing devices are not silently assigned new feature markers during polling.
- Implemented `awtrixng_notification_header` and `awtrixng_application_header`:
  optional 16×16 icon at `[0,0,16,16]`, blue header at `[17,0,35,8]`, white text at
  `[17,8,35,8]`; without the icon each text band spans 52 pixels. Both rows use
  `small` and independent loop scrolling. With no explicit duration, the template
  sends `repeat: 1` so all scrolling rows finish once. An explicit Homey Add duration
  sends only `durationMs`; static text keeps the firmware default timing when no
  duration is specified. The optional question about notification/app preference
  had no answer during implementation, so both variants were prepared.
- Existing raw JSON cards accept layout version 1, including all five region
  content types. Unknown fields, duplicate IDs, invalid boxes, content conflicts
  and mixing layout with top-level visual fields are rejected with nested field
  paths. Before each write the facade checks current display size, named fonts,
  effects, overlays, palettes and advertised count/text limits. It never drops
  unsupported fields or scales a layout. Firmware remains responsible for icon
  decoding and prepared-memory budget; API errors propagate unchanged.
- Live verification through the compiled facade succeeded: a five-second header
  notification with the inline bundled 16×16 Homey GIF was accepted, and the screen
  API confirmed both text rows and the icon. A separate four-second raw JSON layout
  using `matrix-light6` and `matrix-chunky8x6` was accepted and captured correctly.
  No icon upload, persistent pushed app, sound or settings change was needed.
- Remaining Homey check: install locally, pair TC002, inspect the Flow picker and
  execute both template cards and raw JSON through Homey itself. Tests with fake
  transport cover a 32×8 layout and rejection of the 52×16 preset on that display.
  AWTRIX 3 and the shared driver interface remain unchanged.
- Verification after this addition: all 481 tests pass, TypeScript build and ESLint
  pass, generated manifest passes Homey's offline publish-level validation and
  `git diff --check` is clean. Publish-level validation is not publication.

## First test build and source distribution (open decision)

The owner is considering a first test version and is concerned about exposing
source. Nothing has been installed or published in this work. A local Homey test
is the recommended first gate, followed by a decision about wider distribution.
The installed Homey CLI excludes TypeScript files when packing but distributes
compiled JavaScript from `.homeybuild`; this does not keep the app's code secret.
An App Store [Test release](https://apps.developer.homey.app/app-store/publishing)
is distributed through a test link and does not itself publish a Git repository.
The repository's LICENSE is GPLv3: distribution of covered object code has
corresponding-source requirements; private local use does not require public
publication. See [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLRequireSourcePostedPublic)
and [GPLv3 section 6](https://www.gnu.org/licenses/gpl-3.0.en.html#section6).
Do not treat the Test link as a confidentiality guarantee. The app calls the NG
firmware API; it does not distribute the author's firmware source as part of this
feature. Publishing and installing are separate future actions.

## Confirmed so far

- A physical Ulanzi TC002 running an AWTRIX NG beta responds through the existing `/api/v1/*` API. `GET /api/v1/device` reports `boardType: "tc002"`; `GET /api/v1/capabilities` reports platform `tc002` and a 52×16 display.
- The same live capabilities response reports `audio.mp3: true`, `audio.radio: true`, `audio.mixer: true` and `audio.synth: true`. Stored MP3 and direct URL stream playback were tested separately below; saved radio stations and mixer behavior were not. The older vendored API documentation describes radio availability more narrowly, so the live response and the documented API must be checked separately.
- A notification using an existing 8×8 bundled icon rendered successfully, centered vertically. A 16×16 GIF sent in a second notification filled the panel height. These were temporary notifications, not a persistent icon upload.
- The TC002 app inventory can report built-in apps as `inLoop: true` with `slot: null`. Existing NG logic must preserve those apps when rewriting the order.
- The owner's latest firmware release notes say `buttonCallback` now works on TC002. This was verified on the physical beta 1.1.5: a temporary LAN webhook received a knob press `{ "button": "knob", "state": true, "uid": "…" }`, a release with `state: false`, and repeated turns with `turn: -1` and `turn: 1`. Each turn also carried `uid`; its value was not logged. The webhook returned HTTP 200, and the device's `buttonCallback` was restored to its original empty value and read back afterward. MQTT was disabled on the device, so its knob topic remains untested.
- The physical beta reports audio output available and initially had no stored MP3s or radio stations. `POST /api/v1/audio/play` with a short inline `fx` song returned HTTP 200 `{ "ok": true }` without uploading an asset or changing saved settings. The owner heard the notes from the speaker, confirming actual synthesized playback.
- Direct stored MP3 playback is also confirmed on the physical TC002. A 106,560-byte, about 2.7-second test MP3 was uploaded with `POST /api/v1/audio/mp3` as multipart field `file` under `tc002_homey_probe.mp3` (`200 {"ok":true}`). `POST /api/v1/audio/play` with `{"mp3":"tc002_homey_probe"}` returned `200 {"ok":true}`. A subsequent `GET /api/v1/audio` reported `mp3.playing: true` and the test name while it played, then `false` afterward. The owner heard the sound on the second playback. The test file was deleted with `DELETE /api/v1/audio/mp3/tc002_homey_probe` (`200`), and a final MP3 list confirmed it was absent. No saved radio station or mixer playback was tested.
- A direct URL test used the same short MP3 served temporarily from the development Mac. `POST /api/v1/audio/play` with `{"url":"http://<local-mac>:18777/tc002_homey_probe.mp3"}` returned `200`, and `GET /api/v1/audio` reported `radio.playing: true`, the URL as `radio.station`, nonzero decode activity and buffered bytes. The owner heard the sound. The Mac server logged repeated `GET` requests for the same file after it ended: this beta treats a finite MP3 URL as a reconnecting radio stream, not a one-shot sound. The test stream was stopped with `POST /api/v1/audio/stop` `{"scope":"stream"}` and read back as `radio.playing: false`; the temporary server was shut down.
- A follow-up URL server returned the MP3 only on its first request and `404` thereafter. The second request arrived at about 2.9 seconds; TC002 set `radio.playing: false` and `radio.error: "connect failed"`, but requested the URL again at about 4.9 and 9.9 seconds. **404 alone does not cancel reconnects.** The test was explicitly stopped with `scope: "stream"`, and the server was closed.
- The owner's bounded-repeat proposal was then tested with three successful MP3 responses, `404` on the fourth request, and an immediate `POST /api/v1/audio/stop` with `{"scope":"stream"}` after that response. The three successful requests arrived at about 0.1, 2.9 and 5.6 seconds, and the fourth at 8.4 seconds. Stop returned `200 {"ok":true}`; the next state reported `radio.playing: false`, `radio.error: ""` and an empty buffer. No fifth request arrived during observation through about 17 seconds. The owner confirmed exactly three complete copies of the triple-beep sample (nine beeps), followed by silence. Cleanup stopped the test stream again and closed the server. No MP3 was uploaded to TC002 for either URL test. This is a verified happy path on the tested beta, not yet a production Homey implementation.
- The owner says nobody has paired an AWTRIX NG TC002 with this Homey app yet, so there is no current TC002 pairing migration to preserve.

## Driver decision

The working preference is to keep TC002 in the existing AWTRIX NG driver while it uses the same API and most operations remain common. Keep hardware differences at a small number of explicit capability boundaries. Reconsider a separate Homey driver if TC002 requires substantially different settings, commands or Flow behavior that cannot be kept clear within one driver. A separate driver would also have its own pairing and Flow definitions.

Knob-specific Flow cards alone are not evidence that a separate driver is necessary. Homey documents a Flow card `$filter` based on device capabilities. The pairing response overrides a device's initial capabilities, and custom feature markers use `uiComponent: null`. The runtime also checks the capability and the authenticated device identity before firing a knob Flow.

The owner chose feature-specific capabilities at pairing. Current markers are `awtrixng_knob`, `awtrixng_display_16px` and `awtrixng_audio_synth`. The last two depend on `/api/v1/capabilities`: a verified 52×16 TC002 panel and `audio.synth: true`. The API does not advertise the knob separately, so `awtrixng_knob` depends on the observed `boardType: "tc002"`, matching `platform.id`, and the captured physical callback. Keep the probed `boardType` as identity; do not encode the model name as a capability. Pairing-time assignment avoids the documented Flow filter limitation for later `addCapability()` calls.

The implementation adds two knob triggers: press, and turn with a signed numeric `turn` token. Release is accepted without firing a Flow. It keeps the three existing button triggers. The synthesized-sound action uses the legacy `fx` payload on older audio firmware and `song` as a one-shot alert on 1.1.6; the changed playback group is explicit in its hint. Native URL playback, stopping the alert group and selecting an MP3 from Soundboard are now implemented as capability-filtered Flow actions. See the 2026-10-03 implementation and live test below. Saved radio stations remain untested.

## Soundboard integration research

- The official [Soundboard app](https://homey.app/en-us/app/com.athom.soundboard/Soundboard/) accepts MP3 and WAV files up to 900 KB and explicitly presents itself as a library for other apps, including Sonos. Its [source](https://github.com/athombv/com.athom.soundboard/blob/master/app.js) stores each upload in its app's `/userdata` directory and keeps the file ID, MIME type, display name and path in settings. Its [app API](https://github.com/athombv/com.athom.soundboard/blob/master/api.js) exposes `getSounds` and `getSound` metadata; those endpoints do not themselves return MP3 bytes. The official [Homey app API documentation](https://apps.developer.homey.app/advanced/web-api) describes how another app calls this API with `homey:app:com.athom.soundboard` permission and an installed-app check.
- Crucially, Homey's [persistent-storage documentation](https://apps.developer.homey.app/the-basics/app/persistent-storage) explicitly says an app's `/userdata/` is publicly served under `http(s)://<homey>/app/<app-id>/userdata/`. The Soundboard metadata `path` is therefore a documented route to form a file URL, after checking that the returned path belongs to Soundboard's own `userdata` directory. The existing AWTRIX NG driver already uses `homey.cloud.getLocalAddress()` for a local callback address. Fetching an actual Soundboard MP3 and playing its Homey URL on TC002 succeeded on 2026-10-03, including the expected metadata shape and MIME type; see below. The installed Homey app's `getApiApp` access and actual Flow picker still need a Homey runtime test. Public serving also means the random filename is a bearer-like locator; do not log it or expose it in Flow tokens.
- At the initial tests, the documented stored-MP3 path required actual bytes in a multipart upload and then playback by stored name. A Soundboard Flow card using that path would need a safe deterministic TC002 name, caching/reuploading, and cleanup/storage handling. The API documentation inspected on 2026-10-01 now also describes native MP3 URLs and transient clips; see the new findings below. Do not assume the older stored-file limitation applies to every newer build. Soundboard WAV files need an explicitly supported playback path or a clear unsupported-format error; do not silently treat a WAV as an MP3.
- The owner's beta 1.1.5 accepts a direct `url` as a reconnecting radio stream. The bounded proxy test above demonstrates a possible alternative to device uploads: serve the current source MP3 for a configured number of requests, then return `404` and explicitly stop the stream. 404 alone is insufficient. This retains radio playback semantics: starting radio stops effects and the loop, and other sounds interrupt radio. Before a Soundboard Flow action uses this workaround, test a Homey binary-serving route, interrupted downloads, repeated/concurrent Flow executions, cancellation, and ownership of stop commands. An HTTP request count is not a general guarantee of completed playback during network errors; only the uninterrupted three-copy test has been confirmed. Native firmware support for finite URL playback would avoid this dependency on reconnect behavior. A timed `stop` has not been validated.
- Before 1.1.6, the TC002 API documented `sfx` for short effects on mixer-capable hardware: effects could overlap a loop, with a 10-second limit. This was a design possibility, **not a physical mixer test**. 1.1.6 removes the HTTP `sfx`/`fx` commands; the implemented URL/Soundboard actions deliberately use the new `alert` group. Saved radio station playback remains unverified. Soundboard-to-TC002 playback is now verified at the API level below.
- **Open design decision (owner, 2026-09-30): Soundboard synchronization.** Soundboard's [implementation](https://github.com/athombv/com.athom.soundboard/blob/master/app.js) creates a new random ID and file path on every upload; its exposed [update route](https://github.com/athombv/com.athom.soundboard/blob/master/api.js) changes the display name, not the audio bytes. A rename keeps the ID; deleting and uploading revised audio creates a new ID. A Flow selection bound to the old ID would then become stale, even if the new sound has the same display name. Checking the Soundboard list only when a Flow runs would notice additions/deletions, but cannot infer unambiguously that a new ID replaces an old one (duplicate display names are not rejected by `createSound`). The inspected source exposes no change event for other apps. The owner wants this left open for later investigation; do not implement or promise automatic synchronization yet.
- The newly tested proxy approach would eliminate synchronization of copies stored on TC002 by reading the current Soundboard source for each playback session. It would not by itself repair a Flow selection whose Soundboard ID was deleted and replaced. Keep that identity decision open separately from transfer/cache synchronization.

### Source and updated API check, 2026-10-01

- The public `Blueforcer/awtrix-ng` main branch was inspected at commit `6d6cc64aa6739724d8501199de70c6692cbb2c6c`; its version file says `1.1.2`, and its complete GitHub tree does not contain `src/platform/tc002`. The published TC002 developer guide links to that missing directory, so this public snapshot is not the source of the owner's TC002 beta. Do not infer TC002-specific implementation from the ESP32 adapter.
- In that snapshot's [ESP32 audio adapter](https://github.com/Blueforcer/awtrix-ng/blob/6d6cc64aa6739724d8501199de70c6692cbb2c6c/src/system/AudioOutEsp32.cpp#L454), redirects with a location are followed, and every other HTTP status except 200 breaks connection setup. The common failure path publishes a connection error, waits with backoff, and reconnects. Neither 204 nor 410 has a special stop branch there. Normal connection EOF also reconnects. This explains why trying arbitrary status codes is unlikely to help that implementation; TC002 behavior for codes other than 404 is still untested.
- The [HTTP API documentation](https://ang.blueforcer.de/reference/http/#post-apiv1audioplay) read on 2026-10-01 now says `mp3` accepts an HTTP(S) URL when `capabilities.audio.url` is true, downloading the file and playing it once. `loop` also accepts URLs. Radio URL playback is now documented under `stream`. The same page describes `POST /api/v1/audio/clip`: raw WAV or MP3 bytes, played once without storing the clip, gated by `audio.clip`. These are documented contracts, not tests on the owner's device; the minimum firmware/build for them has not been established.
- A fresh read of the physical device still reports `version: "1.1.5"`, `boardType: "tc002"`. Its audio capabilities include `mp3`, `radio`, `mixer`, `synth`, `pitch` and `scriptSounds`, but do not contain `url` or `clip`. No additional playback or HTTP-status experiment was run during the source check.
- Native finite MP3 URL playback was subsequently tested on that physical beta on 2026-10-01. With the device initially idle, `POST /api/v1/audio/play` with `{"mp3":"http://<local-mac>:18777/tc002_native_probe.mp3"}` returned **HTTP 404**, error code **`notFound`**, message **`no MP3 called "http://<local-mac>:18777/tc002_native_probe.mp3"`**. The temporary server received **zero requests** and was closed afterward. This build treats `mp3` as a stored name and does not implement the documented URL behavior. No sound played and no file was uploaded. Native `clip` remains untested. Repeat this test on firmware advertising `audio.url` before committing to a reconnect-count proxy; the minimum compatible build remains unknown.

## To verify on Homey and before further audio work

### TC002 1.1.6: native URL playback verified, 2026-10-02

- The owner upgraded the physical TC002; `GET /api/v1/device` confirms `version: "1.1.6"` and `boardType: "tc002"`. Its live audio capabilities are `mp3`, `rtttl`, `song`, `speech`, `radio`, `url`, `effect`, `clip` all true, and `track` false. The former `synth`/`buzzer`/`mixer` fields are absent. Playback state now has `alert`, `app` and `radio` groups instead of `mp3`.
- With all groups initially idle, `POST /api/v1/audio/play` with `{"file":"http://<local-mac>:18777/tc002_file_probe.mp3"}` returned `200 {"ok":true}`. A temporary server delivered the same 106,560-byte triple-beep MP3 used in prior tests. It logged exactly one GET at about 0.12 seconds. The device reported `alert.playing: true` with an empty error, then `false` at about 2.98 seconds, with `app` and `radio` idle throughout. No second request occurred during 12 seconds of observation. The server was closed. No device upload or explicit stop was needed. **Protocol and state verification succeeded. The owner had the device muted during this initial test; native URL playback was later audibly confirmed with the actual Soundboard MP3 below.**
- A missing-file test returned HTTP 404 from the temporary server. The command still returned `200 {"ok":true}` before downloading; `alert.error` subsequently became `"HTTP 404"`, and `alert.playing` became false at about 0.43 seconds. Exactly one GET occurred during 12 seconds; the server was closed afterward. A subsequent `POST /api/v1/audio/stop` with `{"group":"alert"}` returned `200 {"ok":true}` with all groups idle, but retained the previous `alert.error`; stopping does not clear that diagnostic on this build. Command acceptance alone cannot mean successful URL playback. A future Flow action must account for asynchronous download failures rather than treating the initial 200 as evidence that a sound played.
- The [1.1.6 release notes](https://ang.blueforcer.de/releases/tc002-1.1.6/#breaking-changes) and [current sound guide](https://ang.blueforcer.de/guides/sounds/) document `file` for stored/URL sounds, `loop: true` for continuous repetition, `station` for radio and `group` for selective stopping. URL MP3s are downloaded whole, not retained, up to 4 MB subject to available RAM. The earlier reconnect-count workaround is no longer needed for one-shot MP3s on this firmware. Exact repeat-count behavior is still unimplemented and unverified.
- At this point the Homey code still represented the pre-1.1.6 audio contract. The compatibility update is now implemented as described below. Soundboard's deleted/replaced sound identity remains an open design item.

### Implemented compatibility and Soundboard test, 2026-10-03

- NG audio capabilities now cover both schemas. The documented and observed new boolean `song`/`rtttl` flags identify the sound-object contract; older `synth` flags keep the old contract. Pairing records `awtrixng_audio_synth` from the applicable flag and `awtrixng_audio_url` only with explicitly reported native `mp3` and `url` support. No new sound marker is added to older paired TC002 devices automatically; nobody had paired one when the owner authorized this work.
- The NG facade adapts existing NG notification `soundRtttl`, numeric `sound` and `soundLoop` into the new sound object. Raw sound objects and lists are validated, passed to new firmware, and explicitly refused on the older contract. Conflicting source/loop options fail instead of being silently overwritten. AWTRIX 3 and the shared Flow interfaces are unchanged.
- Added `awtrixng_audio_url`, `awtrixng_audio_soundboard` and `awtrixng_audio_stop` Flow cards filtered by `awtrixng_audio_url`. URL/Soundboard playback replaces the current alert and waits until it finishes, preserving asynchronous `alert.error` (including a source HTTP status where supplied). A 120-second action timeout stops only an alert still identified by the original URL. Concurrent URL runs are rejected, explicit stop cancels the wait, and stop during preparation is serialized so no delayed play follows it. Another alert replacing the URL reports interruption. The firmware has no playback session ID, so external replay of the identical URL cannot be distinguished.
- Soundboard access uses `homey:app:com.athom.soundboard`, checks installation, selects only MP3 MIME types and re-resolves the selected ID from fresh metadata on every run. Only the exact expected `userdata/<id>.mp3` path is accepted; autocomplete stores no path. Deleted/replaced IDs fail with a request to select the sound again. WAV, stored-file synchronization, repeat-count orchestration and radio actions are not implemented. Audio debug payloads/state and notification sound payloads are redacted to avoid logging private file locators.
- The compiled facade was run against the physical 1.1.6 TC002: it reported all four expected pairing markers; a local URL MP3 finished after about 2.90 seconds with exactly one successful GET; a missing URL became an `AwtrixNgAudioPlaybackError` preserving `HTTP 404`, source status 404 and field `alert.error`; stopping an active URL cancelled the waiting operation and left `alert` idle; the new `song` payload was accepted and finished with an empty error. The temporary server was closed.
- With the owner's explicit permission to use stored Homey CLI authentication solely for this test, the live Soundboard list on the requested Homey was read. Its actual `sabina-nezlob.mp3` record passed the path/type checks. The public local file URL returned HTTP 200, MIME `audio/mpeg`, **39,750 bytes**. The compiled NG facade then sent that Homey URL directly to TC002 and completed without error after about **2.88 seconds**. No file was uploaded or copied to TC002 storage, and no token or private file locator was printed or saved in these notes. Final state: `alert`, `app` and `radio` all idle, `alert.error` empty. This verifies the actual Homey file source and TC002 API path, not the installed Homey Flow UI or an audible result on the muted device.
- Verification: build, **468 tests**, ESLint, `git diff --check` and Homey's offline **publish-level manifest validation** passed. The app has not been installed on Homey or published by this work.
- The owner subsequently requested another playback of `sabina-nezlob.mp3` at higher volume. Master `volume` and `alertVolume` were temporarily set to **100/100**; the same Homey URL completed after about **2.88 seconds**. The original **90/100** settings were restored and read back successfully. The owner explicitly confirmed hearing the sound. **Actual Soundboard-to-TC002 native URL playback on 1.1.6 is now audibly verified.** The installed Homey Flow UI remains untested.

1. Pair a TC002 and a regular NG device in Homey; confirm the knob and synth cards appear only for the TC002. The generated manifest has the expected `driver_id=awtrixng&capabilities=...` filters, but the actual Flow picker has not yet been observed.
2. Enable the managed callback on the paired TC002; repeat press, release and both turn directions through Homey. Unit tests cover callback parsing, authentication, capability guard and repeated turns, but end-to-end Homey behavior remains unverified.
3. The stored MP3 happy path, old URL stream and new native URL happy/error/stop paths are verified. A saved radio station still needs a direct playback test. Do not equate `audio.mp3` with every kind of music playback.
4. The actual Soundboard file URL and compiled facade path have passed the live test above, including audible confirmation. Install the prepared app on Homey and test the Soundboard picker and all three audio Flow cards through the Homey SDK, including a deleted sound, network failure and cancellation.

### Practical API check when the TC002 is reachable

1. Read `GET /api/v1/capabilities`, then `GET /api/v1/audio` and `GET /api/v1/audio/mp3`. Check `audio.mp3`, `audio.radio`, playback `available`, the current playback state, and whether there is an already uploaded short MP3 or a configured station. Avoid logging station URLs or credentials.
2. The MP3 upload/play/list/delete happy path was completed as recorded above. For a configured radio station, send `POST /api/v1/audio/play` with `{ "station": "<existing-name>" }`, confirm it is heard and check `GET /api/v1/audio`; finish with a scoped `POST /api/v1/audio/stop`. Only run this when it will not interrupt something currently playing. If no suitable station exists, arrange one deliberately instead of inferring playback from a 200 response alone. The [current HTTP API](https://ang.blueforcer.de/reference/http/) and [sound guide](https://ang.blueforcer.de/guides/sounds/) document these routes and payloads.
3. If MQTT is enabled later, subscribe to `<prefix>/state/buttons/knob` for press/release and `<prefix>/event/knob` for turns according to the owner's release notes. Its MQTT payload and non-retained behavior still need a direct capture. The older online [system](https://ang.blueforcer.de/reference/system/) and [device-control](https://ang.blueforcer.de/guides/device-controls/) pages still say that TC002 webhooks do not work, so they are stale for the tested beta callback.
4. After Homey pairing, enable the managed `buttonCallback` and repeat the physical gestures through the installed app. The parser now accepts the captured knob HTTP shapes and retains the existing callback authentication and UID checks.

Homey's [Flow filter documentation](https://apps.developer.homey.app/the-basics/flow#flow-card-device-filters) warns that later `addCapability()` or `removeCapability()` calls do not update a card's capability filter. Homey's [pairing documentation](https://apps.developer.homey.app/the-basics/devices/pairing#device-pairing-data) allows capabilities in pairing data, and its [capability documentation](https://apps.developer.homey.app/the-basics/devices/capabilities#no-ui-component) allows a capability without a device UI component. The behavior of this combination in the actual Homey Flow picker remains to be tested.
