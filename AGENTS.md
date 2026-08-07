Project-specific constraints:

- Existing AWTRIX 3 support must remain functional.
- AWTRIX NG is a separate driver, not an in-place replacement.
- Do not silently drop unsupported fields.
- Do not silently emulate unsupported features.
- Do not modify the shared driver interface before documenting the reason.
- Do not infer API behavior only from similar endpoint names.
- Treat documentation and actual existing code as separate sources of truth.
- Mark undocumented assumptions explicitly.
- Prefer explicit capability checks over no-op methods.
- Never catch and ignore AWTRIX NG API errors.
- Preserve HTTP status, AWTRIX NG error code, message and field where available.

## Deliberate decisions — do not "fix" these

Everything below looks like a defect to a static reviewer and is not one. If you believe
one of these should change, say so explicitly and wait for a decision instead of changing
it. Re-reporting them as findings wastes a review cycle.

**Layer separation**

- `lib/awtrix3` + `drivers/awtrixlight` and `lib/awtrixng` + `drivers/awtrixng` are two
  independent drivers. Duplication between them is intentional. No shared class, no shared
  transport, no import across the two lib layers. `app.ts` and
  `drivers/shared-flow-actions.ts` keep their own guard copies for the same reason.
  - The one owner-approved exception (update-plan-3, M6): `lib/shared/` may contain
    exclusively protocol-agnostic infrastructure with no knowledge of the AWTRIX 3/NG APIs -
    currently only `Poll` (+ `TimerHost`). Anything else requires explicit owner approval.
    `lib/shared` must not import `homey`, anything from `drivers/` or from either protocol
    lib layer, and must not contain any protocol type (guarded by
    `test/shared-lib-structure.test.js`).
- Icon cache TTLs differ on purpose: AWTRIX 3 uses 120 s, NG uses 5 s because NG has a fast
  dedicated files API.

**AWTRIX NG facade (outcome of the implemented update-plan-3, doc removed after completion)**

- The NG driver follows `Device → AwtrixNgApi (facade) → Client`. `lib/awtrixng/Api/Api.ts`
  owns the client and the icon list and is the only construction path for both
  (`fromConnection()`; the constructor stays public solely for fake-transport tests).
  `driver.ts` probes through the static `AwtrixNgApi.probe()`.
- Deliberate deviation from the awtrix3 `Api`: the NG facade never imports `homey` and does
  not take the device in its constructor. It returns domain results and all Homey writes
  (setSettings, setCapabilityValue, i18n) stay in `device.ts`, so `lib/awtrixng` stays
  testable with a fake transport and no Homey mocks. Do not "align" it with awtrix3.
- The driver layer imports `lib/awtrixng` only through the allowlist in
  `test/awtrixng-lib-structure.test.js`; extend the facade instead of adding direct imports.
- `device.client` and `device.icons` are read-only views of `device.api` kept for the flow
  actions and the shared icon autocomplete; they are API surface, not leftovers.
- The poll is owned by `device.ts`, not by the facade: its timer is bound to the device
  lifecycle and its callback writes to Homey.
- The pure functions in `Services/*`, `Device/*` and `Payload/*` stay exported functions,
  not classes: they have isolated unit tests that import them directly, and the facade
  calls them internally.

**Error and failure contracts**

- NG settings writes in `writePreparedSettingsChanges()` are sequential and fail-fast. These
  endpoints offer no transaction; if the second write fails the first may already be applied
  and the next save reconciles. Do not wrap them in `allSettled`.
- Bundled icon upload failures are non-critical: every file is attempted, failures are
  collected and logged once. Do not turn them into a thrown error.
- Capability writes that accompany a larger operation are best-effort and must not fail it.
  This covers `onAdded()` in both drivers and the `button.rediscover` listener: a successful
  rediscovery is not reported as failed just because the `ip` capability write failed. They
  are awaited with `.catch(this.error)` so nothing leaks as an unhandled rejection.

**API contracts**

- `indicatorOptions` sends `color: '0'` for an invalid or missing color. For indicators that
  is the documented "turn off" value, not a fallback. `basicOptions` deliberately behaves the
  other way and omits invalid colors.
- `AwtrixNgApiPagePayload.scroll` is typed `AwtrixNgApiScrollPayload | AwtrixNgApiScrollMode`,
  yet public payload validation rejects the string shorthand on purpose - the union exists for
  the internal narrowing path in `Payload/Transformers.ts`, not as a supported input shape.
- Text fragments require a valid `c`; `isTextFragment` rejects the whole array otherwise, so
  the `toColor('0')` fallback inside `toText()` is unreachable. Leave it.
- `getVersion()`, `getCapabilities()`, `toAwtrixNgRtttlPayload` and
  `fromAwtrixNgHomeyPushedAppName` are part of the documented API surface even where unused.
- Deprecated flow cards and the `applicationIcon` adapter in `app.ts` stay for compatibility.

**Tooling and process**

- ESLint is pinned to 8.57.1 + typescript-eslint 8 via `package.json` overrides because
  `eslint-config-athom` (3.1.5) still targets the ESLint 7 era through transitive pins.
  ESLint 8 is upstream EOL; the ESLint 9 upgrade waits for a new `eslint-config-athom`
  release - do not force it through more overrides.
- Diagnostic messages (the identity mismatch error, the legacy `applicationIcon` adapter
  hints) are English-only on purpose: they are logs, not user-facing UI. Localize only if
  users ask for it.
- Activating a connection replaces the NG icon cache deliberately. Preserving it across a
  settings save was evaluated and skipped (plan2 H8): the cache TTL is 5 s and keeping an
  icons instance bound to a stale client is a real risk for negligible benefit.

## Known limitations — accepted, not forgotten

- The two NG pairing views duplicate ~45 lines of Homey glue (`emitHomey`,
  `createHomeyDevice`): Homey pair views cannot share scripts trivially. Consolidate only
  with a build-step include, not by hand-editing one copy.
- `commitConnection()` writes `baseUrl`, `address` and `port` as three separate store calls,
  so a failure mid-way can leave a new `baseUrl` next to a stale address and port. Accepted:
  the client is only activated after all three succeed, and `getBaseUrlFromStore()` prefers
  `baseUrl`, so a partial write leaves a working connection with a stale address used only
  for display and the migration fallback. Making it atomic means moving the connection under
  a single store key, which requires changing the pairing path and migrating every device
  paired before the change. Worth doing deliberately, not as a drive-by fix.
