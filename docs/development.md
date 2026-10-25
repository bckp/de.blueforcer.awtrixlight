# Development rules

## Runtime and dependencies

- Use Node.js 22 or newer and the Homey SDK 3.
- Use native APIs and Node.js standard modules first: `fetch`, `FormData`,
  `AbortController`, `URL`, `Buffer` and `node:crypto`.
- Add a dependency only when the runtime and Homey SDK cannot meet the requirement.
  Do not add a package for a small helper.
- Do not use the `axios` or `form-data` packages.
- Use `node:test` and `node:assert/strict` for tests.
- Use the versions in `package.json` and install them with `npm ci`.
- Keep ESLint on 8.57.1. Keep the TypeScript range aligned with `eslint-config-athom`.
  Do not use package overrides to bypass peer dependency requirements.

## Code structure

| Path | Responsibility |
|---|---|
| `drivers/awtrixlight`, `lib/awtrix3` | AWTRIX 3 integration. |
| `drivers/awtrixng`, `lib/awtrixng` | AWTRIX NG integration. |
| `app.ts`, `drivers/shared-flow-actions.ts` | Shared Flow registration and dispatch. |
| `lib/shared` | `Poll`, its timer interfaces, and `runWithConcurrencyLimit` only. |
| `.homeycompose`, `drivers/*/*.compose.json` | Homey manifest sources. |
| `app.json` | Generated Homey manifest. |
| `test` | Automated tests. |

Keep the two protocol implementations separate. Do not import one protocol library
from the other or add a shared protocol client, transport or base class. Keep each
layer's input guards local. Changes to shared Flow interfaces must have a documented
contract.

`lib/shared` must not import Homey, drivers or protocol libraries, or contain protocol
types. Additional shared utilities require explicit owner approval.

AWTRIX NG uses this call path:

```text
Flow card → Device → AwtrixNgApi → Client → native fetch
```

- Construct the NG client and icon service through `AwtrixNgApi.fromConnection()`.
  Use `AwtrixNgApi.probe()` during discovery and pairing. The public constructor
  also supports tests with a fake transport.
- Keep Homey calls, settings writes, capability writes and translations in the driver
  layer. `lib/awtrixng` must not import Homey or driver code or take a Homey device
  in its facade constructor.
- Extend the facade for new NG operations. Follow the driver import allowlist in
  `test/awtrixng-lib-structure.test.js`.
- Keep functions in `Services`, `Device` and `Payload` as exported functions.
  Use PascalCase names for NG library files.
- Keep `device.client` and `device.icons` as read-only views of the active API.
- Keep polling in `device.ts`, with timers bound to the device lifecycle.
- Use an icon cache lifetime of 120 seconds for AWTRIX 3 and 5 seconds for NG.
  Replace the NG icon service when activating a new connection.

## API contracts

- Check the API documentation for the target firmware and hardware. Check runtime
  behavior separately. Do not infer a contract from a similar endpoint name.
- Use the device's capabilities and documented firmware checks. Reject unsupported
  operations explicitly. Do not simulate them or return a successful no-op.
- Keep NG request and response types in `lib/awtrixng`.
- Reject unknown fields and conflicting options. Preserve `false`, `0`, empty text
  and explicit `null` where the contract allows them. Do not trim, clamp, rename
  or discard input silently.
- Preserve HTTP status, firmware error code, message and field when available.
  Do not catch and ignore API errors.
- Mark an unknown contract as unverified. Do not describe a test fixture as a
  hardware test.
- Do not add moodlight controls, Flow actions or dedicated moodlight write methods.

## Flow cards and UI

- Define cards in Homey Compose and register them through the existing app or driver.
  Regenerate `app.json` with the Homey CLI.
- Use separate action cards for enabling and disabling a script. Use a condition card
  for its current enabled state, with Homey's native inversion syntax.
- Use stable card IDs, argument names and stored values. Keep deprecated cards and
  the `applicationIcon` adapter working.
- Keep main titles free of argument placeholders. Put placeholders in `titleFormatted`.
- Provide user-facing text in English, Czech, German and Dutch. Keep diagnostic logs
  in English.
- Use Homey's duration option, color picker and autocomplete where available.
  Check device support again when a card runs.
- Keep both NG pairing views in sync. Share their browser code only through a build
  step that includes it in both views.

## Device lifecycle and writes

- Verify the paired UID before using NG state or switching to a discovered address.
- Validate a candidate connection before saving it. Activate its API client only
  after the connection store writes succeed. Read `baseUrl` before legacy address
  and port values. The three store writes are separate operations.
- Run NG settings writes in order and stop on the first failure. Do not use
  `Promise.allSettled` for this write sequence. Earlier writes may already have applied.
- Do not call `setSettings()` from `onSettings()`. Synchronize settings during init
  or polling.
- Initialize built-in app preferences from the clock. Reapply saved Homey preferences
  after a firmware version change. Preserve other apps and their order on every write.
- Stop timers and remove Flow listeners when deleting a device. Discard late results
  after deletion or a connection change. Do not overlap poll requests.
- Start the 5-second state Flow poll only while a relevant trigger is used. Read
  subscriptions at init and on the SDK `update` event. Reset the baseline after
  subscription, connection, availability or hardware restart changes.
- Attempt every bundled icon upload. Collect failures and log them once; do not fail
  device setup for an icon upload failure.
- Treat the `onAdded()` and rediscovery capability writes as best-effort updates.
  Await them and log failures without failing the completed operation.
- Remove the deprecated NG `alarm_battery` capability as a best-effort update during
  successful init. Use `measure_battery` for battery state.

## HTTP and callback data

- Use the existing request timeout for the complete response read. Bound response
  reads to 8 MiB. Check both `Content-Length` and the bytes actually received.
  Abort on overflow and return an error without partial data.
- NG applies this bound to JSON, text, binary and error responses, including RAW.
  AWTRIX 3 applies it to GET and direct file reads and cancels unused write responses.
  Keep each protocol's response reader in its own library.
- Button callbacks are opt-in. When disabled at startup, do not read or write
  `/system`. Manage only an empty callback or the URL owned by this device.
- Build callback URLs from Homey's local HTTP address with `URL`. Preserve the port
  and IPv6 brackets, encode the UID and token path segments, and clear the query and
  fragment.
- Store callback tokens in the device store. Generate them with
  `crypto.randomBytes(32).toString('hex')`. Compare equal-length tokens with
  `crypto.timingSafeEqual`. Validate the route UID, body UID, paired device ID and
  enabled setting. Do not use the source IP as authentication.
- Never log credentials, callback tokens, callback URLs or callback bodies. Keep debug
  output redacted. Log RAW requests with method and status only.
- The RAW Flow card uses the selected clock's credentials and returns device responses
  and firmware errors without redaction. RAW system writes bypass managed callback
  ownership checks. State this behavior in the card hint and user guide.
- Startup callback failures set a warning and are logged. Device removal may finish
  while callback cleanup fails; log the cleanup failure.

## Compatibility details

- Use each driver's payload model. Do not translate AWTRIX 3 JSON fields into NG
  fields. Keep the documented NG `textCenter` and notification sound adapters.
- Public NG page input accepts `scroll` as an object. The wider internal TypeScript
  union does not extend the public input contract.
- Keep `indicatorOptions` sending `color: '0'` for missing or invalid colors.
  `basicOptions` omits invalid colors. Shared text fragments require a valid `c`;
  reject the whole fragment array when it is missing or invalid.
- Keep `getVersion()`, `getCapabilities()`, `toAwtrixNgRtttlPayload` and
  `fromAwtrixNgHomeyPushedAppName` in the NG API surface.
- Keep AWTRIX 3 behavior and stored Flow compatibility when changing shared code.

## Checks

Run the checks used by CI after code or manifest changes:

```sh
npm ci
npx tsc --noEmit
npm run build
npx --yes homey@4.6.0 app build
node --test test/*.test.js
npm run lint
npx --yes homey@4.6.0 app validate --level publish
git diff --check
```

Finish each Homey build or validation before running lint or tests that read
`.homeybuild`. Commit the regenerated `app.json` and keep
versions aligned across Compose, the generated manifest and `package.json`.

Use tests for changed API contracts, validation, error handling, compatibility and
lifecycle behavior. For documentation-only edits, check links, anchors, examples and
consistency with the code. Check affected behavior on the target clock before release;
test fixtures do not verify display rendering, physical controls or audible playback.

## Documentation

- Write simple English: short sentences, common words and direct instructions.
- Document current behavior, limits and rules. Keep one source for each topic and
  link to it from other pages.
- Remove completed plans, decision history, session notes and dated test counts.
  Do not add them to the user guide.
- Keep UI translations in the app's locale files.
- Keep `docs/vendor` as upstream reference material. Update both NG API snapshots
  from one commit and update `awtrixng-source.md` with their hashes. Check the affected
  contract and transformer tests after a snapshot update.
