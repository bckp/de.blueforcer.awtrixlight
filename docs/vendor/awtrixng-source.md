# AWTRIX NG API source

| Item | Value |
|---|---|
| Repository | <https://github.com/Blueforcer/awtrix-ng> |
| Snapshot commit | `40985fe6c93530bc9323fdb758fae8ce34d4b03f` |
| Latest stable release | `v1.2.2` |
| Snapshot date | `2026-10-25` |

| Local file | Upstream file | Git blob SHA-1 |
|---|---|---|
| `awtrixng-http-api.md` | `docs/reference/http.md` | `6e3731028a7e70649ab5dd833b194eddd6c42472` |
| `awtrixng-http-openapi.yaml` | `docs/api/openapi.yaml` | `ef5af58db782b44aa9899a7167bbc8c914b4e632` |

Both files are unmodified upstream snapshots. Update them from the same commit.
Relative links may refer to upstream pages that are not stored in this repository.

The app implements a subset of the API. Its 35 unique NG client operations match
this snapshot's methods and paths. Shared script values and device reboot are
specified by the HTTP reference; they are missing from the OpenAPI path list.
Payloads, capability checks and response handling follow the
[NG guide](../awtrix-ng/README.md) and [JSON reference](../awtrix-ng/json-options.md).
Legacy `fx` playback is used only with the older audio schema.
