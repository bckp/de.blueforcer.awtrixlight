# Analýza kódu – de.blueforcer.awtrixlight

> Vypracováno: 2026-08-05 · Rozsah: `app.ts`, `drivers/**`, `lib/**`, `.homeycompose/**`, `test/**`, `docs/**`
> Stav repozitáře: commit `f596dc9` („Bump 2.0.1"), pracovní strom čistý.
> **V rámci této analýzy nebyl změněn žádný zdrojový soubor.**
>
> **Pozn. (po vydání 2.2.0):** doprovodné dokumenty `claude-remediation-plan.md` a
> `code-audit-2026-08-05.md` byly po dokončení náprav smazané. Jsou dohledatelné
> v git historii do commitu `8dcf85d`.
> – překryv a doplňky viz sekce 9.

## 0. Výchozí předpoklad

Drivery **Awtrix3** (`drivers/awtrixlight` + `lib/awtrix3`) a **AwtrixNG** (`drivers/awtrixng` + `lib/awtrixng`)
jsou záměrně oddělené vrstvy. Celý dokument tento předpoklad respektuje:

- **Nikde není navrženo slučování driverů, klientů, poll tříd, typů payloadů ani normalizérů napříč vrstvami.**
- Podobnosti mezi `lib/awtrix3` a `lib/awtrixng` (např. `Poll` vs. `AwtrixNgPoll`, `Client` vs. `AwtrixNgClient`)
  jsou v sekci 6 explicitně označené jako **záměrné a doporučené k ponechání**.
- Všechny nálezy typu „duplicita" v sekcích 3 se týkají výhradně duplicit **uvnitř jedné vrstvy**
  nebo uvnitř sdílené app-level vrstvy (`app.ts`, `drivers/shared-flow-actions.ts`, `.homeycompose`).

## 1. Ověřený stav

| Kontrola | Výsledek |
|---|---|
| `npx tsc --noEmit` | ✅ 0 chyb |
| `npm run build && node --test test/*.test.js` | ✅ 206 testů, 0 selhání |
| `npm run lint` | ✅ prochází bez chyb (ověřeno maintainerem na macOS) – viz T1 k varování o verzi TS |
| Registrace flow karet vs. `app.json` | ⚠️ 1 osiřelá karta (`applicationIcon`) |
| Assety deklarované v `app.json` | ⚠️ 1 chybějící soubor (`awtrixlight/.../xlarge.png`) |

Rozvržení kódu (TS, bez testů): ~6 150 řádků.
Největší soubory: `lib/awtrixng/Payload/Transformers.ts` (669), `drivers/awtrixng/driver.ts` (584),
`drivers/awtrixlight/device.ts` (491), `drivers/shared-flow-actions.ts` (370), `lib/awtrix3/Normalizer.ts` (326).

## 2. Chyby a rizika

Seřazeno podle dopadu.

### B1 – `applicationIcon` je flow karta bez run listeneru · **vysoký**

`.homeycompose/flow/actions/applicationIcon.json` je zkompilovaná do `app.json`, ale
`registerRunListener` pro ni neexistuje nikde v kódu:

- `app.ts:26–66` registruje 12 sdílených karet, `applicationIcon` mezi nimi není,
- `drivers/awtrixlight/driver.ts:47–75` registruje `notificationIcon`, `notificationJson`, `customApp`, `removeCustomApp`.

Karta má navíc argument `name` typu `autocomplete` bez autocomplete listeneru.
Jediná zmínka v kódu je v `test/awtrixng-flow-compose.test.js:13`, tedy test kontroluje titulek karty,
kterou nikdo neobsluhuje. Uživatel, který ji ve flow použije, dostane runtime chybu.

**Návrh:** rozhodnout explicitně – buď kartu odstranit (je `deprecated: true`, takže s vědomím rozbití
existujících flow), nebo doregistrovat listener a autocomplete. Doplnit test, který ověří,
že každé ID v `app.json.flow.actions` má registraci.

### B2 – Chybějící `drivers/awtrixlight/assets/images/xlarge.png` · **vysoký**

`drivers/awtrixlight/driver.compose.json` (a tedy i `app.json`) deklaruje
`images.xlarge = {{driverAssetsPath}}/images/xlarge.png`, ale adresář obsahuje jen `small.png` a `large.png`.
Driver `awtrixng` soubor má. Blokuje `homey app validate --level publish`.

Vedlejší nález: `awtrixng/large.png` a `awtrixng/xlarge.png` jsou **bitově identické**
(md5 `206eb2c4…`, obojí 42 728 B) a shodné i s `awtrixlight/large.png`. xlarge tedy není opravdový 1000×1000 asset.

### B3 – Selhání během `onInit` NG zařízení zabije polling · **vysoký**

`drivers/awtrixng/device.ts:85–93`:

```ts
const deviceStateResult = await this.refreshDeviceState({ allowAddCapabilities: true });
if (deviceStateResult?.status === 'detected') {
  await this.refreshSettingsFromDevice();   // ← může vyhodit AwtrixNgApiError
  await this.refreshDisplayFromDevice();
  await this.refreshAppsFromDevice();
}
this.poll.start();                          // ← se pak nikdy neprovede
```

`probeAwtrixNgDevice` chyby zachytává, ale `getSettings()` / `getDisplay()` / `getApps()` nikoli.
Když zařízení odpadne mezi probe a dalším requestem (nebo vrátí 5xx), `onInit` skončí odmítnutím,
`poll.start()` se nezavolá a zařízení se už samo nikdy neobnoví – až do restartu aplikace.

**Návrh:** `poll.start()` přesunout do `finally`, refresh bloky obalit tak, aby se chyba
zalogovala a promítla do availability (tj. neztratila – v souladu s `AGENTS.md`), ale nezastavila init.

### B4 – Nezachycené rejectiony v poll callbacku · **střední**

Obě vrstvy: `drivers/awtrixng/device.ts:81–83` a `drivers/awtrixlight/device.ts:58–70`.
Callback je předán do `homey.setInterval`, uvnitř se volá async funkce, jejíž promise nikdo neawaituje
ani nechytá. `applyDeviceState` volá `setCapabilityValue`, `refreshCapabilities` volá `setCapabilityValues`
– oboje může odmítnout. Vzniká unhandled rejection při každém neúspěšném pollu.

**Návrh:** callback obalit `.catch(this.error)` (v každé vrstvě zvlášť, vlastní implementací).

### B5 – Jméno custom app se u Awtrix3 nesanitizuje ani neescapuje · **střední**

`lib/awtrix3/Api/Api.ts:76,80`:

```ts
return this.clientPost(`custom?name=homey:${name}`, …);
```

`name` jde přímo z flow argumentu do query stringu. Přitom `lib/awtrix3/Normalizer.ts:127–129`
obsahuje přesně určenou funkci `appName()`, která prefix i sanitizaci dělá – a **nikde se nepoužívá**
(viz D3). NG vrstva má oproti tomu `toAwtrixNgHomeyPushedAppName()` s přísnou validací
a `encodeURIComponent` v `lib/awtrixng/Api/Client.ts:148`.

Praktický dopad: sdílená karta `application` má v `hint` napsáno, že jméno musí odpovídat
`A-Z a-z 0-9 _ -` a max 26 znaků, ale toto pravidlo vynucuje jen NG větev. Awtrix3 větev pošle
mezery, diakritiku i `&` do URL. Stejné pravidlo se tedy pro tutéž kartu chová na dvou zařízeních jinak.

**Návrh:** ve větvi Awtrix3 v `shared-flow-actions.ts` použít `appName()` (nebo vlastní ekvivalentní
validaci) a v `Api.customApp` / `removeCustomApp` použít `encodeURIComponent`. Bez sahání do NG vrstvy.

### B6 – Tiché spolknutí chyby při ukládání nastavení Awtrix3 · **střední**

`drivers/awtrixlight/device.ts:177`:

```ts
this.api.setSettings(newSettings).catch(this.error);
```

Promise se neawaituje a chyba se pouze zaloguje. Homey si mezitím nové nastavení uloží,
takže UI ukazuje hodnotu, kterou zařízení nikdy nepřijalo. `AGENTS.md` sice zakazuje polykání chyb
explicitně jen pro NG, ale symptom je stejný.

### B7 – Částečná aplikace nastavení NG · **střední**

`drivers/awtrixng/device.ts:115–126`:

1. `configureClient(...)` přepíše klienta novými credentials **bez ověření** (Awtrix3 driver naopak
   v `onSettings` volá `testDevice()` a při selhání vrací credentials zpět a hodí chybu),
2. `applyAwtrixNgBuiltinAppSettingsChange(...)` – pokud vyhodí (např. `AwtrixNgBuiltinAppUnavailableError`),
3. `applyAwtrixNgHomeySettingsChange(...)` se už neprovede.

Uživatel, který v jednom uložení změní zároveň built-in app i `uppercase`, dostane chybu a polovinu změny.

**Návrh:** rozhodnout explicitně o pořadí a atomicitě; minimálně sesbírat obě chyby a vrátit
souhrnnou zprávu, aby uživatel viděl, co se aplikovalo a co ne.

### B8 – Rozpor mezi typem a validátorem u `scroll` · **nízký**

`lib/awtrixng/Api/Types.ts:325` deklaruje `scroll?: AwtrixNgApiScrollPayload | AwtrixNgApiScrollMode`
(tj. povoluje zkratku `"static"`), ale `lib/awtrixng/Payload/Transformers.ts:378–385` řetězcovou
variantu odmítá s hláškou „Public payloads must use the documented scroll object".
Zúžení je záměrné (`AwtrixNgPageInput` v `Transformers.ts:65–67` `scroll` přetypuje), ale v `Api/Types.ts`
to nikde není poznamenané, takže při čtení typu to vypadá jako podporovaná cesta.

### B9 – Asymetrická validace payloadů NG · **nízký**

`assertPagePayload` (`Transformers.ts:579–587`) validuje `text`, `scroll`, `draw`, `palette`,
`textCase`, `font`, `iconMode`. Neověřuje **žádné číselné pole**: `durationMs`, `repeat`, `progress`,
`textOffsetX`, `iconOffsetX`, `effectSpeed`, `paletteSpan`, `paletteSpeed`, `textBlinkMs`, `textFadeMs`,
ani `sound` / `soundRtttl` / `stack` / `wakeup` / `hold`. Ty projdou v libovolném typu.
Vzhledem k tomu, jak přísně jsou ošetřená ostatní pole, jde spíš o mezeru než o rozhodnutí.

### B10 – K ověření: `this.device.error` jako nevázaný callback · **nízký**

`lib/awtrix3/List/Icons.ts:52` – `await this.api.getImages().catch(this.device.error)`,
`drivers/awtrixlight/device.ts:89,180,323` – `.catch(this.error)`.
Metoda se předává bez `bind`. Zda to funguje, závisí na tom, jestli `SimpleClass` v Homey SDK v3
`log`/`error` v konstruktoru váže. Doporučuji jednou ověřit na zařízení; pokud ne, tichý `TypeError`
v error cestě je horší než původní chyba.

## 3. Mrtvý kód

Ověřeno grepem přes `*.ts` a `*.js` mimo `node_modules` a `.homeybuild`.

| # | Místo | Poznámka |
|---|---|---|
| D1 | `lib/awtrix3/List/Apps.ts` (celý soubor, 40 ř.) | **Nikde se neimportuje.** Všechny 4 metody jsou stuby (`return []`, `return false`, `return null`). Navíc importuje `AwtrixLightDevice` a tvoří tak cyklus driver → lib → driver. |
| D2 | `lib/awtrix3/Api/Api.ts:38` `isAvaible()` | Nepoužito. Navíc překlep v názvu (`isAvailable`). |
| D3 | `lib/awtrix3/Normalizer.ts:96` `isHomeyApp`, `:113` `toTextFragments`, `:127` `appName` | Tři exportované funkce bez jediného volajícího. `appName` přitom řeší B5. |
| D4 | `lib/awtrix3/Poll.ts:45` `isExtended()` | Nepoužito (mimo `core.test.js`). |
| D5 | `drivers/awtrixlight/device.ts:422` `cmdReboot`, `:426` `cmdSetSettings`, `:457` `cmdGetImages` | Nepoužité obalové metody. `api.reboot()` se volá přímo z `onSettings:180`. |
| D6 | `drivers/awtrixlight/driver.ts:35` `const ManualAdd = false` + blok `:104–118` | Nedosažitelný kód (konstanta je natvrdo `false`). |
| D7 | `drivers/awtrixlight/driver.ts:124–136` | Tři handlery (`list_devices_selection`, `get_device`, `add_device`), které jen logují; uvnitř zakomentovaný kód. |
| D8 | `drivers/awtrixlight/device.ts:274–277` | `if (stats.uptime <= this.getStoreValue('uptime')) this.log('reboot detected')` – detekce restartu, která nic nedělá. Při prvním běhu je porovnání proti `undefined` vždy `false`. |
| D9 | `lib/awtrix3/Validator.ts:12–17` `isColor` | Větev `typeof color === 'number'` je nedosažitelná: regex vyžaduje `#RRGGBB`, číslo tomu nikdy nevyhoví. |
| D10 | `lib/awtrixng/Payload/Transformers.ts:624` `toAwtrixNgRtttlPayload` | Používá se jen v testu; produkční cesta staví `{ rtttl }` inline v `Api/Client.ts:123`. |
| D11 | `lib/awtrixng/Payload/PushedApps.ts:32` `fromAwtrixNgHomeyPushedAppName` | Jen v testu. |
| D12 | `lib/awtrixng/Api/Client.ts:45` `getVersion()`, `:52` `getCapabilities()` | Klientské metody bez volajícího. `getCapabilities()` by přitom byl přirozený zdroj pro `transitionEffect` dropdown, který je dnes v `driver.settings.compose.json` natvrdo (viz O4). |
| D13 | `drivers/awtrixng/device.ts:175` | `if (!availability.available)` – v této větvi je `result.status !== 'detected'`, takže `toAwtrixNgAvailabilityState` vždy vrátí `available: false`. Podmínka je konstantně pravdivá. |
| D14 | `lib/awtrixng/Payload/Transformers.ts:267` | `if (!allowedFields.has(field))` uvnitř `assertKnownFields` – smyčka se o pár řádků výš už `continue`-la, když pole je povolené. Podmínka je konstantně pravdivá. |
| D15 | `drivers/awtrixng/pair/manual_pairing_placeholder.html:39,195–201` | Zakomentované tlačítko „back" + živý handler, který na něj čeká (`if (backButton)` je vždy `false`). |

## 4. Duplicity

### Uvnitř sdílené / app-level vrstvy

**S1 – `isRecord` je zkopírované 7×.**
`drivers/awtrixng/driver.ts:128`, `drivers/shared-flow-actions.ts:126`,
`lib/awtrixng/Discovery/Detection.ts:46`, `lib/awtrixng/Http/AxiosTransport.ts:25`,
`lib/awtrixng/Api/ApiError.ts:81` (5× identické) a dvě varianty s `!Array.isArray`:
`lib/awtrixng/Payload/Transformers.ts:223`, `lib/awtrixng/Payload/JsonPayload.ts:6` (jako `isJsonObject`).
Riziko: tichá divergence sémantiky pro pole.
→ jeden `lib/awtrixng/Support/Guards.ts` se dvěma pojmenovanými predikáty (`isRecord`, `isPlainObject`),
plus samostatná kopie ve sdílené driver vrstvě, pokud nechceme, aby `drivers/shared-*` importovalo z `lib/awtrixng`.

**S2 – Čtyři identické tvary „ikony".**
`HomeyAwtrixIcon` (`lib/awtrix3/Types.ts:66`), `SharedFlowIconArg` (`shared-flow-actions.ts:22`),
`AwtrixNgFlowIconArg` (`drivers/awtrixng/flow-actions.ts:42`),
`AwtrixNgIconAutocompleteItem` (`lib/awtrixng/Services/Icons.ts:9`) – všechny `{ name, id, description? }`.
Sdílená flow vrstva je jediné místo, kde se potkávají, takže tam stačí jeden typ; per-vrstvové
alias typy lze ponechat, pokud jsou úmyslné (pak by je slušelo okomentovat).

**S3 – Autocomplete ikon zdvojený mezi app a Awtrix3 driverem.**
`app.ts:29,34,57` používá `autocompleteSharedIconAction`, zatímco `drivers/awtrixlight/driver.ts:50–52`
a `:69–71` mají vlastní inline `async (query, args) => args.device.icons.find(query)`.
Jde o tři kopie stejné jednořádkové logiky.

**S4 – `parseAwtrix3JsonOptions` vs. `parseOptionalAwtrix3JsonOptions`.**
`shared-flow-actions.ts:164–176` – druhá funkce je nadmnožinou první.

**S5 – Guard „jen NG" zopakovaný dvakrát.**
`shared-flow-actions.ts:344–354` (`runSharedApplicationRawAction`) a `:356–365`
(`runSharedWeatherOverlayAction`) mají identickou strukturu `if (!isAwtrixNgFlowDevice) throw; await …`.
Nabízí se `runForAwtrixNgOnly(args, handler)` po vzoru existujícího `runForSharedDevice`.

**S6 – Ikony a obrázky driverů jsou fyzicky duplicitní.**
`drivers/awtrixlight/assets/images/icons/` a `drivers/awtrixng/assets/images/icons/`
jsou bit po bitu identické (`diff -rq` bez rozdílu, 12 souborů).
`small.png` a `large.png` jsou taktéž identické mezi drivery.
Homey vyžaduje assety per-driver, takže duplicitu úplně odstranit nelze,
ale generovat je z jednoho zdroje (build krok / symlink v repu) by šlo.

### Uvnitř vrstvy AwtrixNG

**S7 – `probeManualPairingInput` vs. `probePendingAuthPairTarget`.** ⭐ největší duplicita v repu
`drivers/awtrixng/driver.ts:288–329` a `:339–391`. Cca 45 řádků prakticky identických:
stejné vytvoření transportu a klienta, stejný `probeAwtrixNgDevice`, stejné čtyři větve
`detected` / `auth-required` / `rejected` / `offline` se stejným mapováním chyb.
Liší se jen v `auth`, ve zdroji `name`/`hostname` a v tom, jestli se do zařízení uloží `settings`.
→ jedna privátní metoda `probeTarget({ baseUrl, address, port, auth?, name?, hostname?, settings? })`.

**S8 – Ruční seznamy polí duplikují typy z `Api/Types.ts`.** ⭐ nejrizikovější duplicita
`lib/awtrixng/Payload/Transformers.ts:83–221` obsahuje ručně psané runtime seznamy, které
zrcadlí TypeScript typy o pár souborů vedle a nemají žádnou vazbu, která by je držela v synchronizaci:

| runtime konstanta (Transformers.ts) | zdroj pravdy (Api/Types.ts) |
|---|---|
| `pageFields` (30 položek, ř. 83) | klíče `AwtrixNgApiPagePayload` (ř. 315) |
| `notificationFields` (ř. 117) | `AwtrixNgApiNotificationPayload` (ř. 349) |
| `pushedAppFields` (ř. 128) | `AwtrixNgApiPushedAppPayload` (ř. 361) |
| `indicatorFields` (ř. 134) | `AwtrixNgApiIndicatorPayload` (ř. 366) |
| `scrollFields` (ř. 197) | `AwtrixNgApiScrollPayload` (ř. 267) |
| `scrollModes` (ř. 207) | `AwtrixNgApiScrollMode` (ř. 120) |
| `scrollDirections` (ř. 209) | `AwtrixNgApiScrollDirection` (ř. 122) |
| `scrollEntries` (ř. 211) | `AwtrixNgApiScrollEntry` (ř. 124) |
| `scrollWhenFits` (ř. 213) | `AwtrixNgApiScrollWhenFits` (ř. 126) |
| `textCases` (ř. 215) | `AwtrixNgApiTextCase` (ř. 258) |
| `fonts` (ř. 217) | `AwtrixNgApiFont` (ř. 277) |
| `iconModes` (ř. 219) | `AwtrixNgApiIconMode` (ř. 260) |
| `lifetimeExpiries` (ř. 221) | `AwtrixNgApiPushedAppLifetimeExpiry` (ř. 359) |

Přidání pole do typu bez přidání do runtime seznamu vede k `unknown-field` chybě za běhu
– tedy přesně k tomu, čemu má validace bránit, ale z opačné strany.
→ Otočit směr odvození: definovat `const scrollModes = ['static','wrap','loop','bounce'] as const`
v `Api/Types.ts` a typ psát jako `typeof scrollModes[number]`. U objektových typů použít
`Record<keyof AwtrixNgApiPagePayload, true>` jako povinný manifest, který TypeScript vynutí.

**S9 – `notificationOnlyFields` / `pushedAppOnlyFields` opakují už existující seznamy.**
`Transformers.ts:182–195` vypisuje podruhé `hold, name, sound, soundLoop, soundRtttl, stack, wakeup`
resp. `lifetimeExpiry, lifetimeMs` – tytéž řetězce jsou o 60 řádků výš v `notificationFields`/`pushedAppFields`.
→ definovat je jednou a `notificationFields` složit jako `new Set([...pageFields, ...notificationOnlyFields])`.

**S10 – Seznam zapisovatelných settings existuje dvakrát.**
`lib/awtrixng/Services/Settings.ts:31–37` (`writableSettingsFields`) je znak po znaku shodný
se `settingsFields` v `Transformers.ts:140–146`. Navíc totéž vyjadřují typ
`AwtrixNgWritableSettingsField` (`Settings.ts:15`) a interface `AwtrixNgSettingsPatchInput`
(`Transformers.ts:75–81`). Čtyři reprezentace téhož.

**S11 – `ErrorParser.ts` je jen re-export barrel.**
`lib/awtrixng/Api/ErrorParser.ts` (9 řádků) pouze přeexportuje vše z `ApiError.ts`.
Nic neimportuje `ApiError` přímo kromě tohoto barrelu, ale existují tím dvě legitimní cesty ke stejným
symbolům a projekt je používá nekonzistentně. Historicky to nejspíš vzniklo přejmenováním souboru.
Test `awtrixng-lib-structure.test.js` na tom nezávisí – kontroluje jen PascalCase názvy.

**S12 – Dvojí odvození „API hodnot" weather overlaye.**
`lib/awtrixng/Services/Display.ts:22` počítá `weatherOverlayApiValues` filtrem `!== 'none'`
a ř. 58 dělá týž filtr znovu inline jen kvůli chybové hlášce.

**S13 – Pairing HTML: dvě kopie stejného Homey glue kódu.**
`drivers/awtrixng/pair/credentials_placeholder.html:76–120` a
`drivers/awtrixng/pair/manual_pairing_placeholder.html:81–125` obsahují znak po znaku
identické `emitHomey()` a `createHomeyDevice()` (~45 řádků). Shodná je i struktura
`setBusy` / `showMessage` a celý `submit` handler včetně větvení podle `result.status`.
Homey pair views nesdílí `<script src>` napříč soubory triviálně, ale sdílený inline snippet
vkládaný build krokem nebo alespoň jeden `pair/common.html` include stojí za zvážení.

### Uvnitř vrstvy Awtrix3

**S14 – `clientGet` vs. `clientGetDirect`.**
`lib/awtrix3/Api/Api.ts:111–133` – identická těla, liší se jediným voláním
(`client.get` vs. `client.getDirect`). Stejné zdvojení je o patro níž v `Client.ts:74–80`,
kde `get`/`getDirect` liší jen `#getApiUrl` vs. `#getUrl`.

**S15 – Sedm `cmd*` metod je čistý pass-through.**
`drivers/awtrixlight/device.ts:386–420`: `cmdNotify`, `cmdCustomApp`, `cmdRemoveCustomApp`,
`cmdDismiss`, `cmdRtttl`, `cmdPower`, `cmdIndicator`, `cmdAppNext`, `cmdAppPrev`
– každá je `await this.api.X(...)` a nic víc. Další čtyři (`cmdGetSettings`, `cmdGetStats`,
`cmdGetEffects`, `cmdGetImages`, ř. 430–464) mají identický `try/catch → this.error → return null`.
Vrstva má smysl jako veřejné rozhraní pro `shared-flow-actions.ts`, ale těch dvanáct
téměř identických obalů se dá zredukovat (např. jeden `safeCall<T>()` helper pro getter skupinu).

**S16 – `Client.log` se inicializuje dvakrát.**
`lib/awtrix3/Api/Client.ts:41` `log = console.log` a hned `:50` `this.log = options.log || console.log`.

**S17 – Dvojitý timeout mechanismus v `Client`.**
`lib/awtrix3/Api/Client.ts:26–31` – `abortSignal()` vytvoří `AbortController` a `setTimeout`,
který **nikdy nikdo neruší**, a zároveň se axiosu předává `timeout: Timeout`. Po každém requestu
tedy 10 s visí zbytečný globální timer. Navíc je to globální `setTimeout`, ne `homey.setTimeout`,
takže mimo správu Homey runtime. Vzhledem k `signal` je `timeout` redundantní (nebo naopak).

## 5. Zjednodušení a optimalizace

**O1 – `Normalizer.toText` (`lib/awtrix3/Normalizer.ts:73–94`).**
Blok `if (isString(text) || isNumeric(text)) return text.toString()` je tam **dvakrát** – jednou po
`JSON.parse` uvnitř `try`, podruhé po `catch`. Nad tím `JSON.parse` na jakémkoli řetězci znamená,
že `"123"` skončí jako číslo a `"null"` jako `undefined`. Funkce má tři výstupní cesty pro totéž.
→ Rozdělit na „zkus naparsovat fragmenty" a „fallback na string", parsovat jen když vstup vypadá
jako JSON pole (`trimStart().startsWith('[')`).

**O2 – `Normalizer.basicOptions` (ř. 137–247) – 110 řádků `if`ů s nekonzistentními strážemi.**
Konkrétní nesrovnalosti:

- `progress`, `textOffset`, `scrollSpeed`, `repeat`, `duration` používají `isNumeric(x)` → `0` projde,
- `blinkText` a `fadeText` (ř. 222, 226) používají `options.blinkText && isNumeric(...)` → **`0` se tiše zahodí**,
- `color` (ř. 161) používá `!== undefined` a pak `toColor()`, které při neplatné barvě
  **vrátí `'0'` místo vynechání pole** – tj. neplatný vstup se změní na hodnotu, ne na chybu,
- `background`, `progressC`, `progressBC`, `barBC` naopak používají `x && isColor(x)` → vynechají se.

→ Tabulkový přístup: pole `[{ key, guard, transform }]` a jedna smyčka. Sjednotí to i sémantiku
falsy hodnot, kterou dnes hlídá jen `core.test.js`.

**O3 – `Types.ts:12–28` `BarLineValues`.**
Šestnáctinásobný union tuple typů jen kvůli maximální délce. Běhové omezení už řeší
`isBarLineValues(values, hasIcon)` (`Validator.ts:89`) – a to i správněji, protože rozlišuje
limit 11 vs. 16 podle přítomnosti ikony, což typ neumí. Typ lze zredukovat na `number[]`.

**O4 – `transitionEffect` dropdown je zamrazený v compose.**
`drivers/awtrixng/driver.settings.compose.json` má 22 hodnot natvrdo, s hintem
„Static list from the documented capabilities". `AwtrixNgClient.getCapabilities()` přitom
vrací `transitions: string[]` a je **nepoužitá** (D12). Statický seznam je legitimní volba
(Homey settings jsou statické), ale pak by měla existovat kontrola, že se od `/api/v1/capabilities`
nerozešel – jinak uživatel nastaví efekt, který firmware nezná.

**O5 – Sériové probování při párování NG.**
`drivers/awtrixng/driver.ts:453–463` – `for (… of …) { await this.probeDiscoveryResult(…) }`.
Při N nalezených zařízeních trvá seznam N × timeout (10 s default). Se třemi offline zařízeními
je to 30 s prázdné obrazovky. → `Promise.all` + `filter(Boolean)`.

**O6 – Sériový upload ikon při přidání NG zařízení.**
`drivers/awtrixng/device.ts:246–260` – 12 souborů, každý `await`. Awtrix3 (`device.ts:143–151`)
naopak střílí uploady bez `await` úplně (viz O7). Ani jeden extrém není ideální;
dávka po 3–4 paralelně by byla rozumný kompromis.

**O7 – `onAdded` v Awtrix3 míchá async a sync fs a zahazuje výsledky.**
`drivers/awtrixlight/device.ts:143–151`: `fs.readdir` s callbackem, uvnitř `fs.readFileSync`,
a `this.api.uploadImage(...)` bez `await` i bez `.catch` → floating promises, chyby uploadu
se nikde neprojeví. `onAdded` skončí dřív, než upload začne.

**O8 – TTL cache ikon: 5 s (NG) vs. 120 s (Awtrix3).**
`lib/awtrixng/Services/Icons.ts:7` `DefaultCacheTtlMs = 5000` proti
`lib/awtrix3/List/Icons.ts:6` `Timeout = 120000`. Autocomplete v Homey posílá dotaz na každý úhoz;
s 5 s TTL to znamená znovu `GET /api/v1/files` prakticky při každém psaní s pauzou.
Není to duplicita k odstranění (vrstvy jsou oddělené), ale rozdíl vypadá spíš jako přehlédnutí
než jako rozhodnutí. Stojí za sjednocení hodnoty nebo za komentář, proč je NG agresivnější.

**O9 – `configureClient` zahazuje cache ikon při každé změně nastavení.**
`drivers/awtrixng/device.ts:229–243` vytvoří vždy nový `AwtrixNgIcons`, i když se změnil
jen `uppercase`. Ikony se pak načítají znovu. → přestavovat jen klienta, ikonám podstrčit nový klient.

**O10 – `setCapabilityValues` je all-or-nothing.**
`drivers/awtrixlight/device.ts:466–470` používá `Promise.all`; první odmítnutí (např. capability,
kterou zařízení nemá) shodí celou dávku a zbytek hodnot se neuloží. `Promise.allSettled`
s logem selhaných klíčů by byl robustnější. NG varianta (`device.ts:222–226`) tento problém
nemá, protože jede sekvenčně s `hasCapability` guardem.

**O11 – `migrate()` (`drivers/awtrixlight/device.ts:331–383`) je 50 řádků imperativního větvení.**
Tři bloky `if (capabilities.includes(x)) await this.removeCapability(x)` + tři `addCapability`
+ tři samostatné „přidej, pokud chybí". Dá se popsat deklarativně jako
`desiredOrder: string[]` a jedna smyčka. Zároveň dva komentáře `// Add rssi capability if not exists`
jsou copy-paste (druhý je nad `ip`, třetí nad `button.rediscover` chybí).

**O12 – Interface `DeviceFailer` / `DevicePoll` obrací závislost.**
`lib/awtrix3/Api/Api.ts:14` importuje z `drivers/awtrixlight/interfaces`, tedy **`lib` závisí na `drivers`**.
Totéž `lib/awtrix3/List/Apps.ts:3` (importuje konkrétní třídu `AwtrixLightDevice`).
NG vrstva to řeší správně: definuje si vlastní úzká rozhraní uvnitř `lib`
(`AwtrixNgAppsClient`, `AwtrixNgDeviceControlClient`, `AwtrixNgIconClient`, `AwtrixNgTimerHost`).
→ Přesunout `DeviceFailer`/`DevicePoll` do `lib/awtrix3/` a nechat driver, ať je implementuje.
Není to sloučení vrstev – je to narovnání směru závislosti uvnitř Awtrix3 vrstvy.

## 6. Co ponechat beze změny (záměrné oddělení vrstev)

Následující dvojice **vypadají** jako duplicity, ale jsou důsledkem záměrné separace.
Uvádím je proto, aby je někdo v budoucnu „nesjednotil":

| Awtrix3 | AwtrixNG | Proč nechat |
|---|---|---|
| `lib/awtrix3/Poll.ts` | `lib/awtrixng/Device/Poll.ts` | NG nemá extended/failsafe režim, Awtrix3 ano. Sloučení by přineslo mrtvé API do jedné z vrstev. |
| `lib/awtrix3/Api/Client.ts` | `lib/awtrixng/Http/AxiosTransport.ts` + `Api/Client.ts` | Zásadně jiný model chyb (`Status` enum vs. typovaný `AwtrixNgApiError` s envelope). |
| `lib/awtrix3/Normalizer.ts` | `lib/awtrixng/Payload/Transformers.ts` | Opačná filozofie: Awtrix3 tiše normalizuje, NG explicitně odmítá – v souladu s `AGENTS.md`. |
| `lib/awtrix3/List/Icons.ts` | `lib/awtrixng/Services/Icons.ts` | Jiné endpointy i tvar odpovědi. |
| `lib/awtrix3/Types.ts` | `lib/awtrixng/Api/Types.ts` | Dvě různá API. |
| `driver.settings.compose.json` (obě) | | Klíče (`ABRI` vs. `autoBrightness`) jsou API-specifické. |

Sdílená vrstva `drivers/shared-flow-actions.ts` s dispatchem přes `getAwtrixDeviceType()`
je z hlediska tohoto oddělení dobře navržená: typové guardy jsou explicitní, neexistuje
implicitní fallback a nepodporovaná kombinace vyhodí chybu (`getUnsupportedDeviceError`).
Doporučuji tento vzor držet i pro budoucí karty.

## 7. Nástroje, build a hygiena repozitáře

**T1 – Zastaralý lint toolchain běží mimo podporované rozmezí verzí.** · **nízký**
`npm run lint` prochází bez chyb, ale vypisuje:

```
WARNING: You are currently running a version of TypeScript which is not
officially supported by @typescript-eslint/typescript-estree.
SUPPORTED TYPESCRIPT VERSIONS: >=3.3.1 <5.2.0
YOUR TYPESCRIPT VERSION: 5.9.3
```

`package.json` má `typescript: ^5.2.2` (rozbaleno na 5.9.3), ale `@typescript-eslint/parser: ^5.62.0`,
který podporuje jen `<5.2.0`. K tomu `eslint: ^7.32.0` – ESLint 7 je po EOL.
Prakticky to znamená, že parser nemusí rozumět novější syntaxi a některá pravidla mohou tiše
přestat platit, aniž by lint spadl. Není to akutní problém, ale vysvětluje, proč se nelze
o čistý lint úplně opřít jako o důkaz, že je vše v pořádku.
→ Buď povýšit `@typescript-eslint/*` + ESLint na verze odpovídající TS 5.9, nebo TS připnout pod 5.2.

> **Poznámka k původní verzi tohoto dokumentu:** dřívější znění tvrdilo, že lint je rozbitý
> (696 chyb `Resolve error: Cannot find native binding` z `unrs-resolver`, údajně kvůli
> `allowScripts: { "unrs-resolver": false }` v `package.json:35–37`). To bylo **chybné**.
> Nález vznikl spuštěním ESLintu v linuxovém prostředí nad `node_modules` nainstalovaným
> pro darwin-arm64 – nativní vazba se proto nedala načíst. Na cílové platformě lint prochází.
> `tsc` a testovací sada jsou čistý JS/TS, takže jejich výsledky v sekci 1 tímto zasažené nejsou.

**T2 – Rozjetá verze.**
`package.json` → `2.0.0`, `.homeycompose/app.json` a `app.json` → `2.0.1`.
Poslední commit se jmenuje „Bump 2.0.1", takže `package.json` se zapomněl.
→ Doplnit kontrolu do testů (`locales.test.js` už podobný „meta" test dělá).

**T3 – Nerovnoměrné pokrytí testy.**
20 souborů `awtrixng-*.test.js` (~180 testů) proti jedinému `core.test.js` (6 testů) pro Awtrix3.
Vzhledem k `AGENTS.md` („Existing AWTRIX 3 support must remain functional") je to opačně,
než by odpovídalo riziku – NG je nová a testovaná, Awtrix3 je starý, používaný a netestovaný.
Kandidáti na doplnění: `basicOptions` falsy hodnoty (O2), `toText` (O1),
`Api.processResponseCode` / `processUnavailability` stavový automat, `migrate()`.

**T4 – Testy čtou dva různé stromy.**
Většina testů requiruje z `.homeybuild/…` (zkompilovaný výstup), ale
`awtrixng-lib-structure.test.js` čte přímo `lib/awtrixng` a několik testů
(`awtrixng-device-settings.test.js:56`) parsuje **zdrojový text** metodami typu
`getSourceBetween(source, 'async onSettings({', 'async refreshAvailability')`.
Takové testy se rozbijí při každém přejmenování metody a netestují chování.
→ Nahradit je testy proti chování s fake klientem.

**T5 – `.DS_Store` v pracovním stromu.**
`docs/.DS_Store` (6 148 B) a `drivers/awtrixng/.DS_Store` (6 148 B).
V Gitu nejsou (`.gitignore` je pokrývá), ale `.homeyignore` v repu neexistuje,
takže se mohou dostat do publikovaného balíčku aplikace.

**T6 – `app.json` (38 kB) je generovaný a zároveň verzovaný.**
To je standardní Homey praxe, ale znamená to, že každá změna v `.homeycompose`
se musí ručně promítnout `homey app build`. Nálezy B1 a B2 jsou přesně ten typ driftu,
který by odchytil CI krok „build → `git diff --exit-code app.json` → `homey app validate`".

## 8. Doporučené pořadí

**Nejdřív (blokuje release nebo tichý runtime problém)**

1. B2 – doplnit `xlarge.png` pro `awtrixlight` (jinak neprojde publish validace).
2. B1 – rozhodnout osud `applicationIcon`.
3. B3 – `poll.start()` do `finally` v NG `onInit`.
4. B4 – `.catch` v obou poll callbacích.
5. T2 – srovnat verzi v `package.json`.

**Potom (levné, nulové riziko)**

7. Smazat mrtvý kód D1–D15 (~150 řádků, žádný volající, testy nezávisí).
8. S16, S17 – úklid `Client` (dvojí `log`, neuklízený `setTimeout`).
9. S12, S4, S5 – drobné duplicity ve sdílené a Display vrstvě.

**Potom (má reálný přínos, vyžaduje rozvahu)**

10. S8 – otočit odvození runtime seznamů z typů. Největší dlouhodobý přínos, protože odstraní
    celou třídu tichých regresí; udělat společně s S9 a S10.
11. S7 – sjednotit obě probe metody v NG driveru (~45 řádků).
12. B5 – sanitizace a escapování jména aplikace v Awtrix3 větvi (použít existující `appName()`).
13. S1 – jeden `isRecord`.
14. O2, O1 – přepsat `basicOptions` a `toText`; **až po** doplnění testů podle T3,
    protože právě tady se dá nejsnáz nepozorovaně změnit chování.

**Nakonec (kosmetika / infrastruktura)**

15. O12 – narovnat směr závislosti `lib/awtrix3` → `drivers`.
16. S13 – sdílený glue kód pairing views.
17. T6 – CI krok s `homey app build` + `validate` + diff `app.json`.
18. T1 – sjednotit verze `typescript` / `@typescript-eslint` / `eslint`.
19. O5, O6, O9, O10 – výkonové drobnosti.

---

## 9. Doplňky po srovnání s `code-audit-2026-08-05.md`

Po dokončení této analýzy jsem ji porovnal s nezávislým auditem z téhož dne.
Většina nálezů se překrývá. Následující položky **v mé analýze chyběly nebo byly neúplné**
– ověřil jsem je v tomto repozitáři a doplňuji je sem, aby byl dokument úplný.
Podrobné postupy náprav byly v `claude-remediation-plan.md` pod uvedenými ID (dokument smazán, viz git historii).

### N2 – Počítadlo chyb AWTRIX 3 má dvě vady · **vysoký**

`lib/awtrix3/Api/Api.ts:162–194` + `drivers/awtrixlight/device.ts:473–487`.

1. **Neměří po sobě jdoucí selhání.** `processResponseCode` na `Status.Ok` má early return,
   když je zařízení available – `failsReset()` se pak nezavolá. Tři nesouvisející výpadky
   rozprostřené přes týden se sečtou stejně jako tři po sobě jdoucí.
2. **Posun o jednu.** `processUnavailability` testuje limit **před** inkrementací,
   takže při `failThreshold = 3` označí zařízení unavailable až **čtvrtá** chyba.
3. Vedlejší efekt: jakmile je zařízení unavailable, `failCount` zůstane na 3 a každá další
   chyba znovu volá `poll.extend()`, což restartuje interval. Zařízení v dlouhém výpadku
   nemusí dokončit ani jeden extended cyklus.

### N9 – Neúspěšné write operace se zahazují · **vysoký**

`lib/awtrix3/Api/Api.ts:135–147` vrací `boolean`, ale `drivers/awtrixlight/device.ts:386–420`
má `Promise<void>` a hodnotu zahodí. Flow akce proto skončí úspěšně i při HTTP 500.
Můj původní nález B6 pokrýval jen `onSettings`; problém je systémový přes celé command rozhraní.
U `onSettings` je navíc `false` **splněná** Promise, takže `.catch(this.error)` se nikdy nespustí.

### N10 – Fire-and-forget v lifecycle AWTRIX 3 · **vysoký**

Úplnější než můj nález B4. `drivers/awtrixlight/device.ts`: `onInit()` neawaituje
`initializeDevice()` (`:73`), poll callback neawaituje nic (`:58–66`), `refreshAll()` spustí
tři Promise bez awaitu a sama Promise nevrací (`:221–225`), `finally` spustí poll dřív,
než doběhne `refreshAll()` (`:97–110`), `refreshSettings()` neawaituje `setSettings()` (`:292`),
`onAdded()` nečeká na nic (`:136–151`).

### N11 – Basic Auth hlavička v debug logu AWTRIX 3 · **střední**

`lib/awtrix3/Api/Client.ts:103` předává skutečné hlavičky do `#debugRequest`,
který je na `:179–184` loguje beze změny; `#debugResponse` loguje i `response.headers`.
Týká se POST a upload cest (GET hlavičky nepředává). Projeví se při `DEBUG=1`.
NG transport to řeší správně (`AxiosTransport.ts:57–60`, `redactSensitiveHeaders`).

### N12 – Polling není single-flight · **střední**

Doplňuje můj nález B4. `lib/awtrixng/Device/Poll.ts:22–25` i `lib/awtrix3/Poll.ts:22–25`
předávají async callback přímo do `setInterval`. Interval nečeká na dokončení předchozího běhu,
takže při latenci nad interval vznikají **souběžné** refresh cykly.

### N13 – Icon cache dovoluje duplicitní souběžné GETy · **střední**

`lib/awtrixng/Services/Icons.ts:94–101` nemá in-flight guard. Dvě autocomplete volání
před dokončením prvního `loadIcons()` obě vidí prázdný seznam a obě pošlou request.
V kombinaci s TTL 5 s (nález O8) se to při psaní projeví opakovanými requesty.

### N3 – `xlarge.png` chybí i na app-level

Můj nález B2 uváděl jen driver. Chybí **dva** soubory:
`assets/images/xlarge.png` (odkazuje `.homeycompose/app.json:25`) i
`drivers/awtrixlight/assets/images/xlarge.png`. Ověřeno – `assets/images/` obsahuje
jen `large.png` a `small.png`.

### N4 – Verze jsou rozjeté ve **třech** zdrojích

Můj nález T2 uváděl dva. Třetí je `package-lock.json` → `1.0.2` (root i `packages[""]`),
proti `package.json` `2.0.0` a manifestu `2.0.1`.

### N5 – Nepoužité přímé závislosti

`mime-types` a `@types/mime-types` nejsou importovány nikde v runtime, testech ani nástrojích.
Ověřeno grepem přes `*.ts`/`*.js` mimo `node_modules` a `.homeybuild`.

### N6 – `tsconfig.json` obsahuje nefunkční konfiguraci

`allowJs: true`, `baseUrl` a `paths` (`drivers/*`, `lib/*`) nemají efekt – všechny importy
jsou relativní a mimo `test/` (vyloučené z kompilace) neexistuje žádný `.js` soubor.

### N7 – README popisuje neaktuální Flow model

`README.md:13` tvrdí „AWTRIX NG flows use separate `awtrixng*` flow cards".
Ve skutečnosti jede podporovaný subset přes shared karty s dispatchem podle
`getAwtrixDeviceType()`; NG-only jsou jen `applicationRaw` a `weatherOverlay`
a **žádná** karta v repu nemá prefix `awtrixng`.

### Korekce mého nálezu B1 + D1

Audit správně ukazuje, že `applicationIcon` a `lib/awtrix3/List/Apps.ts` **nejsou dva nezávislé
nálezy**, ale jeden nedokončený celek: karta má autocomplete argument `name` (seznam aplikací)
a `List/Apps.ts` je přesně ten service skeleton, který ho měl obsluhovat. Rozhodovat je
odděleně by znamenalo smazat jedno a nechat druhé.

### Korekce mého přístupu k „mrtvému kódu" v NG klientovi

Audit uvádí důležitý mantinel, který jsem v `claude.md` neformuloval: **velké typové definice
a dokumentované endpointy NG klienta nejsou automaticky mrtvý kód** – jsou explicitním
kontraktem s API. To se týká zejména mého nálezu D12 (`getVersion()`, `getCapabilities()`)
a D11 (`fromAwtrixNgHomeyPushedAppName`). Jejich odstranění má být rozhodnutí o rozsahu
API klienta, ne slepý výstup dead-code analýzy. U `getCapabilities()` navíc dává větší smysl
ji **zapojit** (nález O4) než smazat.

### Kde se oba dokumenty shodují

`applicationIcon` bez listeneru, `List/Apps.ts` jako skeleton, chybějící `xlarge.png`,
rozjeté verze, sekvenční NG discovery, sekvenční upload ikon, duplicita pairing cest
v NG driveru, prázdné pairing handlery AWTRIX 3, nepoužité wrappery
(`isAvaible`, `cmdReboot`, `cmdSetSettings`, `toAwtrixNgRtttlPayload`), duplicitní driver assets
a závěr, že AWTRIX 3 a NG vrstvy se **nemají** slučovat.

Audit navíc uvádí, že `homey app validate` (publish level) prochází – tuto kontrolu jsem
nespouštěl. Zároveň neodhalila ani chybějící `xlarge.png`, ani Flow kartu bez listeneru,
což je argument pro vlastní CI kontroly (T6).

---

### Poznámka k metodice

Nálezy „nepoužito" jsou ověřené `grep`em přes celý repozitář mimo `node_modules` a `.homeybuild`,
včetně testů (u položek, které používá jen test, je to výslovně uvedeno).
Nálezy „nedosažitelné" jsou odvozené ze statického čtení řídicího toku.
Položka B10 je označená jako **k ověření** – závisí na chování Homey SDK, které jsem
nemohl potvrdit bez běhu na zařízení.

**Omezení prostředí:** `tsc`, testy a `eslint` jsem spouštěl v linuxovém prostředí nad
`node_modules` nainstalovaným na macOS. Pro čistě JS/TS nástroje (`tsc`, `node --test`) je to
bez vlivu a jejich výsledky platí. Nástroje s nativními vazbami (`eslint` přes `unrs-resolver`)
tam ale selhávají z důvodu nesouvisejícího s kódem – to původně vedlo k chybnému nálezu T1.
Jakýkoli budoucí závěr opřený o nástroj s nativní závislostí je potřeba ověřit
na cílové platformě, ne v mém prostředí.
