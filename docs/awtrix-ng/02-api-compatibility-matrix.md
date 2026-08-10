# AWTRIX 3 vs. AWTRIX NG API compatibility matrix

Tento dokument porovnává funkcionality, které používá existující Homey driver pro AWTRIX 3, s HTTP API AWTRIX NG.

Zdroje:

- existující kód v `drivers/awtrixlight/*` a `lib/awtrix3/Api/*`, `lib/awtrix3/Normalizer.ts`, `lib/awtrix3/Types.ts`,
- `docs/awtrix-ng/01-existing-driver-analysis.md`,
- lokální vendorizovaná AWTRIX 3 dokumentace `docs/vendor/awtrix3-http-api.md`,
- online AWTRIX 3 dokumentace `https://blueforcer.github.io/awtrix3/#/api` (pozn.: při strojovém načtení jde o SPA; prakticky použitý obsah odpovídá vendorizovanému dokumentu),
- online AWTRIX NG HTTP reference `https://ang.blueforcer.de/reference/http/`,
- online AWTRIX NG payload reference `https://ang.blueforcer.de/reference/payload/`,
- online AWTRIX NG discovery reference `https://ang.blueforcer.de/getting-started/discovery/`,
- online AWTRIX NG errors reference `https://ang.blueforcer.de/reference/errors/`,
- lokální OpenAPI `docs/vendor/awtrixng-http-openapi.yaml` pouze jako podpůrný zdroj; při rozporu má přednost aktuální online textová dokumentace.

## Legenda kompatibility

| Hodnota | Význam |
|---|---|
| **Přímo kompatibilní** | Lze použít beze změny endpointu, metody i payloadu. V této analýze prakticky nenastává, protože AWTRIX NG používá `/api/v1/*`. |
| **Kompatibilní po transformaci** | Funkce má v NG jasný ekvivalent, ale vyžaduje změnu endpointu/metody/payloadu/response mappingu. |
| **Částečně kompatibilní** | Existuje ekvivalent pro běžný subset, ale ne všechna pole nebo chování jsou zachována. |
| **Nepodporovaná** | Dokumentace NG pro danou AWTRIX 3 funkcionalitu neuvádí ekvivalent. |
| **Nejasná / UNKNOWN** | Kód nebo dokumentace nestačí k bezpečnému závěru; vyžaduje ověření na zařízení nebo doplnění dokumentace. |

`UNKNOWN` níže znamená, že kompatibilita není doložena kódem ani dokumentací a nesmí být implementačně předpokládána.

## 1. Kompletní tabulka kompatibility

### 1.1 Přehled endpointů a high-level kompatibility

| Funkcionalita v existujícím driveru | AWTRIX 3 endpoint / metoda | AWTRIX NG endpoint / metoda | AWTRIX 3 request payload | AWTRIX NG request payload | AWTRIX 3 response očekávaná kódem | AWTRIX NG response | Změny polí / jednotek | Změny chování | Změny chyb | Klasifikace |
|---|---|---|---|---|---|---|---|---|---|---|
| Ověření dostupnosti zařízení (`testDevice`, `clientVerify`) | `GET /api/stats` | `GET /api/v1/device` nebo `GET /api/v1/version` | žádný | žádný | Kód používá jen HTTP status; pro data očekává `AwtrixStats`. | `GET /api/v1/device` vrací device state; `GET /api/v1/version` vrací `{ "version": string }`. | `/api/stats` → `/api/v1/device`; stavová pole mají camelCase a jinou strukturu. | NG `GET /api/v1/device` je „Always 200“ při úspěšném auth; health check musí rozlišit 401/403/404. | NG používá JSON error envelope; 401 `unauthorized`, 404 `notFound`, 405 `methodNotAllowed`. | Kompatibilní po transformaci |
| Refresh capabilities ze statistik (`refreshCapabilities`) | `GET /api/stats` | `GET /api/v1/device` | žádný | žádný | `AwtrixStats` s poli `bat`, `lux`, `temp`, `hum`, `wifi_signal`, `matrix`, `indicator1..3`, `uptime`. | Device state s poli `lowBattery`, `batteryPercent`, `lightLevel`, `temperature`, `humidity`, `wifiRssi`, `matrixPower`, `indicators[]`, `uptimeSeconds`; některá pole jsou podmíněná. | Viz detailní mapování níže. `batteryPercent` se mapuje do `measure_battery`; `lowBattery` se záměrně nemapuje, aby nevznikla druhá překrývající se sada bateriových Flow cards. `lux` není totéž co NG `lightLevel` (0–100 %). | Battery/sensor fields mohou v NG chybět podle konfigurace GPIO/senzorů. Luminance jednotka se mění z lux na relativní %. | NG errors jako výše; response fields mohou být absent bez chyby. | Částečně kompatibilní |
| Načtení seznamu efektů (`refreshEffects`, validace `effect`) | `GET /api/effects` | `GET /api/v1/capabilities` | žádný | žádný | `string[]` uložený do store `effects`. | Objekt `{ effects, transitions, overlays, palettes, radio, gpio, ... }`; použít `effects`. | Response se mění z pole na objekt; názvy efektů NG jsou canonical a case-insensitive. | NG zároveň poskytuje overlays/transitions/palettes; neexistuje samostatný `/api/v1/effects`. | NG 401/405/error envelope. Unknown effect na write routes vrací 422 a nic neuloží. | Kompatibilní po transformaci |
| Zapnutí/vypnutí matrix (`cmdPower`, capability `awtrix_matrix`, flow `displaySet`) | `POST /api/power` | `PATCH /api/v1/display` | `{ "power": boolean }` | `{ "power": boolean }` | Kód čte jen status. | `200 {"ok":true}`; `GET /api/v1/display` vrací `{ power, brightness, overlay, overlaySettings, moodlight }`. | Endpoint a metoda se mění; response success je explicitní `{ok:true}`. | NG `PATCH` je validate-then-apply; power je také viditelný jako `matrixPower` v `/api/v1/device`. | 400 invalidJson, 415 unsupportedMediaType, 422 field `power`, 405. | Kompatibilní po transformaci |
| Odeslání běžné notifikace (`notificationIcon`, `connected`) | `POST /api/notify` | `POST /api/v1/notifications` | JSON AWTRIX 3 app/notification payload, typicky `{ text, color, duration, icon }`. | NG-shaped notification payload, typicky `{ text, textColor, durationMs, icon }`. | Kód čte jen status. | `200 {"ok":true}`. | `color` → `textColor`, `duration` sekundy → `durationMs` ms jen jako analytické srovnání; veřejný NG model používá NG field names. | NG queue limit 32; payload applied whole-or-rejected whole; unknown keys fail loudly. | 400 invalidJson, 413 payloadTooLarge, 422 validationFailed, 507 insufficientStorage, 405. | Kompatibilní po transformaci pro běžný subset |
| Sticky notifikace (`notificationSticky`) | `POST /api/notify` | `POST /api/v1/notifications` | `{ text, color, hold: true, icon }` | NG-shaped `{ text, textColor, hold: true, icon }` | Status only. | `200 {"ok":true}`. | Stejně jako notifikace; veřejný NG model používá NG field names. | V NG `hold: true` ignoruje `durationMs`; zůstává do `DELETE /api/v1/notifications/active`. | Jako notifikace. | Kompatibilní po transformaci |
| JSON notifikace (`notificationJson`) | `POST /api/notify` | `POST /api/v1/notifications` | `notifyOptions({ text: msg, ...JSON.parse(options) })`; AWTRIX 3 normalizer propouští whitelist polí. | NG JSON flow má přijímat NG-shaped payload podle NG API, ne AWTRIX 3-shaped options ani Homey alias schema. | Status only. | `200 {"ok":true}` nebo error envelope. | Mnoho polí mění název/jednotky; některá AWTRIX 3 pole nemají NG ekvivalent. | Současný UX „custom options in JSON“ není bezpečně přenositelný 1:1; NG nesmí dostat nepodporovaná pole. | NG 422 `validationFailed` s `field`; 413 limit 8192 B. | Částečně kompatibilní; veřejný NG JSON je samostatné schema |
| Dismiss aktuální notifikace (`cmdDismiss`) | `POST /api/notify/dismiss` | `DELETE /api/v1/notifications/active` | prázdný / žádný | žádný | Status only. | `200 {"ok":true}` i když žádná notifikace není aktivní. | Metoda POST → DELETE; path se mění. | NG také podporuje targeted dismiss `DELETE /api/v1/notifications/{name}`, ale stávající driver nepoužívá `name`. | 405 pro špatnou metodu; targeted dismiss může vrátit 404, active dismiss ne. | Kompatibilní po transformaci |
| Přehrání RTTTL melodie (`playRTTTL`, `cmdRtttl`) | `POST /api/rtttl` | `POST /api/v1/sounds/play` | Raw text `rtttl string`; záměr `Content-Type: text/plain`. | JSON `{ "rtttl": "..." }` s `Content-Type: application/json`. | Status only. | `200 {"ok":true}` nebo error envelope. | Raw text → JSON; key `rtttl`. | NG validuje, že je zadán právě jeden z `name`, `rtttl`, `builtin`; `settings.soundEnabled=false` vrací 200 bez zvuku; DFPlayer backend může RTTTL odmítnout. | 400 invalidJson, 404 sound not found pro `name`, 422 `field:rtttl` při nevalidní melodii nebo nepodpořeném backendu, 405. | Kompatibilní po transformaci |
| Nastavení indikátoru (`indicator`) | `POST /api/indicator1..3` | `PUT /api/v1/indicators/{id}` | `{ "color": "#RRGGBB" }`, volitelně `{ "blink": ms }` nebo `{ "fade": ms }`. | `{ "color": "#RRGGBB", "blinkMs": ms }` nebo `{ "color": "#RRGGBB", "fadeMs": ms }`. | Status only; ve stats se očekávají `indicator1..3` boolean. | `200 {"ok":true}`; stav v `/api/v1/device.indicators[]` jako `{on,color,blinkMs,fadeMs}`. | `blink` → `blinkMs`, `fade` → `fadeMs`; id v path s lomítkem. | NG vyžaduje JSON body; absence `blinkMs`/`fadeMs` resetuje dané efekty na 0. | 400 invalidJson, 415 unsupportedMediaType, 422 empty `{}`/invalid color, 404 id mimo 1..3, 405. | Kompatibilní po transformaci |
| Skrytí indikátoru (`indicatorDismiss`) | `POST /api/indicator1..3` | `DELETE /api/v1/indicators/{id}` | Současný kód posílá `{}` do normalizeru, který vytvoří `{ "color": "0" }`. | Žádný body; `DELETE`. Alternativně `PUT` s `color:0/null` vypíná on-state, ale dokumentace doporučuje `DELETE` pro full reset. | Status only. | `200 {"ok":true}`. | Clear přes prázdný/černý payload → explicitní DELETE. | NG `{}` na `PUT` není clear; vrací 422. `DELETE` resetuje off, color 0, blinkMs 0, fadeMs 0. | 404 pro neplatné id; 405 pro metodu. | Kompatibilní po transformaci |
| Další appka (`button_next`, `cmdAppNext`) | `POST /api/nextapp` | `POST /api/v1/apps/next` | prázdný / žádný | žádný | Status only. | `200 {"ok":true}` always; 405 pro špatnou metodu. | Jen path. | Žádná dokumentovaná významná změna pro používaný případ. | NG error envelope pro 401/405. | Kompatibilní po transformaci |
| Předchozí appka (`button_prev`, `cmdAppPrev`) | `POST /api/previousapp` | `POST /api/v1/apps/previous` | prázdný / žádný | žádný | Status only. | `200 {"ok":true}` always; 405 pro špatnou metodu. | Jen path. | Žádná dokumentovaná významná změna pro používaný případ. | NG error envelope pro 401/405. | Kompatibilní po transformaci |
| Vytvoření/aktualizace custom app (`customApp`) | `POST /api/custom?name=homey:<name>` | `PUT /api/v1/apps/pushed/{name}` | JSON AWTRIX 3 app payload po `appOptions()`. | NG pushed app payload v NG-shaped tvaru; path name `homey-<user_app_name>`. | Status only. | `200 {"ok":true}` nebo error envelope. | Path name místo query `name`; payload pole viz mapping. NG app name regex `[A-Za-z0-9_-]{1,32}`. | `homey:` je v NG neplatné. Produktové rozhodnutí: uživatel zadává validní `<user_app_name>` podle `^[A-Za-z0-9_-]{1,26}$`; interní jméno je `homey-<user_app_name>`. App žije v RAM, max 50 pushed apps. | 400 invalidName/invalidJson, 413, 415, 422, 507, 405. | Kompatibilní po transformaci a NG-specific name validaci |
| Odstranění custom app (`removeCustomApp`) | `POST /api/custom?name=homey:<name>` | `DELETE /api/v1/apps/{name}` | `{}` jako delete idiom. | Žádný body; path name `homey-<user_app_name>` po stejné validaci jako push. | Status only. | `200 {"ok":true}` i pro neexistující validní jméno; 400 invalidName. | POST `{}` → DELETE. Query name → path name. | NG maže exact name i digit-suffixed children z array payloadu, ale Homey NG driver multi-object payload nepodporuje. Built-in/unknown valid name není chyba. | 400 invalidName, 403 provisioning, 405. | Kompatibilní po transformaci a NG-specific name validaci |
| Načtení settings (`refreshSettings`) | `GET /api/settings` | `GET /api/v1/settings` | žádný | žádný | AWTRIX 3-specific settings subset. | Full NG settings resource s camelCase poli. | NG settings UI používá jen NG-native settings, např. `transitionEffect` string z `/api/v1/capabilities.transitions`. | NG je samostatný settings model; legacy AWTRIX 3 settings keys nejsou kompatibilní vstup. | 401/405/error envelope. | Částečně kompatibilní; NG settings model je samostatný |
| Zápis settings (`onSettings`, `setSettings`) | `POST /api/settings` | `PATCH /api/v1/settings` | Partial AWTRIX 3 settings subset po `settingOptions()`. | Partial NG settings object s NG-native keys (`autoBrightness`, `autoTransition`, `blockNavigation`, `uppercase`, `transitionEffect`). | Kód čte jen status. | `200` s kompletním resulting settings resource, ne `{ok:true}`. | Žádná produktová transformace z AWTRIX 3 settings keys; NG driver přijímá jen vlastní NG settings schema. | NG je atomic validate-then-apply; unknown keys jsou rejected, ne ignorované. | 400 invalidJson, 415 unsupportedMediaType, 422 validationFailed s field, 405. | Částečně kompatibilní; NG settings model je samostatný |
| Reboot zařízení | `POST /api/reboot` | `POST /api/v1/device/reboot` | žádný | žádný | Status only. | `200 {"ok":true}` doručen před restartem. | Path se mění. | NG reboot je samostatná operace. AWTRIX 3-specific settings triggers se do NG nemigrují. | 405, 401; dostupné i v provisioning mode. | Kompatibilní po transformaci endpointu |
| Načtení ikon pro autocomplete (`Icons.loadIcons`) | `GET /list?dir=/ICONS/` | `GET /api/v1/files?dir=/ICONS` | žádný | žádný | Kód očekává `AwtrixImage[]` položky `{ type, size, name }`. | `{ files: [{ name, size }], usedBytes, totalBytes }`. | Response wrapper `files`; pole `type` v NG není. | NG vrací 200 s prázdným `files` pro neexistující adresář; auth platí na celý API/static surface. | 401, 405; `dir` bez traversal guardu pro GET podle dokumentace. | Kompatibilní po transformaci |
| Upload bundled ikon při `onAdded()` | `POST /edit` | `POST /api/v1/files?dir=/ICONS` | `multipart/form-data`, pole `image`, filepath `/ICONS/<name>`. | `multipart/form-data`, libovolný file part; filename `name` a query `dir=/ICONS`, nebo absolutní filename `/ICONS/<name>`. | Status only. | `200 {"ok":true}`. | Endpoint a multipart semantics se mění. NG field name je irelevantní. | NG validuje cílovou cestu do `/ICONS`, `/MELODIES`, `/PALETTES`; upload v AP/provisioning mode zakázán. | 400 invalidPath, 401 po přečtení body, 403 provisioning, 415 unsupportedMediaType pro nevhodný obsah dle errors docs, 500 internalError. | Kompatibilní po transformaci |
| Basic Auth | Všechny AWTRIX 3 requesty; Basic Auth header z `user:pass` | Všechny NG routes; HTTP Basic pokud `authEnabled=true` | Header `Authorization: Basic ...`, jen pokud jsou vyplněny user i pass. | Stejný Basic Auth header. | AWTRIX 3 kód mapuje 401 → `AuthRequired`, 403 → `AuthFailed`. | 401 `{"error":{"code":"unauthorized","message":"authentication required"}}`; 403 v NG znamená hlavně provisioning lockdown. | Auth konfigurační pole NG jsou `authEnabled`, `authUser`, `authPass` v `/api/v1/system`, ale Homey driver je jen klient. | 403 už nelze interpretovat jako „špatné heslo“. | Nutné zachovat HTTP status + `error.code/message/field`. | Částečně kompatibilní; error model vyžaduje změnu |
| mDNS discovery a párování | mDNS `_awtrix._tcp` přes Homey compose `name: awtrix`, TXT `type=awtrix_light` nebo `awtrix3`, `id={{txt.id}}` | NG `_awtrixng._tcp`, TXT `type=awtrixng`, `id=<mac bez dvojteček>`, `name=<hostname>` | N/A | N/A | Pairing ukládá `id` a `address`; neprovádí HTTP ověření. | NG discovery poskytuje IP, port, id, name; HTTP ověření přes `/api/v1/device`. | Service name a TXT type jsou odlišné; NG `id` odpovídá `uid` v `/api/v1/device`. | AWTRIX 3 discovery se nemá měnit. NG pairing použije vlastní mDNS strategii a API probe pro ověření detailů po credentials, pokud je auth zapnutá. | Pokud NG auth enabled, HTTP probe bez credentials vrátí 401; pairing musí vyžádat credentials a retry. | Kompatibilní po samostatné NG discovery strategii |
| Firmware version detection | `GET /api/stats` response obsahuje `version`, ale kód ho nepoužívá | `GET /api/v1/version` nebo `GET /version`; také `/api/v1/device.version` | žádný | žádný | `AwtrixStats.version` typově existuje, logic nepoužívá. | `{ "version": "..." }` nebo text/plain string na `/version`. | Samostatný version endpoint existuje jen v NG podle docs. | Detekce verze musí být explicitně nová; stávající kód jen ověřuje `/api/stats`. | 401/404/405 podle probe. | Kompatibilní po transformaci pro NG; AWTRIX 3 verze zůstává přes stats |

### 1.2 Detailní mapování `/api/stats` → `/api/v1/device`

| Homey capability / store | AWTRIX 3 pole (`AwtrixStats`) | AWTRIX NG pole | Jednotky / změna názvu | Kompatibilita | Poznámka |
|---|---|---|---|---|---|
| `measure_battery` | `bat` | `batteryPercent` | Procenta 0–100; NG pole je podmíněné konfigurací battery pinu | Kompatibilní po transformaci | Produktové rozhodnutí: mapovat přesnou procentní hodnotu. `lowBattery` nezpřístupňovat jako další `alarm_battery`, protože její Flow cards se překrývají s procentními triggery. |
| `measure_humidity` | `hum` | `humidity` | %; NG conditional | Částečně kompatibilní | NG pole chybí bez senzoru vlhkosti. Přidat capability jen při init/pairingu, ne během pollingu. |
| `measure_luminance` | `lux` | žádné mapované pole | AWTRIX 3 `lux`; NG `lightLevel` je relativní 0–100 %, **ne lux** | Nepodporovaná v první NG Homey verzi | Produktové rozhodnutí: `lightLevel` nemapovat do `measure_luminance` ani do náhradní procentní capability. |
| `measure_temperature` | `temp` | `temperature` | °C; NG conditional | Částečně kompatibilní | NG pole chybí bez I²C senzoru. Přidat capability jen při init/pairingu, ne během pollingu. |
| `alarm_generic.indicator1` | `indicator1` boolean | `indicators[0].on` | boolean ve vnořeném poli | Kompatibilní po transformaci | Index 0 odpovídá id 1 (top). |
| `alarm_generic.indicator2` | `indicator2` boolean | `indicators[1].on` | boolean ve vnořeném poli | Kompatibilní po transformaci | Index 1 odpovídá id 2 (middle). |
| `alarm_generic.indicator3` | `indicator3` boolean | `indicators[2].on` | boolean ve vnořeném poli | Kompatibilní po transformaci | Index 2 odpovídá id 3 (bottom). |
| `awtrix_matrix` | `matrix` | `matrixPower` | boolean | Kompatibilní po transformaci | NG má také `GET /api/v1/display.power`. |
| `rssi` | `wifi_signal` | `wifiRssi` | dBm | Kompatibilní po transformaci | Název z snake_case na camelCase. |
| store `uptime` | `uptime` | `uptimeSeconds` | sekundy | Kompatibilní po transformaci | Používá se jen pro log „reboot detected“. |
| Nepoužito | `version` | `version` | string | Kompatibilní po transformaci | NG má navíc samostatné `/api/v1/version`. |
| Nepoužito | `uid` | `uid` | string | Kompatibilní po transformaci | NG mDNS TXT `id` je stejná hodnota jako `uid`. |
| Nepoužito | `app` | `currentApp` | string | Kompatibilní po transformaci | Jen název pole. |
| Nepoužito | `messages` | `messageCount` | count | Částečně kompatibilní | NG dokumentuje `messageCount` jako počet MQTT commands; HTTP requests se nepočítají. AWTRIX 3 význam z kódu není doložen → UNKNOWN. |
| Nepoužito | `ram` | `freeHeapBytes` / jiné heap fields | bytes? | UNKNOWN | AWTRIX 3 docs v lokálním souboru neuvádí detailní response schema; bezpečné mapování není doložené. |
| Nepoužito | `bri` | `brightness` | 0–255 effective brightness | Kompatibilní po transformaci | Kód ho nepoužívá. |

### 1.3 Detailní NG settings model

AWTRIX NG settings jsou samostatné API schema. NG driver nemá přijímat AWTRIX 3 settings keys jako kompatibilní vstup ani se pokoušet o legacy migraci. Bezpečný Homey subset pro první implementaci je:

| AWTRIX NG key | Význam | Request typ | Response typ | Transformace | Klasifikace | Poznámka |
|---|---|---|---|---|---|---|
| `autoBrightness` | Auto-brightness | boolean | boolean | beze změny | Přímo kompatibilní v NG modelu | Doloženo v NG settings. |
| `autoTransition` | Automatic transition to next app | boolean | boolean | beze změny | Přímo kompatibilní v NG modelu | Doloženo v NG settings. |
| `blockNavigation` | Block navigation buttons | boolean | boolean | beze změny | Přímo kompatibilní v NG modelu | Doloženo v NG settings. |
| `uppercase` | Uppercase text | boolean | boolean | beze změny | Přímo kompatibilní v NG modelu | Doloženo v NG settings. |
| `transitionEffect` | Transition effect | string | string | beze změny | Přímo kompatibilní v NG modelu | Hodnota má být vybraná z `/api/v1/capabilities.transitions`. |

Jakýkoli klíč mimo NG settings schema je pro NG driver neznámý vstup a nesmí být potichu zahozený. Pokud bude později potřeba ovládat viditelnost vestavěných NG aplikací, musí vzniknout nový NG-specific návrh podle doloženého NG API, ne mapping z AWTRIX 3 settings.

### 1.4 Detailní mapování app/notification payloadu

Tato tabulka popisuje technické rozdíly mezi AWTRIX 3 payloadem používaným přes `cmdNotify()`/`cmdCustomApp()` a NG payloadem. Po produktovém rozhodnutí PD-010 není tato tabulka veřejné NG JSON schema: NG flows/JSON mají používat NG-shaped názvy polí přímo podle AWTRIX NG API a AWTRIX 3-only klíče mají být odmítnuté.

| AWTRIX 3 key používaný kódem | AWTRIX NG key | Transformace | Notify | Pushed app | Klasifikace | Poznámka |
|---|---|---|---:|---:|---|---|
| `text` string | `text` string | beze změny | ano | ano | Kompatibilní po transformaci endpointu | Číslo v AWTRIX 3 normalizeru převede na string; NG podle payload docs číslo/bool jako `text` ignoruje. Před NG requestem převést na string. |
| `text` fragments `[{t,c}]` | `text` fragments `[{text,color}]` | `{ t }` → `{ text }`, `{ c }` → `{ color }` | ano | ano | Kompatibilní po transformaci | NG fragment bez color defaultuje white; AWTRIX 3 normalizer vyžaduje validní `c`. |
| `textCase` `0/1/2` | `textCase` `inherit/upper/asTyped` | `0→inherit`, `1→upper`, `2→asTyped` | ano | ano | Kompatibilní po transformaci | NG nemá lowercase mode; AWTRIX 3 také používá jen tyto tři režimy. |
| žádný přímý ekvivalent | `font` `small/large` | veřejný NG payload používá NG enum beze změny | ano | ano | NG-specific | Pole je podporované přímo, bez AWTRIX 3 emulace. |
| `topText` | `textInFront` | boolean → boolean | ano | ano | UNKNOWN / částečně kompatibilní | AWTRIX 3 docs: „Draw the text on top.“ NG: z-order text vs decorations. Název a popis naznačují ekvivalent, ale přesné vykreslení vyžaduje ověření. |
| `textOffset` | `textOffsetX` | number → number | ano | ano | Kompatibilní po transformaci | NG offset je X-only. |
| `center` | `textCenter` | boolean → boolean | ano | ano | Kompatibilní po transformaci | NG centering platí jen když text neanimuje / fits static. |
| `color` | `textColor` | color → color | ano | ano | Kompatibilní po transformaci | NG color parser je širší; output vždy `#RRGGBB`. |
| `gradient` `[c1,c2]` | `palette` + `textColor:"palette"` | `gradient` → `palette:[c1,c2]`, `textColor:"palette"` | ano | ano | Částečně kompatibilní | AWTRIX 3 gradient je explicitní text gradient; NG palette ramp má vlastní pravidla. Výsledek může být vizuálně odlišný. |
| `rainbow` | `palette:"Rainbow"` + `textColor:"palette"` | `true` → palette mapping | ano | ano | Částečně kompatibilní | AWTRIX 3 rainbow „each letter differently“; NG palette samples per pixel column. Vizuálně neidentické. |
| `blinkText` | `textBlinkMs` | ms → ms | ano | ano | Kompatibilní po transformaci | V kódu je propouštěno jen pokud není gradient/rainbow. |
| `fadeText` | `textFadeMs` | ms → ms | ano | ano | Kompatibilní po transformaci | V kódu je propouštěno jen pokud není gradient/rainbow. |
| `background` | `backgroundColor` | color → color | ano | ano | Kompatibilní po transformaci | NG ignoruje backgroundColor, pokud je aktivní effect. |
| `icon` | `icon` | beze změny pro ID; inline base64 vyžaduje ověření | ano | ano | Částečně kompatibilní | AWTRIX 3 kód propouští ID kratší než 32 nebo `data:image/jpeg;base64,`. NG rozlišuje ID vs inline base64 podle délky >64 a podporuje JPEG/GIF sniffing. Prefix `data:image/jpeg;base64,` může být UNKNOWN. |
| `pushIcon` `0/1/2` | `iconMode` `fixed/pushOnce/push` | `0→fixed`, `1→pushOnce`, `2→push` | ano | ano | Kompatibilní po transformaci | Doložený ekvivalent. |
| `repeat` | `repeat` | number → number | ano | ano | Kompatibilní po transformaci endpointu | NG používá `repeat` pro počet dokončených průchodů scrollujícího textu stejně u notifications i pushed apps. Pokud text nescrolluje, `repeat` nemá efekt. |
| `duration` | `durationMs` | AWTRIX 3 seconds → NG ms pouze jako analytické srovnání; veřejný NG vstup přijímá jen `durationMs` | ano | ano | Kompatibilní po transformaci pro interní srovnání; AWTRIX 3 `duration` v NG JSON nepodporovat | Homey i NG pracují s ms; žádný automatický převod `duration` sekund v NG JSON flow. |
| `bar` | `barChart` | array → array | ano | ano | Kompatibilní po transformaci | NG extras silently dropped after 16; AWTRIX 3 kód validuje max 16 bez ikony / 11 s ikonou. |
| `line` | `lineChart` | array → array | ano | ano | Kompatibilní po transformaci | NG lineChart potřebuje min. 2 body, jinak nic nekreslí. |
| `barBC` | UNKNOWN | UNKNOWN | ano | ano | Nepodporovaná / UNKNOWN | AWTRIX 3 `barBC` je background color bars. NG dokumentuje `chartColor`, ne background bar color. Nepředpokládat ekvivalent. |
| `autoscale` | `chartAutoscale` | boolean → boolean | ne v normalizeru | ne v normalizeru | Mimo aktuálně používaný subset | `Types.ts` pole obsahuje, ale `Normalizer.ts` ho nepropouští; stávající driver ho fakticky nepoužívá. |
| `progress` | `progress` | number → number | ano | ano | Kompatibilní po transformaci | NG hodnoty >100 clamp na 100; <0 off. Existing normalizer clampuje 0–100. |
| `progressC` | `progressColor` | color → color | ano | ano | Kompatibilní po transformaci | Jen název. |
| `progressBC` | `progressTrackColor` | color → color | ano | ano | Kompatibilní po transformaci | Jen název. |
| `noScroll` | `scroll` objekt | AWTRIX 3 boolean nepoužívat jako veřejný NG model; NG přijímá `scroll: { mode: "static"|"wrap"|"loop"|"bounce", ... }` | ano | ano | AWTRIX 3 field v NG nepodporovat; NG má vlastní model | Produktové rozhodnutí: nepoužívat `noScroll` ani alias `scrollMode`. Pokud `scroll` není uveden, neposílat jej. |
| `scrollSpeed` | `scroll.speed` | number → `{ scroll: { speed } }` | ano | ano | Kompatibilní po transformaci | NG speed je percent of 21 px/s; AWTRIX 3 docs také percent of original speed. Přesná vizuální rychlost UNKNOWN. |
| žádný přímý ekvivalent | `scroll.holdMs` | veřejný NG payload používá nezáporné milisekundy | ano | ano | NG-specific | Pauza před pohybem a v bodech obratu `bounce`. |
| `draw` objektové příkazy (`dp`, `dl`, ...) | `draw` array příkazy (`pixel`, `line`, ...) | automaticky nepřevádět; NG flow vyžaduje nativní array formát | ano | ano | Nekompatibilní veřejný formát | Objektový AWTRIX 3 formát je explicitně odmítnut, protože NG parser vyžaduje command name jako první prvek pole. |
| `effect` | `effect` | string, validovat proti `capabilities.effects` | ano | ano | Kompatibilní po transformaci | NG names case-insensitive; unknown effect je 422 a nic se neuloží. |
| `effectSettings.speed` | `effectSpeed` | number → number | ano | ano | Částečně kompatibilní | NG effectSpeed range 0.1–10 clamped; AWTRIX 3 effectSettings obsahuje `{speed,palette,blend}` jako object. |
| `effectSettings.palette` | `palette` | string/array → `palette` | ano | ano | Částečně kompatibilní | NG palette má vlastní pravidla, files mohou shadowovat built-ins. |
| `effectSettings.blend` | `paletteBlend` | boolean → boolean | ano | ano | Částečně kompatibilní | Semantika může být odlišná; ověřit vizuálně. |
| `overlay` | `overlay` | string → string; `clear` → `""` nebo `null` pravděpodobně, ale UNKNOWN pro per-app | ano | ano | Částečně kompatibilní | NG overlays registry neobsahuje `clear`; empty overlay falls back to global overlay. AWTRIX 3 `clear` může znamenat explicit clear. Ověřit. |
| `hold` | `hold` | boolean → boolean | ano | ne | Kompatibilní po transformaci | Notification-only. Pushed app s `hold` by v NG byla 422 unknown/notification-only. |
| `rtttl` | `soundRtttl` | string → string | ano | ne | Kompatibilní po transformaci | Notification-only; NG notification s nevalidním soundRtttl není rejected podle payload docs, jen nehraje. Standalone `/sounds/play` validuje. |
| `loopSound` | `soundLoop` | boolean → boolean | ano | ne | Kompatibilní po transformaci | Notification-only. |
| `stack` | `stack` | boolean → boolean | ano | ne | Kompatibilní po transformaci | Queue max 32; over-cap 507. |
| `wakeup` | `wakeup` | boolean → boolean | ano | ne | Kompatibilní po transformaci | Notification-only. |
| `clients` | žádný doložený ekvivalent | nepřevádět; explicitně unsupported | ano | ne | Nepodporovaná | AWTRIX 3 HTTP clients forward; NG payload docs neuvádí. |
| `lifetime` | `lifetimeMs` | sekundy → ms | ne | ano | Kompatibilní po transformaci | Pushed app only. |
| `lifetimeMode` `0/1` | `lifetimeExpiry` `remove/mark` | `0→remove`, `1→mark` | ne | ano | Kompatibilní po transformaci | Pushed app only. |
| `pos` | žádné payload pole | Neposílat v pushed app payloadu | ne | ano | Nepodporované v NG Homey payloadu | NG payload nemá per-app `pos`; `PUT /api/v1/apps/order` se nesmí volat jako vedlejší efekt `pushApp`. |

## 2. Seznam nepodporovaných funkcí

Nepodporované zde znamená „nenalezen doložený ekvivalent v AWTRIX NG dokumentaci pro funkcionalitu, kterou existující driver umí poslat nebo očekává“.

1. **Notification forwarding přes `clients`**
   - AWTRIX 3: `clients: string[]` v notification payloadu.
   - AWTRIX NG: payload docs žádné `clients` pole neuvádí; unknown key je `422 validationFailed`.
   - Klasifikace: **Nepodporovaná**.

2. **`barBC` jako background color bar/line chartu**
   - AWTRIX 3: `barBC` backgroundcolor of bars.
   - AWTRIX NG: doložené `chartColor`, nikoli chart background color.
   - Klasifikace: **Nepodporovaná / UNKNOWN**. Nepoužívat bez ověření.

3. **Per-app `pos` v payloadu custom app**
   - AWTRIX 3: `pos` sets position of app, starting at 0.
   - AWTRIX NG: pořadí se nastavuje samostatným `PUT /api/v1/apps/order`, ne payload polem.
   - Klasifikace: **Částečně kompatibilní**, ale původní payload field je v NG nepodporovaný.

4. **Přímé použití jména `homey:<name>` pro pushed app**
   - AWTRIX 3 kód používá query `name=homey:<name>`.
   - AWTRIX NG app name musí odpovídat `[A-Za-z0-9_-]{1,32}`; dvojtečka je neplatná.
   - Produktové rozhodnutí: použít `homey-<user_app_name>`, kde `<user_app_name>` musí už při vstupu odpovídat `^[A-Za-z0-9_-]{1,26}$`.
   - Klasifikace: **Nepodporované původní jméno**, funkce jako taková je možná po NG-specific validaci.

5. **Přímý AWTRIX 3 clear idiom `{}` u app/indicator**
   - AWTRIX 3: prázdný payload odstraňuje custom app; `{color:"0"}`/empty může skrýt indicator.
   - AWTRIX NG: `{}` na `PUT /api/v1/apps/pushed/{name}` a `PUT /api/v1/indicators/{id}` vrací 422; clear je pouze `DELETE`.
   - Klasifikace: **Původní chování nepodporované**, existuje transformace na DELETE.

6. **AWTRIX 3-only JSON/payload keys ve veřejném NG vstupu**
   - `duration`, `noScroll`, `clients`, `barBC`, `pos`, `save` nejsou veřejné NG-shaped payload fields.
   - NG JSON/advanced flow je musí odmítnout jasnou chybou, ne transformovat jako compatibility vrstvu a ne zahodit.

## 3. Funkce vyžadující samostatné modelování v AWTRIX NG driveru

V repozitáři dnes neexistuje explicitní společné rozhraní driveru a podle aktuálního rozhodnutí se nemá zavádět společná runtime abstrakce pro AWTRIX 3/NG. AWTRIX NG má mít vlastní driver, klienta, DTO, transformery a error model pod `lib/awtrixng`. Minimálně tyto oblasti musí být modelované samostatně:

1. **Error model**
   - AWTRIX 3 klient dnes redukuje chyby na `Status` enum.
   - NG vyžaduje zachovat HTTP status, `error.code`, `error.message`, `error.field`.
   - NG klient má vyhazovat/vracet vlastní strukturovanou chybu, ne sdílet AWTRIX 3 `Status` model.

2. **Device identity a protocol detection**
   - NG driver má explicitně ukládat `protocol: "awtrix-ng"`, firmware/version info, address a port.
   - NG používá vlastní mDNS službu `_awtrixng._tcp` s TXT `type=awtrixng`; AWTRIX 3 discovery `_awtrix._tcp` se nemění.
   - Discovery/probe výsledek může používat lokální discriminated union, ale ne jako společné aplikační API.

3. **Capabilities / feature checks**
   - NG má `GET /api/v1/capabilities` a conditional device fields.
   - NG implementace musí umět říct, že battery/sensors/sound/radio/effects/overlays jsou dostupné nebo nedostupné.
   - Nepodporované funkce nesmí být no-op.

4. **Settings model**
   - NG používá camelCase, string enumy a atomické PATCH.
   - AWTRIX 3 settings keys nejsou NG kompatibilní vstup a nemají se speciálně mapovat.
   - NG settings UI/transformer smí posílat jen doložený NG-native subset; ostatní keys odmítnout jako neznámé pole.

5. **App/notification payload model**
   - Nelze sdílet AWTRIX 3 payload 1:1.
   - NG má mít vlastní payload DTO a vlastní transformery s explicitním odmítnutím unsupported polí.

6. **Custom app identity / namespace**
   - `homey:<name>` nelze použít jako NG path name.
   - Stabilní NG-specific pravidlo je `homey-<user_app_name>`, kde uživatelský vstup musí odpovídat `^[A-Za-z0-9_-]{1,26}$`.
   - Žádná sanitizace, hash ani store mapping jako zdroj pravdy; remove/update použijí stejné deterministické pravidlo.

7. **Clear/remove operace**
   - NG musí rozlišovat „set payload“ vs explicitní `DELETE`.
   - AWTRIX 3 clear idiom `{}` se nesmí znovu použít pro NG app/indicator.

8. **File/icon service**
   - AWTRIX 3 `/list` + `/edit` vs NG `/api/v1/files`.
   - NG icon service má vlastní response mapping `{ files }` a vlastní upload/error handling.

9. **Measurement units / Homey capabilities**
   - `measure_luminance` očekává lux, ale NG `lightLevel` je relativní 0–100 %.
   - Produktové rozhodnutí: `lightLevel` do Homey `measure_luminance` nemapovat. Pokud AWTRIX NG později přidá skutečné lux pole, rozhodnutí se může znovu otevřít.

10. **Notification JSON / custom JSON flow**
    - Existující flow dovoluje AWTRIX 3 JSON options.
    - NG JSON flow musí přijímat NG-shaped payload podle AWTRIX NG API. AWTRIX 3 JSON ani Homey alias schema nesmí být poslané přímo do NG.

## 4. Nejasnosti a předpoklady

Všechny položky v této sekci jsou **UNKNOWN**, dokud nebudou ověřeny na zařízení nebo v doplněné dokumentaci.

1. **Viditelnost vestavěných NG aplikací**
   - NG HTTP docs zmiňují „show* setting“, ale tabulka `GET/PATCH /api/v1/settings` ani OpenAPI nedokládají konkrétní pole pro ovládání viditelnosti vestavěných aplikací.
   - Možná náhrada přes `PUT /api/v1/apps/order` nastavuje rotation loop a není doložená jako obecné settings API. Tato oblast není legacy mapping úkol; řešit ji jen jako budoucí NG-specific funkci.

2. **Přesná vizuální ekvivalence `topText` ↔ `textInFront`**
   - Popisy jsou podobné, ale není doloženo, že jde o stejnou renderovací logiku.

3. **Přesná vizuální ekvivalence `gradient`/`rainbow` přes NG `palette`**
   - Transformace je technicky možná, ale NG sampling je per pixel column; AWTRIX 3 rainbow je popsán jinak.

4. **`overlay: "clear"`**
   - AWTRIX 3 povoluje `clear` jako overlay.
   - NG registry overlays obsahuje `rain`, `snow`, `drizzle`, `storm`, `thunder`, `frost`; clear není uveden.
   - NG empty overlay fallbackuje na global overlay, což nemusí být totéž jako explicit clear.

5. **Inline base64 icon formát**
   - AWTRIX 3 kód propouští `data:image/jpeg;base64,...`.
   - NG docs uvádí „inline base64 longer than 64 chars“, decoded/sniffed as GIF/JPEG, bez zmínky o data URL prefixu.

6. **AWTRIX 3 response bodies pro write routes**
   - Existující kód response body nepoužívá a vendorizovaná AWTRIX 3 dokumentace je detailně nepopisuje.
   - Pro kompatibilitu lze porovnávat jen status-level chování, nikoli body.

7. **AWTRIX 3 `/list` a `/edit` přesná smlouva**
   - Kód očekává `/list?dir=/ICONS/` jako `AwtrixImage[]` a upload přes `/edit`.
   - Vendorizovaná AWTRIX 3 API stránka v repozitáři tyto endpointy explicitně nepokrývá v analyzované části.

8. **API ověření při zapnuté autentizaci**
   - NG mDNS `_awtrixng._tcp` poskytuje kandidáta bez credentials, ale `GET /api/v1/device` vyžaduje credentials, pokud je auth zapnutá.
   - Je potřeba ověřit konkrétní Homey pairing UX pro zadání credentials, retry probe a prezentaci `401 unauthorized`.

9. **Budoucí skutečné lux pole**
   - NG dokumentuje `lightLevel` jako relativní ambient light 0–100 %, ne lux.
   - Produktové rozhodnutí je `lightLevel` nemapovat do Homey `measure_luminance`. Otevřené zůstává pouze to, zda AWTRIX NG někdy doplní samostatné skutečné lux pole.

10. **OpenAPI vs online payload docs rozpor u notification sound fields**
    - Online payload docs uvádí `soundRtttl` a `soundLoop`.
    - Lokální OpenAPI popis u `/api/v1/notifications` v jednom místě zmiňuje `rtttl`, `loopSound`; schéma detailních flat fields není kompletní.
    - Pro tento dokument je jako autoritativní brána online payload stránka; implementaci ale ověřit na zařízení.

## 5. Návrh detekce AWTRIX 3 versus AWTRIX NG

### 5.1 Samostatné mDNS pro AWTRIX NG

Současná Homey discovery strategie pro AWTRIX 3:

```json
{
  "mdns-sd": { "name": "awtrix", "protocol": "tcp" },
  "id": "{{txt.id}}",
  "conditions": [
    [{ "field": "txt.type", "match": { "value": "awtrix_light" } }],
    [{ "field": "txt.type", "match": { "value": "awtrix3" } }]
  ]
}
```

AWTRIX NG discovery docs uvádí samostatnou službu:

- service `_awtrixng._tcp`,
- TXT `id` = MAC bez dvojteček, stejné jako `uid` v `/api/v1/device`,
- TXT `name` = hostname,
- TXT `type` = konstantně `awtrixng`.

NG driver má proto dostat vlastní Homey discovery strategii, např. `awtrixng-mdns`, nad `_awtrixng._tcp`. Stávající AWTRIX 3 discovery `_awtrix._tcp` se nemá měnit.

### 5.2 Doporučené ověření NG identity po mDNS

Navržený bezpečný postup pro NG pairing po získání IP/portu z `_awtrixng._tcp` discovery:

1. **Použít NG mDNS jako kandidáta**
   - Vyžadovat service `_awtrixng._tcp` a TXT `type=awtrixng`.
   - Použít TXT `id` jako stabilní `uid` kandidáta.

2. **Ověřit API identity read-only probe**
   - `GET http://<ip>:<port>/api/v1/device`.
   - Pokud `200` a JSON obsahuje NG signaturu, např. `uid`, `boardType`, `ipAddress`, `matrixPower` nebo `currentApp`, přijmout jako `awtrix-ng`.
   - Pokud auth vrátí `401`, pairing si má vyžádat credentials a probe zopakovat; NG klasifikace už vychází z mDNS služby, ale detailní identity/version se ověří až po credentials.

3. **Neprovádět write probe ani AWTRIX 3 fallback v NG driveru**
   - Detekce nesmí posílat žádné mutating requesty.
   - NG driver nemá sahat na AWTRIX 3 discovery ani klasifikovat `_awtrix._tcp` kandidáty.

4. **Uložit protocol do store**
   - Po ověření uložit `protocol: "awtrix-ng"`, `baseUrl`, `address`, `port`, `uid`, `version`.
   - Při rediscovery ověřovat, že TXT `id` / response `uid` sedí.

5. **Port handling**
   - AWTRIX NG může běžet na vlastním `webPort`; mDNS/UDP discovery mohou port dodat.
   - Současný AWTRIX 3 klient ukládá jen IP bez portu. Pro NG je nutné rozhraní adresy rozšířit o port/base URL.

### 5.3 Stavové výsledky detekce

Doporučené výsledky detekce:

| Výsledek | Význam | Akce |
|---|---|---|
| `awtrix-ng` | Nalezeno přes `_awtrixng._tcp` a ověřeno přes `/api/v1/device`. | Použít AWTRIX NG driver. |
| `ng-auth-required` | `_awtrixng._tcp` kandidát vyžaduje credentials pro `/api/v1/device`. | Vyžádat credentials, zopakovat read-only probe. |
| `unknown-not-ng` | mDNS match, ale HTTP signatura po ověření nesedí. | Nezaregistrovat, nebo zobrazit diagnostiku. |
| `unknown-offline` | Discovery ukazuje zařízení, HTTP neodpovídá. | Nabídnout retry/rediscovery. |

## 6. Doporučený implementační postup

1. **Neměnit existující AWTRIX 3 driver in-place**
   - Zachovat `awtrixlight` funkční.
   - AWTRIX 3 knihovní kód zůstává pod `lib/awtrix3`.
   - AWTRIX NG implementovat jako samostatný driver `drivers/awtrixng` a samostatnou knihovnu `lib/awtrixng`, bez `lib/awtrix/common`.

2. **Nezavádět společné runtime driver interface pro AWTRIX 3/NG**
   - Metody podle používaných funkcí (`getDeviceState`, `setPower`, `notify`, `dismissNotification`, `setIndicator`, `clearIndicator`, `pushApp`, `deleteApp`, `playRtttl`, `getSettings`, `patchSettings`, `listIcons`, `uploadIcon`, `reboot`) modelovat v NG klientovi samostatně.
   - U každé NG metody definovat, jak hlásí unsupported funkce a strukturované chyby.
   - Pokud bude potřeba sdílet UI/flow helper, musí být doložené, že neskrývá rozdíly payloadů a errorů.

3. **Oddělit AWTRIX 3 a AWTRIX NG payload transformery**
   - Neposílat AWTRIX 3 payload přímo do NG.
   - Pro každé pole mít explicitní mapping nebo explicitní unsupported error.
   - Žádné tiché zahazování polí u NG.

4. **Zavést nový NG error model**
   - Minimálně `{ protocol, httpStatus, code, message, field, rawBody }` v `lib/awtrixng`.
   - AWTRIX 3 může zůstat na stávajícím `Status` modelu, dokud nebude explicitně plánovaný refaktor; NG musí zachovat envelope.

5. **Vyřešit settings a Homey UI před implementací**
   - NG settings UI používá vlastní keys `autoBrightness`, `autoTransition`, `blockNavigation`, `uppercase`, `transitionEffect`.
   - `transitionEffect` je string z `/api/v1/capabilities.transitions`.
   - Nepřijímat AWTRIX 3 settings keys jako legacy kompatibilní vstup; neznámé keys odmítnout genericky.

6. **Vyřešit capabilities podle skutečné dostupnosti**
   - `batteryPercent` mapovat do `measure_battery`; `lowBattery` záměrně nemapovat do samostatného alarmu.
   - `temperature` a `humidity` přidat jen pokud existují při init/pairingu; polling nepřidává capabilities.
   - `pressureHpa` a `lightLevel` v první verzi nemapovat.

7. **Vyřešit custom app name mapping**
   - Uživatel zadává `<user_app_name>` podle `^[A-Za-z0-9_-]{1,26}$`.
   - Interní NG name je `homey-<user_app_name>`; žádná sanitizace/hash/store mapping jako zdroj pravdy.
   - Remove/update musí použít stejné pravidlo a UI/flows mají vracet jméno bez prefixu.

8. **Přidat testy před produkční implementací NG funkcí**
   - Endpoint mapping pro každou NG metodu.
   - Payload transformace pro notification/app/settings/indicator.
   - NG error envelope preservation.
   - Unsupported fields nesmí být tiše zahozeny.
   - Detection probe pro AWTRIX NG, auth-required, wrong-shape a offline; případné porovnání s AWTRIX 3 shape držet mimo společnou runtime vrstvu.

9. **Implementovat NG jako samostatný HTTP client pod `lib/awtrixng`**
   - NG base URL musí podporovat port.
   - JSON routes musí nastavovat `Content-Type: application/json`.
   - Multipart files routes nesmí být přepsány na JSON content type.
   - Klient nesmí importovat `lib/awtrix3/Api/*`.

10. **Postupné zapojení flows**
    - Nejprve podporovat základní NG-specific flow akce: display power, notification, sticky notification, dismiss, next/previous, RTTTL, indicators.
    - Poté custom app s validačním `homey-<user_app_name>` pravidlem.
    - Až nakonec JSON/custom options flow; musí přijímat NG-shaped payload a odmítat AWTRIX 3-only keys.

## 7. Krátké shrnutí

AWTRIX NG není drop-in náhrada AWTRIX 3 API. Většina funkcí používaných driverem má NG ekvivalent, ale vyžaduje transformaci endpointů, metod, payloadů a response modelu. Kritické rozdíly jsou:

- `/api/*` vs `/api/v1/*`,
- POST clear idioms vs explicitní DELETE,
- AWTRIX 3 zkratky a snake_case vs NG camelCase,
- seconds vs `...Ms` milliseconds,
- `GET /api/effects` vs `GET /api/v1/capabilities`,
- stats shape a conditional sensor fields,
- NG strict validation a strukturované error envelope,
- neplatnost `homey:<name>` jako NG app name a rozhodnutí používat `homey-<user_app_name>` s validovaným vstupem,
- samostatná NG mDNS služba `_awtrixng._tcp` s `type=awtrixng`.

Bez explicitní NG detekce, NG capability checks a NG error modelu by přidání AWTRIX NG riskovalo tiché no-opy, ztrátu chybových detailů a rozbití existující AWTRIX 3 podpory. Implementace má proto zůstat oddělená: `lib/awtrix3` pro AWTRIX 3 a `lib/awtrixng` pro AWTRIX NG.
