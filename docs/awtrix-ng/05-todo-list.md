# AWTRIX NG TODO list

Tento dokument obsahuje pouze aktuální budoucí backlog po dokončení první distribuovatelné AWTRIX NG iterace. Historické implementační plány byly odstraněny; aktuální stav a maintainer pravidla jsou v `docs/awtrix-ng/06-user-maintainer-guide.md`.

## 1. Weather overlay settings

### Stav

Odloženo.

### Kontext

První distribuční verze podporuje pouze základní weather overlay:

- Homey capability `awtrixng_weather_overlay`,
- flow action `weatherOverlay` registrovaná v app-level/shared vrstvě a omezená přes device filter na AWTRIX NG driver,
- `GET /api/v1/display`,
- `PATCH /api/v1/display` s polem `overlay`.

Neposílá se `overlaySettings`.

### Možné budoucí rozšíření

- Přidat `overlaySettings.speed` jako settings-only položku, pokud bude UX dávat smysl.
- `overlaySettings.palette` a `overlaySettings.blend` řešit až po samostatném návrhu, protože zasahují do vizuálního modelu AWTRIX NG.

### Zásady

- Nepřidávat flow pro `overlaySettings.speed`, pokud nebude konkrétní use-case.
- Neposílat `overlaySettings` částečně nebo s defaulty, dokud uživatel hodnotu explicitně nenastaví.
- Neodvozovat chování z AWTRIX 3 overlay modelu.

## 2. Skutečné lux měření

### Stav

Čeká na případnou podporu ve firmware/API.

### Kontext

AWTRIX NG `lightLevel` je relativní hodnota 0–100 %, ne lux. Proto se nemapuje do Homey `measure_luminance`.

### Budoucí možnost

Pokud AWTRIX NG doplní samostatné pole v luxech, lze znovu zvážit přidání Homey capability `measure_luminance`.

### Zásady

- Nemapovat `lightLevel` do `measure_luminance`.
- Nepřidávat náhradní procentní luminance capability jen kvůli podobnosti názvu.

## 3. Vizuální payload rozdíly, které vyžadují device test

### Stav

Volitelné budoucí ověření.

### Kandidáti

- Přesná vizuální shoda `topText` vs. NG `textInFront`.
- Přesná vizuální shoda AWTRIX 3 `gradient` / `rainbow` vs. NG `palette`.
- Chování NG `effectSpeed`, `palette` a `paletteBlend` proti AWTRIX 3 `effectSettings`.
- Význam a případná podpora `overlay: "clear"` v NG payloadu.
- Podpora inline `data:image/...;base64,...` icon prefixu v NG payloadu.

### Zásady

- Každou neověřenou vizuální shodu označit jako `UNKNOWN`.
- Nepřidávat AWTRIX 3 compatibility mapping, který by jen přibližně emuloval chování.
- Pokud bude něco ověřeno na zařízení, propsat výsledek do `docs/awtrix-ng/06-user-maintainer-guide.md`.

## 4. Application flow cleanup

### Stav

Hotovo pro aktuální iteraci.

### Kontext

Aktuální stav application/custom app flow karet:

- `customApp` je deprecated AWTRIX 3-only flow karta ponechaná kvůli existujícím flow.
- `application` je shared flow karta pro AWTRIX 3 i AWTRIX NG.
- `applicationRaw` je AWTRIX NG-only flow karta pro vytvoření/aktualizaci aplikace čistě přes raw JSON payload, ale je registrovaná v app-level/shared vrstvě.
- `applicationRemove` je sjednocená pro AWTRIX 3 i AWTRIX NG.

Přestože AWTRIX 3 a AWTRIX NG používají rozdílné payloady a endpointy, uživatel pracuje s podobným konceptem jako u notifikací. Notifikační flow karty už byly sjednoceny tak, že flow karta zůstává společná a driver-specific vrstva převádí argumenty do správného formátu pro dané zařízení.

### Hotové rozhodnutí pro `application`

- Legacy AWTRIX 3 flow karta `customApp` je `deprecated`, aby se nerozbily existující flow, ale nově se už nenabízela.
- Flow karta `application` je dostupná pro oba drivery:
  - `driver_id=awtrixlight|awtrixng`.
- `application` je registrovaná jako shared flow action podobně jako `notification`.
- Shared dispatch vrstva podle `getAwtrixDeviceType()` převádí argumenty do správného formátu:
  - AWTRIX 3 → existující AWTRIX 3 custom app API/payload,
  - AWTRIX NG → existující AWTRIX NG application API/payload.
- Nepředstírá se plná kompatibilita payloadů; transformují se pouze explicitně podporované argumenty.

### Hotové rozhodnutí pro `applicationRaw`

- `applicationRaw` zůstává dostupná pouze pro AWTRIX NG:
  - `driver_id=awtrixng`.
- Registrace listeneru je přesunutá do app-level/shared vrstvy, aby NG driver neobsahoval flow registrace, které lze bezpečně chránit compose filtrem a explicitním runtime device-type guardem.
- AWTRIX 3 nemá aktuálně plnohodnotnou samostatnou JSON-only alternativu pro aplikace.
- Pokud by `applicationRaw` bylo v budoucnu rozšířeno i pro AWTRIX 3, musí jít o samostatné explicitní rozhodnutí a testy, ne tiché mapování.

### Implementované rozhodnutí pro `application`

- Společný color argument je `color`.
  - Důvod: aktuální shared flow karty `notification`, `notificationSticky` a `indicator` používají uživatelský argument `color`.
  - AWTRIX NG driver-specific vrstva si `color` mapuje na API pole `textColor`, stejně jako už dnes `notification` mapuje shared `color` na NG `textColor`.
- Společná `application` karta obsahuje `duration`.
  - Používá se Homey duration přístup stejně jako u notifikací.
  - Driver-specific vrstva převádí hodnotu do formátu daného zařízení.

### Testy pokrývající `application`

- `customApp` je označené jako deprecated pro AWTRIX 3.
- `application` je dostupná pro oba drivery přes `driver_id=awtrixlight|awtrixng`.
- `application` dispatchuje správně pro AWTRIX 3 i AWTRIX NG.
- Shared `color` se pro AWTRIX NG mapuje na `textColor`.
- Shared `duration` používá Homey duration přístup a driver-specific vrstva jej převede do správné jednotky/formátu.

### Zásady

- Neměnit AWTRIX 3 runtime chování; nové shared cesty musí zachovat legacy karty funkční a pouze je označit jako deprecated.
- Zachovat staré flow ID `customApp` funkční pro existující uživatele.
- Nepřevádět AWTRIX NG payload na AWTRIX 3 kompatibilní model ani opačně mimo explicitně podporované argumenty.
- Pokud některý argument nepůjde bezpečně namapovat, musí být rozhodnut explicitně před implementací.
- NG-only flow karta může být registrovaná v app-level/shared vrstvě, pokud compose filter stále brání jejímu použití s AWTRIX 3 zařízením a shared wrapper má explicitní runtime guard.

