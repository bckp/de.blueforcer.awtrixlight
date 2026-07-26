# AWTRIX NG user and maintainer guide

Tento dokument popisuje aktuální stav podpory AWTRIX NG v Homey aplikaci a zásady pro další údržbu.

AWTRIX NG je v této aplikaci samostatný driver. Není to drop-in náhrada za AWTRIX 3 a nesmí být dokumentovaný jako plně kompatibilní s AWTRIX 3 flows, payloady nebo uloženými zařízeními.

## Stav podpory

| Oblast | AWTRIX 3 | AWTRIX NG |
|---|---|---|
| Driver | `drivers/awtrixlight` | `drivers/awtrixng` |
| Knihovní kód | `lib/awtrix3` | `lib/awtrixng` |
| Discovery | `_awtrix._tcp` | `_awtrixng._tcp` s TXT `type=awtrixng` |
| HTTP API | `/api/*` | `/api/v1/*` |
| Payload model | AWTRIX 3-shaped JSON | AWTRIX NG-shaped JSON |
| Migrace zařízení | existující zařízení zůstávají AWTRIX 3 | žádná automatická migrace z AWTRIX 3 |
| Migrace flows | existující AWTRIX 3-specific flow karty zůstávají pro AWTRIX 3; bezpečně ekvivalentní akce mohou být sdílené | NG používá vlastní flow karty `awtrixng*` jen pro NG-specific funkce |

## Jak přidat AWTRIX NG zařízení

1. V Homey přidejte nové zařízení přes AWTRIX aplikaci.
2. Vyberte driver **Awtrix NG**.
3. Zařízení se vyhledává přes samostatnou AWTRIX NG mDNS službu `_awtrixng._tcp`.
4. Discovery seznam vždy nabízí také volbu `Add manually` pro ruční zadání IP/hostu a portu.
5. Vybrané nebo ručně zadané zařízení se ověřuje read-only probe requestem `GET /api/v1/device`.
6. Pokud zařízení vyžaduje HTTP Basic autentizaci, pairing zobrazí credentials krok. Username i password jsou povinné.
7. Po úspěšném přidání aplikace používá AWTRIX NG HTTP API na `/api/v1/*`.

Credentials se ukládají lokálně do device settings:

- `authUser`,
- `authPass`.

Neposílají se do AWTRIX NG API jako device settings.

## Podporované uživatelské funkce AWTRIX NG

Aktuální NG driver podporuje samostatné NG flow karty pro:

| Funkce | Flow karta / chování | AWTRIX NG endpoint |
|---|---|---|
| Běžná notifikace | společná flow karta `notification`; ikona se vybírá přes autocomplete z device icons; duration se nastavuje přes Homey `Add duration`, jinak se `durationMs` neposílá | `POST /api/v1/notifications` |
| Sticky notifikace | společná flow karta `notificationSticky`; ikona se vybírá přes autocomplete z device icons; nastavuje `hold: true` | `POST /api/v1/notifications` |
| Raw notifikace | společná flow karta `notificationRaw`; přijímá pouze raw JSON payload bez samostatného message/duration argumentu; pro AWTRIX NG musí být payload NG-shaped JSON object | `POST /api/v1/notifications` |
| Zavření aktivní notifikace | společná flow karta `notificationDismiss` | `DELETE /api/v1/notifications/active` |
| Zapnutí/vypnutí displeje | společná flow karta `displaySet` | `PATCH /api/v1/display` |
| Weather overlay | capability picker `awtrixng_weather_overlay` a flow action `weatherOverlay` registrovaná app-level a omezená přes device filter na AWTRIX NG driver | `GET /api/v1/display`, `PATCH /api/v1/display` |
| Indikátory | společná flow karta `indicator` | `PUT /api/v1/indicators/{id}` |
| Smazání indikátoru | společná flow karta `indicatorDismiss` | `DELETE /api/v1/indicators/{id}` |
| RTTTL melodie | společná flow karta `playRTTTL` | `POST /api/v1/sounds/play` |
| Custom/pushed app | `application`; JSON options jsou volitelné; duration se nastavuje přes Homey `Add duration`, případně přes JSON options `durationMs` | `PUT /api/v1/apps/pushed/{name}` |
| Raw custom/pushed app | `applicationRaw`, přijímá pouze NG-shaped raw JSON object | `PUT /api/v1/apps/pushed/{name}` |
| Odstranění custom app | společná flow karta `applicationRemove`; legacy AWTRIX 3 karta `removeCustomApp` zůstává deprecated | `DELETE /api/v1/apps/{name}` |
| Další/předchozí app | Homey device tlačítka `button_next`, `button_prev`; samostatné AWTRIX NG flow karty se nepoužívají | `POST /api/v1/apps/next`, `POST /api/v1/apps/previous` |
| Ikony | autocomplete a upload do `/ICONS` | `GET/POST /api/v1/files?dir=/ICONS` |

## Custom apps a názvy

Uživatel zadává název custom app bez interního prefixu.

Pravidla:

- uživatelský vstup musí odpovídat `^[A-Za-z0-9_-]{1,26}$`,
- aplikace neprovádí sanitizaci ani slugifikaci,
- interní název posílaný do AWTRIX NG je `homey-<user_app_name>`,
- `homey:<name>` z AWTRIX 3 se pro NG nepoužívá, protože dvojtečka není validní NG app name znak.

Příklad:

| Uživatelský vstup | Interní AWTRIX NG app name |
|---|---|
| `weather` | `homey-weather` |
| `living_room` | `homey-living_room` |
| `my weather app` | odmítnuto |

## AWTRIX NG JSON payload pravidla

NG JSON flow karty přijímají pouze AWTRIX NG-shaped JSON object. Nejsou kompatibilní s AWTRIX 3 JSON options.

Běžné non-JSON flow karty pro notifikaci a custom/pushed app používají Homey-native `Add duration`. Pokud uživatel duration nepřidá, `durationMs` se neposílá a zařízení použije vlastní default. U běžné custom app flow jsou JSON options volitelné; prázdná hodnota se chová jako `{}`. Homey `Add duration` má přednost před `durationMs` z JSON options; pokud Homey duration není zadaná, hodnota z JSON options zůstane zachovaná.

### Příklad NG notifikace

```json
{
  "text": "Doorbell",
  "textColor": "#ff0000",
  "durationMs": 5000,
  "scroll": {
    "mode": "static"
  }
}
```

### Příklad NG pushed app

```json
{
  "text": "21 °C",
  "textColor": "#00aaff",
  "durationMs": 5000,
  "repeat": 2,
  "lifetimeMs": 60000,
  "scroll": {
    "mode": "loop"
  }
}
```

### Známé AWTRIX 3-only keys odmítané v NG JSON

| AWTRIX 3 key | NG pravidlo |
|---|---|
| `duration` | použít `durationMs`; žádný automatický převod sekund na ms |
| `noScroll` | použít NG `scroll` object |
| `scrollMode` | použít NG `scroll.mode` |
| `color` | použít `textColor` |
| `clients` | nepodporováno; NG dokumentace neuvádí ekvivalent |
| `barBC` | nepodporováno / UNKNOWN; NG dokumentace neuvádí chart background ekvivalent |
| `pos` | nepodporováno v pushed app payloadu; případné pořadí aplikací musí být samostatná NG-specific funkce |
| `save` | nepodporováno; NG pushed app flow neukládá AWTRIX 3 custom app stejným způsobem |

Unknown keys se odmítají před HTTP requestem, aby nedošlo k tichému dropnutí.

## Settings

AWTRIX NG settings UI expose pouze NG-specific subset:

| Setting | Význam | Zápis do zařízení |
|---|---|---|
| `authUser` | lokálně uložené API username pro Homey klienta | neposílá se jako NG setting |
| `authPass` | lokálně uložené API password pro Homey klienta | neposílá se jako NG setting |
| `autoBrightness` | NG setting | `PATCH /api/v1/settings` |
| `autoTransition` | NG setting | `PATCH /api/v1/settings` |
| `blockNavigation` | NG setting | `PATCH /api/v1/settings` |
| `uppercase` | NG setting | `PATCH /api/v1/settings` |
| `transitionEffect` | NG transition string vybíraný ze statického Homey dropdownu | `PATCH /api/v1/settings` |
| `showBuiltinTime` | zda má být built-in app `Time` v app loopu | `GET /api/v1/apps`, potom `PUT /api/v1/apps/order` |
| `showBuiltinDate` | zda má být built-in app `Date` v app loopu | `GET /api/v1/apps`, potom `PUT /api/v1/apps/order` |
| `showBuiltinTemperature` | zda má být built-in app `Temperature` v app loopu | `GET /api/v1/apps`, potom `PUT /api/v1/apps/order` |
| `showBuiltinHumidity` | zda má být built-in app `Humidity` v app loopu | `GET /api/v1/apps`, potom `PUT /api/v1/apps/order` |
| `showBuiltinBattery` | zda má být built-in app `Battery` v app loopu | `GET /api/v1/apps`, potom `PUT /api/v1/apps/order` |

Statický dropdown `transitionEffect` používá hodnoty doložené AWTRIX NG dokumentací pro `GET /api/v1/capabilities.transitions`: `Random`, `Slide`, `Dim`, `Zoom`, `Rotate`, `Pixelate`, `Curtain`, `Ripple`, `Blink`, `Reload`, `Fade`, `Cover`, `Uncover`, `Split`, `Blinds`, `Blocks`, `Flash`, `Diamond`, `Wave`, `Rain`, `Melt`, `Interlace`. Aktuální hodnota se při inicializaci zařízení synchronizuje přes `GET /api/v1/settings`. Při uložení se nedělá preflight `GET /api/v1/capabilities`; hodnota se posílá přímo do `PATCH /api/v1/settings` a případnou nekompatibilitu vrátí AWTRIX NG API.

Built-in app checkboxy reprezentují pouze viditelnost dokumentovaných built-in aplikací v app loopu. Při inicializaci zařízení se synchronizují z `GET /api/v1/apps`. Při změně se vždy nejdřív načte aktuální inventory, zachová se pořadí ostatních aplikací, vypnuté built-in appky se odeberou z orderu a nově zapnuté dostupné built-in appky se přidají na konec. Pokud uživatel zapne built-in app, kterou zařízení nevrací v inventory, změna se odmítne chybou; nedělá se tiché ignorování.

`onSettings()` nesmí volat `setSettings()`, protože Homey settings jsou během handleru pending. Sync z fyzického zařízení se provádí při initu mimo `onSettings()`.

AWTRIX 3 settings keys se do AWTRIX NG settings nepřenášejí a nemají být dokumentovány jako kompatibilní.

## Homey capabilities a device state

AWTRIX NG driver mapuje jen doložené a podporované capabilities:

| AWTRIX NG field / endpoint | Homey capability | Poznámka |
|---|---|---|
| `lowBattery` | `alarm_battery` | mapuje se boolean low-battery stav |
| `temperature` | `measure_temperature` | přidá se jen při init/pairingu, pokud field existuje |
| `humidity` | `measure_humidity` | přidá se jen při init/pairingu, pokud field existuje |
| `GET /api/v1/display.overlay` | `awtrixng_weather_overlay` | custom enum picker; `none` se mapuje na API `overlay: null` |

Weather overlay capability hodnoty jsou `none`, `drizzle`, `frost`, `rain`, `snow`, `storm`, `thunder`. Změna capability nebo flow action posílá `PATCH /api/v1/display` pouze s polem `overlay`; `overlaySettings` se v první verzi neposílá.

Nepodporované v první NG verzi:

- `lightLevel` se nemapuje do `measure_luminance`, protože není v luxech.
- `batteryPercent` se nemapuje do Homey battery capability; používá se pouze `lowBattery`.
- `pressureHpa` se nemapuje.
- Polling nepřidává nové capabilities; pouze aktualizuje capabilities existující na zařízení.
- `overlaySettings.speed`, `overlaySettings.palette` a `overlaySettings.blend` nejsou v první verzi podporované.

## Chyby a diagnostika

AWTRIX NG API používá standardizovaný error envelope, například:

```json
{
  "error": {
    "code": "validationFailed",
    "message": "out of range",
    "field": "brightness"
  }
}
```

Implementace musí zachovat:

- HTTP status,
- AWTRIX NG error `code`,
- `message`,
- `field`, pokud existuje,
- raw body pro debug/logging.

Nikdy nechytat a neignorovat AWTRIX NG API chyby.

## Explicitně nepodporované nebo UNKNOWN funkce

| Funkce / oblast | Stav | Poznámka |
|---|---|---|
| Automatická migrace AWTRIX 3 zařízení na AWTRIX NG | Nepodporováno | NG je nové zařízení/samostatný driver. |
| Automatická migrace AWTRIX 3 flows na NG flows | Nepodporováno | Uživatel musí vytvořit nové flow karty, pokud původní karta není záměrně sdílená pro oba drivery. |
| AWTRIX 3 JSON options v NG JSON flow | Nepodporováno | NG flow přijímá jen NG-shaped payload. |
| Notification `repeat` | Nepodporováno pro NG notifications | `repeat` je povolené pouze pro pushed apps. |
| Multi-object/array pushed app payload | Nepodporováno | Homey NG driver podporuje jeden JSON object. |
| `clients` forwarding | Nepodporováno | NG dokumentace neuvádí ekvivalent. |
| `barBC` | UNKNOWN / nepodporováno | Bez ověření na zařízení nepředpokládat ekvivalent. |
| Per-app `pos` v pushed app payloadu | Nepodporováno | NG order API je samostatná funkce a nesmí být side effect push app. |
| `overlaySettings.speed`, `overlaySettings.palette`, `overlaySettings.blend` | Odloženo | První verze posílá pouze `overlay`. `speed` je kandidát na budoucí settings-only rozšíření. |
| `overlay: "clear"` | UNKNOWN | Ověřit na zařízení; nepředstírat kompatibilitu. |
| Inline `data:image/...;base64,...` icon prefix | UNKNOWN | NG docs popisují inline base64, ne data URL prefix. |
| Přesná vizuální shoda `gradient`, `rainbow`, `topText`, `effectSettings` | UNKNOWN / vyžaduje device test | Podobná pole neznamenají doloženou renderovací shodu. |
| Flow karty pro built-in app visibility | Nepodporováno v první verzi | Built-in app visibility se ovládá pouze přes device settings. |

## Maintainer zásady

- AWTRIX 3 a AWTRIX NG udržovat jako oddělené implementace.
- Nesdílet runtime abstrakci, která by skrývala nekompatibility.
- Sdílet jen skutečně neutrální pomocný kód, pokud nebude zavádět falešný společný model.
- AWTRIX 3 driver neměnit kvůli NG bez explicitního důvodu.
- NG request/response DTO držet v `lib/awtrixng` a oddělit je od interních Homey/domain typů.
- Unknown/unsupported fields odmítat explicitně; nikdy je potichu nedropovat.
- Nepoužívat AWTRIX 3 endpointy jako fallback pro NG.
- Nepředpokládat kompatibilitu podle podobných názvů endpointů nebo polí.
- Každou nejasnost označit jako `UNKNOWN` a propsat do `docs/awtrix-ng/05-todo-list.md`, pokud jde o budoucí backlog, nebo přímo sem, pokud jde o dlouhodobé maintainer pravidlo.

## Související dokumenty

- `docs/awtrix-ng/01-existing-driver-analysis.md` — analýza existujícího AWTRIX 3 driveru.
- `docs/awtrix-ng/02-api-compatibility-matrix.md` — detailní API srovnání AWTRIX 3 vs. AWTRIX NG.
- `docs/awtrix-ng/03-json-options.md` — user-facing reference podporovaných AWTRIX NG JSON options pro messages a pushed apps.
- `docs/awtrix-ng/05-todo-list.md` — aktuální budoucí backlog po první distribuční iteraci.
- `docs/awtrix-ng/06-user-maintainer-guide.md` — aktuální stav podpory AWTRIX NG a maintainer zásady.
