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

### Ověřený vztah discovery ID a device UID

Na fyzickém AWTRIX NG zařízení bylo 5. srpna 2026 ověřeno, že mDNS TXT hodnota
`id` služby `_awtrixng._tcp` je shodná s `uid` vráceným z `GET /api/v1/device`.
Konkrétní ověřená hodnota byla v obou odpovědích `48e7291211d8`.

Driver proto přiřazuje Homey discovery výsledky k uloženému zařízení podle tohoto ID.
Před přepnutím na nově objevenou adresu navíc vytvoří dočasného klienta, provede
read-only probe a znovu vyžaduje shodu vráceného `uid`. Adresa, port ani aktivní klient
se při neúspěšném probe, chybě autentizace nebo jiném UID nepřepnou.

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
| RTTTL melodie | společná flow karta `playRTTTL`; vyžaduje firmware 1.1.0 nebo novější | `POST /api/v1/audio/play` |
| Custom/pushed app | `application`; JSON options jsou volitelné; duration se nastavuje přes Homey `Add duration`, případně přes JSON options `durationMs` | `PUT /api/v1/apps/pushed/{name}` |
| Raw custom/pushed app | `applicationRaw`, přijímá pouze NG-shaped raw JSON object | `PUT /api/v1/apps/pushed/{name}` |
| Odstranění custom app | společná flow karta `applicationRemove`; legacy AWTRIX 3 karta `removeCustomApp` zůstává deprecated | `DELETE /api/v1/apps/{name}` |
| Další/předchozí app | Homey device tlačítka `button_next`, `button_prev`; samostatné AWTRIX NG flow karty se nepoužívají | `POST /api/v1/apps/next`, `POST /api/v1/apps/previous` |
| Ikony | autocomplete a upload do `/ICONS` | `GET/POST /api/v1/files?dir=/ICONS` |

Verze firmwaru se průběžně přebírá z odpovědi `GET /api/v1/device` při běžném
obnovení stavu zařízení. Ostatní funkce driveru nejsou minimální verzí 1.1.0
omezené; kontrola se provede až při použití RTTTL flow karty. Starší nebo dosud
nezjištěná verze skončí jednotnou chybou `AwtrixNgUnsupportedVersionError` a
audio endpoint se nezavolá.

## Layout karty pro 52×16

Karty **Zobrazit notifikaci s nadpisem** (`awtrixng_notification_header`) a
**Zobrazit aplikaci s nadpisem** (`awtrixng_application_header`) používají stejnou
šablonu: ikona 16×16 vlevo, modrý nadpis zarovnaný na střed horní osmipixelové oblasti a bílý text
v dolní oblasti. Oba řádky používají font `small` a samostatně rolují dlouhý text.
Bez ikony dostane text celou šířku displeje. Dobu zobrazení lze změnit přes běžné
**Přidat dobu trvání**. Bez zadané doby šablona posílá `repeat: 1` a počká na jedno
celé projetí všech rolujících řádků; pokud se text vejde a neroluje, platí výchozí
doba zařízení. Se zadanou dobou posílá jen `durationMs`. Aplikace v rotaci se
vytváří/aktualizuje pod obvyklou interní předponou `homey-`.

Párování ukládá `awtrixng_layout` jen podle `capabilities.layouts.version: 1`.
Filtr obou šablon vyžaduje současně `awtrixng_layout` a `awtrixng_display_16px`;
stejné schopnosti kontroluje i runtime zařízení. Marker 16řádkového displeje zatím
označuje ověřený TC002 52×16. Podpora layoutu sama o sobě se neváže na boardType:
NG zařízení s 32×8 ji může deklarovat a používat vlastní JSON přes stávající raw
karty. Při každém odeslání se znovu ověří rozměry, fonty a limity z API. Starší
zařízení bez explicitní podpory dostane chybu, žádná pole se nevynechávají.

Homey podle své dokumentace nezmění capability filtr při pozdějším přidání
capability; nové šablony proto ověřujeme na nově spárovaném zařízení. Stávající
JSON karty zůstávají použitelné i bez markeru a kontrolují skutečné API. Podrobný
formát a příklad jsou v [JSON options](03-json-options.md#layout-json).

## Audio na TC002 1.1.6

Při párování se podle skutečných audio capabilities uloží marker
`awtrixng_audio_url`. Jen zařízení s tímto markerem mají tyto Flow karty:

- **Přehrát MP3 z URL**: stáhne a přehraje soubor jednou bez uložení na zařízení.
- **Přehrát MP3 ze Soundboardu**: vybere MP3 ze seznamu nainstalovaného Soundboardu,
  při každém spuštění znovu načte jeho aktuální záznam a pošle lokální URL Homey.
- **Zastavit zvuk právě přehrávaného upozornění**: zastaví skupinu `alert`; rádio a
  zvuky skriptů mají samostatné ovládání.

MP3 akce čekají na dokončení a hlásí i chybu stahování z `alert.error`, kterou
počáteční odpověď HTTP 200 ještě neobsahuje. Limit je 4 MB podle firmware a 120 sekund
na spuštění této akce. Po překročení času se zastaví přehrávání, pokud skupina stále
patří původní URL, a Flow skončí chybou. Souběžné URL akce na stejném zařízení se
odmítnou; stop může probíhající akci zrušit. Jiná notifikace může zvuk nahradit,
což akce také oznámí jako přerušení. API nerozlišuje dvě externí přehrání stejné URL
identifikátorem relace.

Soundboard vyžaduje oprávnění `homey:app:com.athom.soundboard` a lokální adresu Homey
dostupnou ze zařízení. Ve výběru jsou pouze MP3; WAV nepřevádíme. Po smazání a
opětovném nahrání zvuku je třeba ve Flow vybrat nový záznam, i když má stejný název.
Přesný počet opakování zatím není samostatná funkce.

Syntetizovaný zvuk se na novém API posílá jako `song` a přehraje se jednou jako
`alert`, který nahradí předchozí upozornění. Starší API používá původní `fx` efekt;
rozdíl je uveden v nápovědě karty. NG legacy zvukové parametry notifikací se převádějí
v NG audio vrstvě. Rozhraní sdílených Flow akcí a AWTRIX 3 driver se kvůli tomu nemění.

## Mixer, rádio a přímé odesílání souborů

Nové zvukové API nabízí celkovou hlasitost a skupiny upozornění, aplikací a rádia.
V Homey jsou posuvníky 0–100 % a karta **Nastavit hlasitost mixeru**. Výsledná
hlasitost je celková hlasitost × hlasitost skupiny / 100. Nula znamená ticho.
Úrovně se načtou při spuštění aplikace a obnovují při minutovém pollingu; změna
z Homey se zapíše ihned. Při restartu získají nové capabilities i již spárovaná
NG zařízení s firmwarem 1.1.6 nebo novějším. AWTRIX 3 se tím nemění.

- **Zastavit zvukovou skupinu**: upozornění, zvuky skriptů, rádio nebo všechny
  skupiny. Původní karta pro zastavení upozornění zůstává kompatibilní.
- **Přehrát uloženou rozhlasovou stanici**: seznam se načítá z hodin.
- **Přehrát internetové rádio z URL**: MP3 stream, případně playlist M3U/PLS.
  Rádio hraje do zastavení. Akce skončí po přijetí příkazu a kontrole aktuální
  chyby; pozdější výpadky připojení nejsou událostí Homey Flow.
- **Uložit rozhlasovou stanici**: přidá stanici nebo změní URL jejího přesného
  názvu. Zachová ostatní stanice; nejvýše 32. Současná uložení z této aplikace
  jsou serializovaná. Současné změny z webového UI nelze zamknout, API nenabízí
  podmíněný zápis.
- **Odeslat zvukový soubor z URL / ze Soundboardu**: Homey stáhne soubor a odešle
  ho jako binární tělo do `audio/clip`. Hodiny soubor neukládají. Podporuje MP3
  a 16bitový PCM WAV; nejvýše 2 MiB. Formát ověří firmware a jeho chyby se
  zachovají. Akce skončí při zahájení přehrávání. Zastavení upozornění nebo všech
  skupin zruší také probíhající přípravu klipu.

Rádio a klipy mají samostatné capability filtry podle `audio.radio` a
`audio.clip`. Mixer a skupiny se rozpoznávají podle nového schématu zvukového
API (`audio.song` a `audio.rtttl` jsou boolean); mixer navíc vyžaduje čtyři platné
úrovně v `GET settings`. Staré API se potichu neemuluje. Přehrání rádia a
přímého klipu bylo na fyzickém TC002 1.1.6 ověřeno se ztišeným masterem.

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
  "repeat": 1,
  "font": "large",
  "scroll": {
    "mode": "loop",
    "holdMs": 500
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
    "mode": "loop",
    "holdMs": 500
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

AWTRIX NG `draw` používá výhradně array příkazy, například `["pixel",0,0,"#FF0000"]`.
Starý AWTRIX 3 objektový formát `{ "dp": [...] }` se nepřevádí a je explicitně odmítnut.

## Settings

### Callbacky tlačítek (AWTRIX NG 1.1.1)

Každé NG zařízení má opt-in checkbox **Ostatní → Povolit callbacky tlačítek**,
ve výchozím stavu vypnutý. Zapnutí vyžaduje zjištěný firmware 1.1.1 nebo
novější; na starší či neznámé verzi skončí chybou před zápisem do zařízení.
Při startu se již zapnutý checkbox na starším firmware jen ohlásí varováním
bez změny `/system`. Vypnutí a odstranění vlastního callbacku zůstává možné
i na starším firmware. Po úspěšném zapnutí Homey zapíše pouze `buttonCallback`
přes `PUT /api/v1/system` a následnou hodnotu ověří. URL používá místní
adresu Homey, nikoli cloud; Homey a AWTRIX proto musí být ve stejné LAN.
Firmware neumí HTTPS ani auth header, takže náhodný per-device token putuje
po LAN nešifrovaným HTTP. Token ani výslednou URL nikdy nedávejte do logu,
screenshotu nebo support reportu.

Firmware 1.1.1 posílá JSON `{"button":"left","state":true,"uid":"..."}`
pro stisk a stejný objekt se `state:false` pro uvolnění. Homey validuje obě
hrany, ale Flow spustí pouze při `true`. Device trigger karty jsou left,
middle a right; `select` není platný callback název. Běžná navigace tlačítek
zůstává aktivní, pokud ji samostatně nezablokuje `blockNavigation`.

Homey spravuje pouze vlastní `managedButtonCallbackUrl`; cizí neprázdnou
URL při zapnutí odmítne a při vypnutí či smazání zařízení ji nepřepisuje.
Store obsahuje také `buttonCallbackToken`, který se při opětovném zapnutí
použije znovu. Při ztrátě tokenu vypněte integraci, ručně vyčistěte
`buttonCallback` přes `PUT /api/v1/system` a opět ji zapněte. Aktuální
hodnotu lze zkontrolovat přes `GET /api/v1/system` (URL nikam nekopírovat).
Při změně místní IP/portu Homey se vlastní URL opraví při dalším startu
zařízení. Warning znamená, že synchronizace selhala nebo callback převzala
jiná integrace. Před vydáním ověřte JSON callback na skutečném Homey a
potvrďte jeden Flow run na stisk i žádný další run při uvolnění.

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

Built-in app checkboxy reprezentují pouze viditelnost dokumentovaných built-in aplikací v app loopu. Při prvním initu nově spárovaného zařízení se synchronizují z `GET /api/v1/apps`; store marker `builtinAppsInitialized: false` brání tomu, aby se před tímto baseline načtením poslaly do zařízení výchozí Homey hodnoty. Při běžném dalším initu se zachovává směr zařízení → Homey.

Driver si samostatně ukládá `builtinAppsFirmwareVersion`, pro kterou byl stav built-in aplikací naposledy úspěšně potvrzen. Jakmile probe při initu, pollingu nebo reconnectu vrátí jiný `device.version`, směr se pro tuto jednu synchronizaci obrátí: aktuální Homey checkboxy se přes `GET /api/v1/apps` a `PUT /api/v1/apps/order` znovu aplikují do zařízení. Nová verze se uloží až po úspěšném zápisu, takže API chyba zůstane viditelná a další poll operaci zopakuje. Stávající zařízení bez nových markerů použijí původní pairing `version`: shodná nebo chybějící verze vytvoří bezpečný baseline ze zařízení, rozdílná verze zachrání dosud uloženou Homey preferenci.

Při každém zápisu se nejdřív načte aktuální inventory, zachová se pořadí a disabled stav ostatních aplikací, vypnuté built-in appky se odeberou z orderu a nově zapnuté dostupné built-in appky se přidají na konec. Pokud uživatel zapne built-in app, kterou zařízení nevrací v inventory, změna se odmítne chybou; nedělá se tiché ignorování.

`onSettings()` nesmí volat `setSettings()`, protože Homey settings jsou během handleru pending. Sync z fyzického zařízení se provádí při initu mimo `onSettings()`.

AWTRIX 3 settings keys se do AWTRIX NG settings nepřenášejí a nemají být dokumentovány jako kompatibilní.

## Homey capabilities a device state

AWTRIX NG driver mapuje jen doložené a podporované capabilities:

| AWTRIX NG field / endpoint | Homey capability | Poznámka |
|---|---|---|
| `batteryPercent` | `measure_battery` | mapuje se hodnota 0–100; capability se přidá jen při init/pairingu, pokud field obsahuje platnou hodnotu |
| `temperature` | `measure_temperature` | přidá se jen při init/pairingu, pokud field existuje |
| `humidity` | `measure_humidity` | přidá se jen při init/pairingu, pokud field existuje |
| `GET /api/v1/display.overlay` | `awtrixng_weather_overlay` | custom enum picker; `none` se mapuje na API `overlay: null` |

Weather overlay capability hodnoty jsou `none`, `drizzle`, `frost`, `rain`, `snow`, `storm`, `thunder`. Změna capability nebo flow action posílá `PATCH /api/v1/display` pouze s polem `overlay`; `overlaySettings` se v první verzi neposílá.

Přítomná hodnota `batteryPercent` v rozsahu 0–100 zpřístupní standardní Homey capability `measure_battery` a její vestavěné Flow cards pro změnu hodnoty a procentní hranice. Driver deklaruje typ baterie jako interní (`energy.batteries: ["INTERNAL"]`). Již spárované zařízení získá procentní capability při následujícím initu; polling nové capabilities nepřidává. Pole `lowBattery` se záměrně nemapuje do `alarm_battery`, protože by vedle procentních triggerů přidalo překrývající se sadu battery-alarm Flow cards. Zařízení spárovaná před tímto rozhodnutím odstraní zastaralou capability při následující úspěšné inicializaci.

Nepodporované v první NG verzi:

- `lightLevel` se nemapuje do `measure_luminance`, protože není v luxech.
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
| Notification `repeat` | Podporováno | `repeat` je společné page pole pro notifications i pushed apps; počítá dokončené průchody scrollujícího textu. |
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
- Při větším upstream update porovnat proti jednomu zaznamenanému commitu minimálně kontrakty
  `/api/v1/device`, `/api/v1/settings`, `/api/v1/apps`, `/api/v1/apps/order`, page payload a
  `/api/v1/system`; poté aktualizovat oba soubory v `docs/vendor` i metadata v
  `docs/vendor/awtrixng-source.md`.
- Každou nejasnost označit jako `UNKNOWN` a propsat přímo sem (dřívější backlog `docs/awtrix-ng/05-todo-list.md` byl po dokončení smazán).

## Související dokumenty

- `docs/awtrix-ng/01-existing-driver-analysis.md` — analýza existujícího AWTRIX 3 driveru.
- `docs/awtrix-ng/02-api-compatibility-matrix.md` — detailní API srovnání AWTRIX 3 vs. AWTRIX NG.
- `docs/awtrix-ng/03-json-options.md` — user-facing reference podporovaných AWTRIX NG JSON options pro messages a pushed apps.
- `docs/awtrix-ng/06-user-maintainer-guide.md` — aktuální stav podpory AWTRIX NG a maintainer zásady.
