# Repository instructions

Read [docs/development.md](docs/development.md) before changing code.

- Write project documentation in simple English. Describe current behavior and rules.
  Keep decision history, completed plans and session notes out of the documentation.
- Use native Node.js and Homey APIs. Add a library only for a requirement that native
  APIs cannot meet. Do not use `axios` or the `form-data` package.
- Keep AWTRIX 3 and AWTRIX NG as separate drivers and protocol libraries.
  Preserve existing devices, stored Flow arguments and deprecated card IDs.
- Keep `lib/shared` limited to `Poll`, its timer interfaces and `Concurrency`.
  Additional shared utilities require explicit owner approval.
- Follow the NG path `Device → AwtrixNgApi → Client`. Keep Homey calls out of
  `lib/awtrixng`. Follow the driver import allowlist and extend the facade.
- Check firmware contracts and capabilities. Reject unsupported fields and operations
  explicitly. Preserve HTTP status, firmware code, message and field.
- Follow the lifecycle, write ordering, callback ownership, RAW access and compatibility
  rules in `docs/development.md`. Do not change these contracts as incidental cleanup.
- Keep runtime assumptions separate from hardware verification. Label unverified behavior.
- Use the existing test, lint, Homey build and validation commands. Do not add dependencies
  or tests for a documentation-only edit.
