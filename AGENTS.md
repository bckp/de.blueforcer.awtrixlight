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
