# Documentation

| Document | Contents |
|---|---|
| [AWTRIX NG guide](awtrix-ng/README.md) | Pairing, settings, Flow cards, audio, scripts and limits. |
| [AWTRIX NG JSON options](awtrix-ng/json-options.md) | Accepted fields, layouts and examples. |
| [Development rules](development.md) | Runtime, dependencies, code structure and checks. |

All project documentation uses simple English. The app supports English, Czech,
German and Dutch in its user interface.

## API references

The files in `vendor/` are saved copies of upstream API specifications.

- [AWTRIX 3 HTTP API](vendor/awtrix3-http-api.md)
- [AWTRIX NG HTTP API](vendor/awtrixng-http-api.md)
- [AWTRIX NG OpenAPI schema](vendor/awtrixng-http-openapi.yaml)
- [AWTRIX NG snapshot source](vendor/awtrixng-source.md)

The NG snapshots cover the API checked with release 1.2.2. See the
[current upstream documentation](https://ang.blueforcer.de/) for updates. Record the source
commit or firmware version when adding a new API contract. Keep upstream snapshots
in their original form.
