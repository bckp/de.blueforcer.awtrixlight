# Implementační plán: AWTRIX NG button callbacks do Homey Flow

## Aktualizace kontraktu 2026-09-15: firmware 1.1.1

Blueforcer ve firmware 1.1.1 změnil callback transport na
`Content-Type: application/json` s objektem
`{"button":"left","state":true,"uid":"dcda0c29dcb8"}`.
Uvolnění tlačítka má `state:false`; názvy tlačítek zůstávají
`left`, `middle`, `right`. Potvrzují to aktuální
[implementace firmware](https://github.com/Blueforcer/awtrix-ng/blob/main/src/system/PeripheryService.cpp)
a [system API dokumentace](https://github.com/Blueforcer/awtrix-ng/blob/main/docs/reference/system.md).

Tato změna nahrazuje níže uvedený historický form-urlencoded kontrakt v §3.2,
form spike M0, form parser v M6 a form release podmínku v §7–8. Aktuální
implementace přijímá JSON objekt nebo raw JSON string/Buffer a vyžaduje
boolean `state`; `true` spouští Flow, `false` jen potvrzuje uvolnění.
Starší výsledek skutečného Homey pro form body (`body: {}`) je historický
negativní test, nikoli blocker pro JSON 1.1.1. Automatické testy neprokazují
doručení JSON na reálném Homey; manuální test před vydáním zůstává nutný.

## Doplnění 2026-09-15: ochrana zapnutí podle firmware

Po reálném testu na firmware 1.1.0 a následně 1.1.1 vlastník výslovně požádal
o minimum 1.1.1 pro zapnutí a opětovnou synchronizaci JSON callbacku. Tento
novější požadavek nahrazuje níže uvedené pravidlo, které zakazovalo firmware
guard pro callback pouze podle existence klíče `buttonCallback` už ve 1.0.14.
Starší firmware sice klíč má, ale neposílá JSON; callback proto nelze s touto
implementací funkčně zapnout. Čtení `/system` a vypnutí vlastního callbacku
zůstávají bez guardu; RTTTL minimum 1.1.0 se nemění. Checkbox s výchozí
hodnotou `false` ani po upgradu nemění žádný existující callback.

JSON callback na skutečném Homey a fyzické stisky left/middle/right na AWTRIX NG
1.1.1 byly ověřeny 2026-09-15: na každý stisk vznikl jeden Flow trigger,
uvolnění nepřidalo druhý. Starý form-urlencoded kontrakt zůstává historický.

## 1. Cíl

Přidat pro samostatný AWTRIX NG driver volitelné přijímání událostí fyzických tlačítek
přes lokální Homey App Web API a vystavit tři device Flow triggery:

- `Left button was pressed`
- `Middle button was pressed`
- `Right button was pressed`

Uživatel funkci zapne checkboxem `buttonCallbackEnabled` v nové skupině
`Miscellaneous` v nastavení konkrétního AWTRIX NG zařízení. Aplikace sestaví lokální URL
Homey, bezpečně ji zapíše do `buttonCallback` na AWTRIX NG a callback přiřadí
ke konkrétnímu spárovanému zařízení podle `uid`.

Tento dokument je implementační zadání. Pokud se při implementaci ukáže rozpor s
potvrzeným kontraktem níže, implementaci zastavit, rozpor zdokumentovat a vyžádat rozhodnutí;
nenahrazovat jej tichým fallbackem.

## 2. Povinné architektonické hranice

Před zahájením přečíst kořenový `AGENTS.md` a zachovat zejména:

- AWTRIX 3 (`lib/awtrix3`, `drivers/awtrixlight`) se nesmí touto funkcí změnit.
- Funkce patří pouze do `lib/awtrixng` a `drivers/awtrixng`.
- NG cesta zůstává `Device -> AwtrixNgApi facade -> AwtrixNgClient`.
- Driver nesmí obejít facade přímým použitím klienta.
- `lib/awtrixng` nesmí importovat `homey` ani nic z `drivers/`.
- Neměnit sdílené rozhraní AWTRIX driverů; callback je NG-only capability.
- Neměnit discovery/probe doménu ani RTTTL firmware guard.
- Nezavádět firmware guard `>= 1.1.0` pro callback. `buttonCallback` je doložen už ve
  vendored kontraktu firmware 1.0.14; guard 1.1.0 zůstává pouze pro RTTTL.
- Nikdy nechytit a nezahodit NG API chybu. Zachovat HTTP status, NG error code, message a field.
- Neupravovat ručně generovaný `app.json`; upravovat Compose zdroje a poté spustit build.

## 3. Potvrzené upstream kontrakty

### 3.1 AWTRIX NG system API

- Zdroj konfigurace: `GET /api/v1/system`.
- Částečný zápis: `PUT /api/v1/system` s JSON objektem.
- Pro tuto funkci posílat výhradně `{ "buttonCallback": "<url>" }` nebo
  `{ "buttonCallback": "" }`.
- `PUT` vrací kompletní resulting system objekt. Odpověď se musí validovat a její
  `buttonCallback` se musí rovnat požadované hodnotě. AWTRIX neznámé system klíče tiše
  ignoruje, proto pouhý status 200 není důkaz, že byl správný klíč aplikován.
- Prázdný string callback vypíná a změna se aplikuje bez restartu.

Zdroje:

- vendored snapshot: `docs/vendor/awtrixng-http-api.md`, firmware 1.0.14
- aktuální dokumentace:
  <https://github.com/Blueforcer/awtrix-ng/blob/main/docs/reference/system.md#buttons>
- implementace system endpointu:
  <https://github.com/Blueforcer/awtrix-ng/blob/main/src/transport/http/HttpApiServer.cpp>

### 3.2 Callback z firmware

AWTRIX odesílá `POST` s:

```text
Content-Type: application/x-www-form-urlencoded

button=<left|middle|right>&state=<1|0>&uid=<mac>
```

Platí:

- Jeden fyzický stisk vytvoří dvě volání: `state=1` při stisku a `state=0` při uvolnění.
- Flow se spouští jen pro `state=1`; `state=0` se validuje, ale potvrzuje bez triggeru.
- Prostřední tlačítko se v HTTP callbacku jmenuje `middle`, nikoliv `select`.
- `uid` je lowercase MAC bez dvojteček. Je shodné s `device.uid` a s `data.id`, které aplikace
  ukládá při pairingu.
- `swapButtons` a `rotate` nemění callback jména; callback hlásí fyzické zapojení.
- Callback běží souběžně s normální navigací. `blockNavigation` nemá callback vypnout.
- Firmware používá pouze `http://`, neposílá auth header, nesleduje redirect a nedělá retry.
- Connect timeout i response timeout jsou 300 ms. Handler musí odpovědět bez čekání na
  dokončení Flow.

Zdroj implementace:
<https://github.com/Blueforcer/awtrix-ng/blob/main/src/system/PeripheryService.cpp>

### 3.3 Homey

- Lokální adresu a port získat přes `await homey.cloud.getLocalAddress()`.
- App API cesta je `/api/app/de.blueforcer.awtrixlight/...`.
- Endpoint musí být `public: true`, protože AWTRIX neumí poslat Homey bearer token.
- Aplikace je již `platforms: ["local"]`; nepřidávat cloudovou větev.
- Flow karty mají být device triggers. Homey pak samo zobrazí výběr zařízení a
  `FlowCardTriggerDevice.trigger(device)` spustí jen Flow navázané na danou instanci.

Zdroje:

- <https://apps.developer.homey.app/advanced/web-api>
- <https://apps-sdk-v3.developer.homey.app/ManagerCloud.html#getLocalAddress>
- <https://apps.developer.homey.app/the-basics/flow#flow-device-trigger-cards>

Neověřený bod: veřejná Homey dokumentace garantuje automatické parsování JSON body,
ale výslovně negarantuje `application/x-www-form-urlencoded`. Implementace musí akceptovat
objekt i raw string/Buffer a před publikací musí proběhnout integrační test na skutečném Homey.
Pokud Homey request odmítne ještě před vstupem do handleru, jde o skutečný blocker a nesmí se
maskovat jiným předpokladem.

**Integrační výsledek 2026-08-15:** Na skutečném Homey došel form-urlencoded callback do
App API handleru jako `body: {}`; kontext obsahoval pouze dokumentované `query`, `params`,
`body` a `homey`. Stejný callback s JSON body prošel a vrátil `{ "ok": true }`. Aktuální
firmware kontrakt je proto s lokálním Homey App Web API nekompatibilní. Owner odmítl vlastní
HTTP listener v aplikaci; publikace funkce je blokovaná, dokud firmware nezíská JSON callback
nebo jiný explicitně schválený transport.

## 4. Pevná produktová rozhodnutí

### 4.1 Názvy

- Homey setting: `buttonCallbackEnabled`
- Store secret: `buttonCallbackToken`
- Store vlastněné URL: `managedButtonCallbackUrl`
- App API route name: `awtrixNgButtonCallback`
- App API path: `/awtrixng/button/:uid/:token`
- Trigger IDs:
  - `awtrixng_button_left_pressed`
  - `awtrixng_button_middle_pressed`
  - `awtrixng_button_right_pressed`

Názvy triggerů obsahují `pressed`, protože Flow se spouští na hraně `state=1`, ne až po
uvolnění kompletního clicku.

### 4.2 Bezpečnost a vlastnictví callbacku

- Pro každé Homey device vygenerovat `crypto.randomBytes(32).toString('hex')`.
- Token uložit pouze do device store. Nedávat ho do Homey settings, Flow tokenů ani logu.
- Callback URL ani callback body nelogovat, protože URL obsahuje secret.
- Při callbacku ověřit token konstantním časem (`crypto.timingSafeEqual`) po kontrole stejné
  délky.
- Ověřit současně route `uid`, body `uid`, nalezené `device.getData().id` a aktivní checkbox.
- Nespoléhat na source IP; Homey ji ve stabilním App API kontraktu nevystavuje.
- Token jde po LAN plaintextem, protože firmware neumí HTTPS. Tuto upstream limitaci uvést
  v hintu a maintainer dokumentaci.

### 4.3 Cizí callback se nesmí přepsat

Při zapnutí nejprve přečíst `GET /api/v1/system`:

| Aktuální hodnota na AWTRIX | Akce |
|---|---|
| prázdná | zapsat požadovanou Homey URL |
| rovna požadované Homey URL | považovat za synchronizované; neprovádět PUT |
| rovna dříve uloženému `managedButtonCallbackUrl` | bezpečně nahradit novou Homey URL |
| libovolná jiná neprázdná URL | odmítnout aktivaci s jasnou chybou; nic nepřepisovat |

Při vypnutí:

- Vymazat pouze callback shodný s požadovanou nebo uloženou spravovanou Homey URL.
- Pokud je callback prázdný, pouze dokončit vypnutí.
- Pokud mezitím obsahuje jinou URL, ponechat ji beze změny; uživatel vypíná Homey integraci,
  ne cizí integraci.
- Po úspěšném vypnutí odstranit `managedButtonCallbackUrl`; token lze ponechat pro stabilní
  opětovnou aktivaci.

Nový checkbox má default `false`. Při startu existujícího zařízení s hodnotou `false`
neprovádět `GET /system`, `PUT /system` ani mazání. Tím upgrade nemůže odstranit callback,
který si uživatel nakonfiguroval mimo Homey.

## 5. Cílový datový tok

```text
AWTRIX NG button edge
  -> POST local Homey App API (public URL + per-device token)
  -> api.ts normalizes form body
  -> AwtrixNgDriver finds Device by route uid
  -> Device verifies enabled setting + token + body uid
  -> Driver maps left/middle/right to one Device Trigger Card
  -> trigger(device) starts only Flows for that AWTRIX NG device
```

## 6. Implementační kroky podle vrstev

### M0 - Integrační spike Homey form body

Před publikací, ideálně na začátku implementace:

1. Vystavit dočasně lokální POST handler stejným mechanismem jako finální route.
2. Poslat z LAN:

   ```bash
   curl -X POST 'http://<homey>/api/app/de.blueforcer.awtrixlight/awtrixng/button/test/test' \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     --data 'button=left&state=1&uid=test'
   ```

3. Potvrdit, že handler dostane buď objekt s poli, nebo raw body, které lze parsovat.
4. Dočasné echo/debug chování před dokončením odstranit; nikdy nelogovat skutečný token.

Bez dostupného Homey lze implementaci a unit testy dokončit, ale release acceptance zůstává
nesplněná, dokud tento test neproběhne.

### M1 - Typy a low-level klient

Upravit `lib/awtrixng/Api/Types.ts`:

- Přidat explicitní `AwtrixNgApiSystemPatch` pouze s podporovaným
  `buttonCallback: string`.
- Přidat strukturální `AwtrixNgApiSystemResponse`, který dovolí ostatní upstream pole, ale
  neposkytuje iluzi, že aplikace typuje všech 67 system fields. Pro tuto funkci je kontraktem
  pouze runtime-validovaný `buttonCallback`.

Upravit `lib/awtrixng/Api/Client.ts`:

- `getSystem()` -> `GET /api/v1/system`
- `putSystem(patch)` -> `PUT /api/v1/system` s přesně předaným JSON patchem
- Nepřidávat obecný arbitrary system writer.
- Chyby nechat projít stávajícím `#request` a `parseAwtrixNgApiError`.

Testy v `test/awtrixng-client.test.js`:

- přesná metoda, cesta a body pro GET/PUT
- input patch se nemutuje
- 4xx/5xx stále zachová status a NG error envelope

### M2 - Protokolová button callback služba

Přidat `lib/awtrixng/Services/ButtonCallback.ts`:

- `AwtrixNgButtonCallbackClient` s minimálním `getSystem`/`putSystem` kontraktem.
- Funkci pro načtení aktuální URL.
- Funkci pro zápis URL.
- Runtime validaci, že odpověď je plain object a `buttonCallback` je string.
- Po PUT validaci, že vrácená hodnota přesně odpovídá požadavku.
- Při wrong shape nebo mismatch vyhodit `AwtrixNgInvalidResponseError` s endpointem
  `/api/v1/system`; nevracet prázdný fallback.
- Volitelně doménový conflict error bez Homey závislosti, pokud pomůže testovatelnosti.

Přidat `test/awtrixng-button-callback-service.test.js`:

- platný GET
- wrong-shaped GET
- GET bez `buttonCallback`
- platný PUT a přesný patch
- PUT response mismatch
- API chyba se nezabalí do obecného erroru

### M3 - Facade

Upravit `lib/awtrixng/Api/Api.ts`:

- Vystavit pouze doménové operace, např.:
  - `readButtonCallback(): Promise<string>`
  - `writeButtonCallback(url: string): Promise<void>`
- Delegovat do nové služby; driver nesmí importovat klienta nebo službu přímo.
- Nevystavovat Homey URL construction ani token management v `lib/awtrixng`.

Doplnit `test/awtrixng-api-facade.test.js` o delegaci, validaci odpovědi a error propagation.

### M4 - Rozlišení Homey-local a connection settings

Upravit `lib/awtrixng/Services/Settings.ts`:

- `buttonCallbackEnabled` je Homey-local setting: nikdy nesmí vstoupit do
  `PATCH /api/v1/settings`.
- Zachovat samostatnou detekci connection changes jen pro `address`, `port`, `authUser`,
  `authPass`. Nepoužívat obecné `hasAwtrixNgLocalSettingsChange` tak, aby samotný checkbox
  zbytečně vytvářel a commitoval connection candidate.
- Doporučené rozhraní:
  - `isAwtrixNgLocalSettingsField` zahrnuje connection fields i `buttonCallbackEnabled`.
  - `hasAwtrixNgConnectionSettingsChange` kontroluje pouze čtyři connection fields.
- Validovat, že callback setting je boolean, když je mezi `changedKeys`.
- Neznámé settings klíče nadále explicitně odmítat.

Rozšířit `test/awtrixng-settings-transformer.test.js`:

- callback checkbox je local field
- nevytvoří settings patch
- není connection change
- neboolean hodnota je odmítnuta
- ostatní unknown field se nadále odmítá

### M5 - Nastavení a URL/token lifecycle v Device

Upravit `drivers/awtrixng/driver.settings.compose.json`:

- Přidat poslední skupinu `Miscellaneous`.
- Přidat checkbox `buttonCallbackEnabled`, default `false`.
- Label: `Enable button callbacks`.
- Hint musí vysvětlit, že callback používá lokální HTTP adresu Homey, funguje pouze
  na stejné LAN a tlačítka si ponechávají normální navigační funkci.

Upravit typy v `drivers/awtrixng/device.ts`:

- `AwtrixNgDeviceSettings.buttonCallbackEnabled?: boolean`
- `AwtrixNgDeviceStore.buttonCallbackToken?: string`
- `AwtrixNgDeviceStore.managedButtonCallbackUrl?: string`

Přidat privátní helpers:

- `getOrCreateButtonCallbackToken()`
- `buildButtonCallbackUrl(uid, token)`
- `isManagedButtonCallbackToken(token)`
- `enableButtonCallback(api)`
- `disableButtonCallback(api)`
- `reconcileButtonCallback(api, settings)`
- `clearOwnedButtonCallbackOnDelete()`

URL construction:

1. `await this.homey.cloud.getLocalAddress()`.
2. Pokud vrácená hodnota nemá scheme, doplnit `http://`.
3. Parsovat pomocí `URL`, ne string concatenation; tím zachovat port a IPv6 brackets.
4. Vyžadovat protokol `http:`. Jiný protokol odmítnout s jasnou chybou.
5. Nastavit path `/api/app/de.blueforcer.awtrixlight/awtrixng/button/<encoded uid>/<encoded token>`.
6. Nezachovávat neznámý path, query nebo fragment z local base address.

#### Upravený `onSettings` pipeline

Současný early return pro connection settings nahradit jedním explicitním pipeline:

1. Pure validation všech changed keys před prvním requestem.
2. Pokud se mění connection fields, vytvořit a identity-checknout candidate API; jinak použít
   aktivní API.
3. Na zvoleném API aplikovat standard settings/apps změny.
4. Pokud se změnil `buttonCallbackEnabled`, provést enable/disable algoritmus na stejném API.
5. Teprve po úspěchu všech kroků commitnout connection candidate.
6. Zachovat existující deferred `setSettings` migraci, poll lifecycle a refresh state.

Pořadí je sekvenční a fail-fast. API nenabízí transakci; pokud pozdější krok selže,
dřívější device write už mohl být aplikován. Toto odpovídá stávajícímu kontraktu
NG settings a nesmí se skrývat pomocí `allSettled`.

#### Startup reconciliation

Po úspěšné inicializační detekci:

- Je-li checkbox `false`, nedělat nic.
- Je-li `true`, spočítat aktuální požadovanou URL a porovnat ji s `/system`.
- Prázdnou nebo dříve vlastněnou URL bezpečně opravit. Tím se opraví reset firmware nebo
  změna lokální IP/portu Homey.
- Cizí URL nepřepsat.
- Callback sync je volitelná funkce a nemá znefunkčnit všechny ostatní AWTRIX operace.
  Chybu zalogovat a zobrazit přes `setWarning`; nesmí být tiše ignorována.
- Po úspěšné synchronizaci odstranit callback warning. Protože dnes driver jiné warnings
  nepoužívá, lze použít `unsetWarning`; při budoucím rozšíření warning ownership přehodnotit.

Stejnou reconciliation provést při aktivaci ověřeného candidate connection a po úspěšném
rediscovery connection commit, pokud je checkbox aktivní. Nepřidávat `/system` do každého
60sekundového pollu.

#### Delete lifecycle

V `onDeleted()`:

- Před zahozením API se pokusit přečíst callback a vymazat jej pouze při shodě s vlastněnou URL.
- Chybu zalogovat, ale neblokovat odstranění zařízení. Nejde o ignorovanou chybu: je explicitně
  reportovaná a cleanup je best-effort, protože Homey musí být schopné device odstranit offline.
- Zachovat stop pollu a invalidaci icons.

Rozšířit `test/awtrixng-device-settings.test.js` a případně přidat samostatný device callback test:

- enable nad prázdným callbackem
- enable už synchronizované URL bez PUT
- update staré vlastněné URL po změně Homey adresy
- conflict s cizí URL bez PUT
- disable vlastní URL
- disable prázdné URL
- disable nepřepíše cizí URL
- token se vytvoří jednou a znovu použije
- token/URL nejsou v logu
- callback-only save nevytváří connection candidate
- kombinovaná connection + callback změna použije candidate credentials/base URL
- API failure zabrání connection activation a zachová detail NG chyby
- startup s checkboxem false nesahá na `/system`
- startup reconciliation failure nastaví warning, ale device zůstane dostupné
- deletion maže pouze vlastněnou URL a cleanup failure loguje

### M6 - Příjem a validace callbacku v driver layer

Přidat `drivers/awtrixng/button-callback.ts` jako Homey/protocol adapter bez importu z
`lib/awtrix3` nebo jiného driveru.

Definovat:

- `AwtrixNgButton = 'left' | 'middle' | 'right'`
- normalizovaný event `{ button, pressed, uid }`
- parser, který přijme:
  - plain object z Homey routeru
  - raw string
  - Buffer
- raw hodnoty parsovat přes `URLSearchParams`.
- Povolit pouze `state` string `"0"` nebo `"1"`; boolean/number tiše nekoercovat.
- Vyžadovat non-empty `uid` a známé button jméno.
- Extra fields lze ignorovat až po validaci podporovaných polí; neinterpretovat je.

Upravit `drivers/awtrixng/driver.ts`:

- V `onInit()` získat tři `FlowCardTriggerDevice` instance.
- Přidat veřejný handler volaný App API adapterem.
- Najít device přes `getDevice({ id: routeUid })`; callback nesmí hledat AWTRIX 3 driver.
- Ověřit body uid, enabled setting a per-device token.
- Pro `state=0` vrátit úspěšné přijetí bez Flow triggeru.
- Pro `state=1` mapovat button na přesně jednu kartu.
- Flow trigger spustit fire-and-report: nečekat na jeho dokončení před HTTP odpovědí,
  ale Promise opatřit `.catch(this.error.bind(this))`, aby chyba nebyla unhandled ani ignorovaná.
- Neplatný token, uid nebo payload nesmí triggerovat Flow ani zveřejnit, která část neseděla.
  Vrátit jednotný neúspěšný výsledek bez logování secretu.

Přidat `test/awtrixng-button-callback.test.js`:

- object, string a Buffer parsing
- všechna tři tlačítka
- `middle`, zatímco `select` je odmítnuto
- `state=1` triggeruje jednou
- `state=0` netriggeruje
- neplatný state/button/uid/body
- route/body uid mismatch
- unknown device
- vypnutý checkbox
- chybný token a token jiného device
- trigger rejection se zaloguje a nezpůsobí unhandled rejection
- callback handler vrátí dříve, než se Flow Promise dokončí

### M7 - Homey App API

Upravit `.homeycompose/app.json`:

```json
"api": {
  "awtrixNgButtonCallback": {
    "method": "POST",
    "path": "/awtrixng/button/:uid/:token",
    "public": true
  }
}
```

Pokud již `api` existuje, pouze přidat route; nepřepisovat jiné endpointy.

Přidat root `api.ts` v CommonJS stylu kompatibilním se současným projektem:

- Exportované jméno handleru musí přesně odpovídat manifest route key.
- Handler převezme `homey`, `params`, `body`.
- Deleguje na instanci `awtrixng` driveru přes `homey.drivers.getDriver('awtrixng')`.
- Neobsahuje doménové API zápisy ani Flow mapping.
- Vrátí malou okamžitou JSON odpověď, např. `{ ok: true }` nebo `{ ok: false }`.
- Do odpovědi ani logu nikdy nevracet token, URL nebo kompletní body.

Přidat test compose/entrypointu:

- route je jediný záměrně public endpoint této funkce
- metoda je pouze POST
- cesta obsahuje uid i token
- generated `app.json` obsahuje route
- `api.ts` po buildu exportuje handler pod správným jménem

### M8 - Device Flow karty

Přidat `drivers/awtrixng/driver.flow.compose.json` se třemi trigger cards. Protože soubor
patří driveru, Homey je automaticky prezentuje jako device cards pouze AWTRIX NG zařízení.
Nepřidávat globální device argument do `.homeycompose/flow/triggers`.

Každá karta:

- má výše stanovené ID
- má anglický title bez argumentů
- nemá run listener ani tokens/state, protože filtrování zařízení provede
  `FlowCardTriggerDevice.trigger(device)`
- není dostupná pro AWTRIX 3

Rozšířit `test/awtrixng-flow-compose.test.js` nebo přidat trigger-specific test:

- generated manifest obsahuje přesně tři nové NG device triggers
- ID a titles sedí
- AWTRIX 3 driver je neobsahuje
- nevznikly tři globální duplikáty

### M9 - Uživatelské chyby, warning a dokumentace

Upravit `locales/en.json` minimálně o:

- konflikt s již nakonfigurovaným cizím callbackem
- nemožnost sestavit podporovanou lokální HTTP adresu Homey
- startup callback synchronization warning

Chyby z AWTRIX API neobalovat způsobem, který odstraní status/code/message/field. Lokalizovaný
kontext lze přidat pouze tak, aby původní detail zůstal dohledatelný.

Rozšířit `docs/awtrix-ng/06-user-maintainer-guide.md`:

- kde se checkbox zapíná
- lokální-only a plaintext HTTP omezení
- dva callbacky na jeden fyzický stisk a filtrování `state=1`
- vlastnictví callbacku a conflict behavior
- store keys a postup regenerace/recovery
- jak ručně ověřit `/api/v1/system`
- jak diagnostikovat změnu Homey IP nebo warning

Vendored API soubory kvůli této funkci neobnovovat: snapshot 1.0.14 již endpoint i pole
obsahuje. Pokud by se dělal samostatný upstream refresh, musí se aktualizovat Markdown,
OpenAPI i `docs/vendor/awtrixng-source.md` ze stejného commitu podle jeho pravidel.

## 7. Testovací matice

### Automatizované testy

Po každém milestone spustit relevantní test; před předáním povinně:

```bash
npm run lint
npm test
```

Povinné invarianty:

- stávající AWTRIX 3 testy procházejí beze změny chování
- structure test stále brání cross-layer importům
- API error tests dokazují zachování NG detailů
- build vygeneruje validní `app.json` a `.homeybuild/api.js`
- testy neobsahují skutečné síťové requesty ani fixní produkční secret

### Manuální test na skutečném Homey a AWTRIX NG

1. Nainstalovat build na lokální Homey.
2. Nechat checkbox vypnutý a ověřit, že existující cizí callback zůstane beze změny.
3. Callback na AWTRIX vyčistit, checkbox zapnout a přes `GET /api/v1/system` potvrdit lokální
   Homey URL. URL ani token nevkládat do issue/logu.
4. Vytvořit tři Flows pro jedno zařízení a stisknout každé tlačítko.
5. Potvrdit právě jeden Flow run na fyzický stisk; release edge nesmí spustit druhý run.
6. Potvrdit, že `middle` funguje a left/right zůstávají fyzická jména i při rotate/swap.
7. Potvrdit normální navigaci s `blockNavigation=false` a callback-only chování s
   `blockNavigation=true` podle firmware.
8. Se dvěma NG zařízeními potvrdit, že stisk na A nespustí Flow vybraný pro B.
9. Zapnout AWTRIX API auth a zopakovat enable/disable; system GET/PUT musí použít uložené
   credentials.
10. Změnit nebo nasimulovat starou `managedButtonCallbackUrl`, restartovat app a potvrdit
    bezpečnou reconciliation.
11. Nastavit na AWTRIX cizí callback a potvrdit, že enable skončí konfliktem bez přepsání.
12. Checkbox vypnout a potvrdit vymazání pouze Homey-owned URL.
13. Znovu zapnout, odstranit device z Homey a potvrdit best-effort cleanup.
14. Dočasně znepřístupnit Homey endpoint a potvrdit pouze známou upstream limitaci stutteru;
    aplikace nesmí tvrdit, že firmware retry udělá.

## 8. Akceptační kritéria

Implementace je hotová pouze pokud platí vše:

- AWTRIX NG settings obsahuje opt-in checkbox, default false.
- Zapnutí použije lokální Homey adresu, ne cloud URL.
- Na AWTRIX se posílá pouze explicitní `/system` patch s `buttonCallback`.
- Resulting system response se validuje, nikoli pouze HTTP status.
- Veřejný endpoint je chráněn per-device náhodným tokenem.
- Token ani callback URL se neobjeví v logu, UI nebo Flow tokens.
- Route uid, body uid, paired device id, enabled setting a token se shodují.
- Release (`state=0`) nikdy nespustí Flow.
- Left/middle/right spouští právě jednu odpovídající device trigger kartu.
- Uživatel v Homey vybírá konkrétní NG zařízení standardním device Flow mechanismem.
- Cizí callback se nikdy tiše nepřepíše ani nesmaže.
- Upgrade s default false nesahá na existující callback.
- Změna lokální adresy je napravena startup reconciliation pouze pro vlastněnou URL.
- Callback API chyby zachovají standardní NG error detaily.
- AWTRIX 3, discovery/probe a RTTTL version logic zůstávají funkčně beze změny.
- `npm run lint` a kompletní `npm test` procházejí.
- Form-urlencoded request byl ověřen na skutečném Homey.

## 9. Doporučené pořadí předání

Implementovat v pořadí M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8 -> M9.
Po M3 musí být hotový a otestovaný samostatný NG API kontrakt. Po M6 musí jít callback
parser a device mapping testovat bez Homey sítě. Teprve potom spojit public route a Flow compose.

Před implementací zaznamenat `git status --short`. Existující uživatelské změny nevracet ani
nepřepisovat. Nedělat commit ani publikaci bez explicitního pokynu vlastníka.
