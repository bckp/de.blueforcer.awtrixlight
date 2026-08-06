# Prováděcí plán 2 – hotfixy po review 2.1.0 + následný úklid

> Nástupce dokončeného [`plan.md`](plan.md). **Nahrazuje a pohlcuje [`plan-after.md`](plan-after.md)**
> – jeho kandidáti F1p–F8p jsou zde rozpracovaní do prováděcích balíčků.
> Nálezy V1–V7 pocházejí z [`claude-review-2.1.0.md`](claude-review-2.1.0.md).
> Vztažný commit: `ccdccad` („chore(release): prepare 2.1.0").
> **Čísla řádků v analýzách driftují – hledej podle symbolů.**
>
> **Stav plánu: FINÁLNÍ (2026-08-06).** Všechna lidská rozhodnutí jsou zodpovězená
> v sekci 3. Žádný balíček není blokovaný kromě REL2 (čeká na pokyn k publikaci).

---

## 0. Jak s tímto plánem pracovat

**Pro člověka (bckp):** každý balíček spouštěj v nové session tímto promptem:

```
Přečti docs/plan2.md. Proveď POUZE balíček <ID>. Dodržuj globální pravidla v sekci 1
a ověřovací rituál v sekci 2. Pokud narazíš na cokoli nejednoznačného, zastav se
a zeptej se – nehádej. Po dokončení aktualizuj checklist v sekci 6.
```

U každého balíčku je doporučený model: **[S]** = zvládne Sonnet, **[O]** = radši Opus
(mění se pozorovatelné chování nebo je potřeba držet víc souvislostí najednou).

**Pro model:** načti tento soubor, `AGENTS.md` a soubory uvedené u balíčku. Analytické
dokumenty otevírej jen když kroky nestačí. Fáze G jsou hotfixy před publikací 2.1.0 –
mají přednost; fáze H je úklid, který snese čekání.

---

## 1. Globální pravidla (platí pro každý balíček, bez výjimky)

**MUSÍŠ:**

1. **Awtrix3 (`drivers/awtrixlight` + `lib/awtrix3`) a AwtrixNG (`drivers/awtrixng` +
   `lib/awtrixng`) jsou dva oddělené drivery a nesmí se nijak prolínat.** Stejný problém
   v obou vrstvách = dvě nezávislé implementace. Žádná sdílená třída, žádný společný
   transport, žádný import mezi `lib/awtrix3` a `lib/awtrixng`. Sdílená driver vrstva
   (`app.ts`, `drivers/shared-flow-actions.ts`) nesmí importovat implementační helpery
   z žádné z obou lib vrstev.
2. Před začátkem `git status` čistý; větev `fix/<id>`; jeden balíček = jeden commit.
3. `app.json` needituj ručně – změny v `.homeycompose/` + `homey app build`.
4. NG chyby zachovávají HTTP status, code, message a field (viz `AGENTS.md`).
5. `allSettled()` nesmí skončit pouhým logem, pokud operace má selhání propagovat –
   agregace vyhazuje `AggregateError` s původními chybami. (Výjimka: bundled ikony,
   R9 – nekritické, ale každá chyba se strukturovaně zaloguje.)
6. Změna existujícího testu = změna chování. Ověř, že je to PŘESNĚ změna předepsaná
   balíčkem; jinak revert, stop, zeptej se.
7. Po dokončení aktualizuj checklist v sekci 6.

**NESMÍŠ:**

1. Refaktorovat cokoliv mimo kroky balíčku. Duplicity MEZI vrstvami awtrix3/awtrixng
   jsou záměrné (viz `claude.md` sekce 6).
2. Přejmenovávat soubory/symboly/flow ID nad rámec balíčku.
3. Měnit dispatch vzor `drivers/shared-flow-actions.ts` (explicitní type guard +
   výjimka pro nepodporovaný typ).
4. Mazat deprecated flow karty ani adaptér `applicationIcon` v `app.ts`.
5. Sjednocovat TTL cache ikon (R8: Awtrix3 120 s, NG 5 s – záměrné) ani měnit
   sekvenční fail-fast zápis NG settings (R7 – záměrné, komentované v kódu).
6. Instalovat nové runtime závislosti (výjimka: balíček to předepisuje).

## 2. Ověřovací rituál

Před začátkem (baseline) i po dokončení každého balíčku:

```bash
npx tsc --noEmit             # 0 chyb
npm run build                # projde
node --test test/*.test.js   # 0 failed (baseline: 285 pass)
npm run lint                 # 0 errors (jen na macOS stroji vlastníka)
```

Baseline neprochází před tvou změnou → stop, nahlas, nezačínej.

## 3. Rozhodnutí člověka – ZODPOVĚZENO 2026-08-06

| # | Otázka | Balíčky | Odpověď bckp |
|---|---|---|---|
| P1 | V1: chování autocomplete ikon Awtrix3 při nedostupném zařízení | G1 | **Propsat chybu** – `getImages` při selhání vyhodí popsanou chybu; parita s NG driverem, konzistence s C2. |
| P2 | F3p: opravit falsy nekonzistence při refaktoru normalizérů? | H3, H4 | **Opravit vše vč. barvy** – `blinkText: 0`/`fadeText: 0` se posílají zařízení; neplatná barva v `basicOptions` se vynechá (místo '0'). Patří do release notes. |
| P3 | F8p: CI platforma a přísnost | H14 | **GitHub Actions, `npm audit` jen report** (neblokující krok). |
| P4 | Kdy publikovat 2.1.0 | REL2 | **Až později** – po fázi G a vybrané části H. REL2 čeká na výslovný pokyn. |

Zděděná platná rozhodnutí z `plan.md`/`plan-after.md`: R7 (sekvenční fail-fast NG
settings), R8 (oddělené TTL), R9 (bundled ikony nekritické se strukturovanou
diagnostikou), R6 (401 = auth, Node 22, `txt.id === uid`).

---

## 4. FÁZE G – hotfixy před publikací 2.1.0

### G1 [S] · V1: regrese autocomplete ikon Awtrix3 · rozhodnuto P1

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `lib/awtrix3/List/Icons.ts`,
  `locales/en.json`, `test/awtrix3-icons.test.js`
- **Kontext:** `clientGetDirect` chytá všechny chyby a vrací `null`; `loadIcons`
  po odstranění staré `.catch(...) || []` větve dělá `null.map(...)` → `TypeError`.
- **Kroky:**
  1. `Api.getImages()`: výsledek `clientGetDirect` ulož do proměnné; když je `null`,
     vyhoď `new Error(this.device.homey.__('api.error.iconsUnavailable'))`.
     Návratový typ zůstává `Promise<AwtrixImage[]>` (teď už pravdivý).
  2. Nový klíč `api.error.iconsUnavailable` do `locales/en.json`
     (`"Unable to load icons from the device!"`).
  3. `loadIcons` neměň – rejection nyní čistě proteče přes in-flight mechanismus
     (`#inFlight` se vyčistí ve `finally`, prázdný seznam se neuloží).
- **Test:** fake `getImages → null` → `icons.find()` odmítne s hláškou klíče;
  po odmítnutí další volání znovu zavolá `getImages` (cache se „nezamkla").
- **Commit:** `fix(awtrix3): surface icon list failures instead of crashing autocomplete`

### G2 [S] · V3: floating promises `connected()` a `onAdded`

- **Soubory:** `drivers/awtrixlight/device.ts`, `test/awtrix3-lifecycle.test.js`
- **Kontext:** po C2 `cmdNotify` odmítá při neúspěchu; `connected()` (def. ~`:336`)
  volá `cmdNotify` bez await/catch; volá se z `initializeDevice` (~`:104`)
  a `onAdded` (~`:139`). V `onAdded` je navíc floating `this.setCapabilityValue('ip', …)`.
- **Kroky:**
  1. `connected()` → `async connected(): Promise<void>`; tělo obal `try/catch`
     s `this.error` + komentář, že uvítací notifikace je best-effort.
  2. Obě volání `this.connected()` → `await this.connected();`.
  3. V `onAdded`: `await this.setCapabilityValue('ip', …).catch(this.error);`
     (capability zápis nesmí shodit párování).
- **Test:** harness – `cmdNotify` selže → init i onAdded doběhnou, chyba zalogovaná,
  žádná unhandled rejection (v testu `process.on('unhandledRejection')` čítač = 0).
- **Commit:** `fix(awtrix3): contain best-effort greeting and capability writes`

### G3 [O] · V2: fallback adresy ze store při změně local settings NG

- **Soubory:** `drivers/awtrixng/device.ts`, `test/awtrixng-device-settings.test.js`
  (pozor, může parsovat zdrojový text – změny testu dělej vědomě)
- **Kontext:** zařízení spárovaná před 2.1.0 mají `settings.address = ''` (adresa je
  jen ve store). Změna `authUser`/`authPass` → `getConnectionCandidateFromSettings`
  → throw „connection not configured", přestože zařízení běží.
- **Kroky:**
  1. `getConnectionCandidateFromSettings`: když je `settings.address` po trimu prázdná,
     použij `getStoreSnapshot()` – `store.address` + `store.port` (oba existují z
     párování; když ne, teprve pak vyhoď stávající „not configured" chybu).
     Validace formátu adresy a portu zůstává stejná pro obě větve.
  2. V `applySettingsChangesWithCandidateConnection` po úspěchu:
     `commitConnection(connection, client, true)` – **syncHomeySettings=true**,
     aby se settings doplnily a fallback byl jednorázový. (Dnes je tam `false`;
     změna je bezpečná – hodnoty jsou totožné s tím, co uživatel právě uložil,
     nebo doplněné ze store.)
  3. Rozmysli pořadí: `setSettings` uvnitř `onSettings` je povolené v Homey SDK3?
     Pokud ne (ověř v dokumentaci/typech), synchronizaci proveď odloženě
     (`setImmediate`/po resolve) a zdokumentuj – NEHÁDEJ.
- **Test:** device se store `{baseUrl, address, port}`, settings `{address: '', port: 80}`,
  změna `authPass` → probe kandidáta proběhne proti store adrese, uloží se, settings
  se synchronizují. Druhý test: prázdné settings i store → stávající chyba.
- **Commit:** `fix(awtrixng): fall back to stored address when settings lack connection values`

### G4 [S] · V4: shape guard pro `/api/v1/files`

- **Soubory:** `lib/awtrixng/Services/Icons.ts`, `test/awtrixng-icons.test.js`
- **Kroky:** v `loadIcons` (před `toAwtrixNgIconAutocompleteItems`) ověř
  `isRecord(response) && Array.isArray(response.files)`; jinak vyhoď
  `AwtrixNgInvalidResponseError({ endpoint: '/api/v1/files', expectedShape:
  'an object with a files array', actualValue: response })`. Import z
  `../Api/InvalidResponseError`. Lokální `isRecord` helper (3 řádky) – NEIMPORTUJ
  z jiných NG modulů, konsolidace přijde v H1.
- **Test:** transport vrátí `null` / `{}` / `{files: 'x'}` → `AwtrixNgInvalidResponseError`
  se správným `endpoint`; cache se neuloží.
- **Commit:** `fix(awtrixng): guard files response shape before mapping icons`

### G5 [S] · V5: rejections z NG discovery hooků

- **Soubory:** `drivers/awtrixng/device.ts`, `test/awtrixng-device-discovery.test.js`
- **Kroky:** `onDiscoveryAddressChanged` a `onDiscoveryAvailable` obal `try/catch`:
  `catch → this.error(error); return false;` – parita s Awtrix3 protějškem.
  `AwtrixNgDeviceIdentityMismatchError` se tím zaloguje vždy (diagnosticky cenné –
  znamená recyklovanou IP adresu). Sémantika návratové hodnoty (`true` jen při
  úspěšném commitu + detekci) se nemění.
- **Test:** discovery event s nedostupným kandidátem → `false`, chyba zalogovaná,
  store nezměněný; event s cizím uid → `false`, mismatch error zalogovaný.
- **Commit:** `fix(awtrixng): contain discovery reconnection failures`

### G6 [S] · Changelog: migrace jmen custom app (R3a dluh)

- **Soubory:** `.homeycompose/app.json`? NE – changelog je `.homeychangelog.json`.
- **Kroky:** do textu `2.1.0` doplň jednu větu: custom app jména se nyní normalizují
  (lowercase, jen a–z/0–9); aplikace vytvořené staršími verzemi pod nenormalizovaným
  jménem je potřeba jednorázově smazat přímo na zařízení. (Rozhodnutí R3a z `plan.md`
  – changelog byl tehdy vynechán.)
- **Commit:** `docs: mention custom app name normalization in 2.1.0 changelog`

---

## 5. FÁZE H – úklid (bývalý `plan-after.md` + V6/V7)

Pořadí uvnitř fáze respektuj: H3 → H4 (testy před refaktorem), H5 po H3/H4
(sdílí harness práci), H13/H14 nakonec.

### H1 [O] · F1p + V7: konsolidace guardů UVNITŘ NG vrstvy

- **Soubory:** nový `lib/awtrixng/Support/Guards.ts`; call-sites:
  `lib/awtrixng/Discovery/Detection.ts`, `lib/awtrixng/Api/ApiError.ts`,
  `lib/awtrixng/Http/AxiosTransport.ts`, `lib/awtrixng/Payload/Transformers.ts`,
  `lib/awtrixng/Payload/JsonPayload.ts`, `lib/awtrixng/Services/Icons.ts` (z G4),
  `drivers/awtrixng/device.ts`, `drivers/awtrixng/driver.ts`
- **Kroky:**
  1. Nejprve ZMAPUJ všechny lokální guardy a jejich sémantiku – existují DVĚ varianty:
     `isRecord` (objekt ≠ null; pole PROCHÁZÍ – Detection, ApiError, AxiosTransport,
     driver) a „plain object" (pole NEPROCHÁZÍ – Transformers `isRecord`, JsonPayload
     `isJsonObject`, device `isPlainObject` s prototype checkem). V Guards exportuj
     `isRecord` a `isPlainObject` (verze s prototype checkem z device – je nejpřísnější;
     ověř, že Transformers/JsonPayload testy projdou s prototype checkem beze změny,
     jinak zachovej dvě přesné varianty a pojmenuj je popisně).
  2. Port validace: `toValidTcpPort(value: unknown): number | undefined` – nahraď
     `toPort` (driver) a `toConnectionPort` (device; ten hází – wrapper u volajícího).
     `toAwtrixNgBaseUrl` nech beze změny (jeho RangeError je součást kontraktu).
  3. `app.ts` a `drivers/shared-flow-actions.ts` si NECHÁVAJÍ vlastní kopie
     (sdílená vrstva neimportuje z lib).
- **Ověření:** rituál; žádný test se nemění (čistý refaktor). Pokud se nějaký změnit
  musí, porušil jsi sémantiku guardu → vrať se ke kroku 1.
- **Commit:** `refactor(awtrixng): consolidate record and port guards in Support/Guards`

### H2 [S] · F2p + S12: lokální úklid Awtrix3 klienta a NG Display

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `lib/awtrix3/Api/Client.ts`,
  `lib/awtrixng/Services/Display.ts`
- **Kroky:**
  1. `Api.clientGet`/`clientGetDirect`: společné tělo do privátní
     `#clientGetInternal(fetch: () => Promise<Response>)`; veřejné signatury beze změny.
  2. `Client.get`/`getDirect`: analogicky (`#getRequest` už existuje – jen sjednoť
     volání, pokud zbývá duplicita).
  3. S12: v `Display.ts` odvoď chybovou hlášku z existující
     `weatherOverlayApiValues` množiny místo druhého inline filtru.
- **Nesmíš:** měnit URL cesty, response mapování, veřejné signatury; nic z NG.
- **Commit:** `refactor: deduplicate awtrix3 client internals and NG overlay message`

### H3 [S] · F3p-a: charakterizační testy normalizérů (PŘED H4)

- **Soubory:** `test/core.test.js` (rozšíření)
- **Kroky:** doplň testy fixující SOUČASNÉ chování `basicOptions`, `notifyOptions`,
  `appOptions`, `toText` pro tyto případy (každý zvlášť pojmenovaný):
  1. `blinkText: 0`, `fadeText: 0` → dnes se ZAHAZUJÍ (test to zafixuje; H4 ho změní),
  2. `color: 'red'` (neplatná) → dnes `color: '0'`,
  3. `color: '#ABCDEF'` → projde beze změny,
  4. `gradient` s jednou neplatnou barvou → zahazuje se celý,
  5. `background`/`progressC`/`progressBC`/`barBC` neplatné → vynechají se,
  6. `blinkText` platné + `rainbow: true` → zahazuje se (vzájemná exkluze),
  7. `toText`: `'123'` → `'123'`; `'null'` → undefined?; `'[{"t":"a","c":"bad"}]'`
     → fragment s `c: '0'`; ne-JSON string → beze změny. U každého zapiš SKUTEČNÝ
     dnešní výsledek (spusť a ověř, nehádej z čtení kódu).
  8. `repeat` nastavené → `duration` se zahodí (vedlejší efekt v `basicOptions`).
- **Pozn.:** testy komentuj `// characterization: pre-H4` tam, kde H4 chování změní.
- **Commit:** `test(awtrix3): characterize normalizer falsy and invalid-value behavior`

### H4 [O] · F3p-b: tabulkový refaktor normalizérů + opravy · rozhodnuto P2

- **Soubory:** `lib/awtrix3/Normalizer.ts`, `test/core.test.js`, `.homeychangelog.json`
- **Kroky:**
  1. `basicOptions` přepiš tabulkově: pole `[{ key, guard, transform? }]` + jedna
     smyčka; pořadí klíčů ve výstupu zachovej (kvůli deepEqual testům).
  2. Opravy podle P2 (každá = vědomá úprava charakterizačního testu z H3):
     a) `blinkText: 0` / `fadeText: 0` → POSÍLAJÍ se (guard `isNumeric` místo truthy;
        exkluze s gradient/rainbow zůstává),
     b) neplatná `color` v `basicOptions` → pole se VYNECHÁ (žádné `'0'`).
  3. **NEMĚŇ:** `indicatorOptions` – tam `color: '0'` znamená „zhasnout indikátor"
     a je to záměrný API kontrakt (dismiss cesta). NEMĚŇ ani fragmenty v `toText`
     (fragment vyžaduje `c`; fallback `'0'` zůstává) – pokud si myslíš, že se to má
     změnit taky, stop a zeptej se.
  4. `toText` zjednoduš: JSON parse jen když vstup po trimu začíná `[`;
     odstraň duplicitní string/numeric větev. Chování dle H3 testů (mimo bod 2).
  5. Do `.homeychangelog.json` (příští verze, ne 2.1.0 pokud už vyšla – koordinuj
     s REL2) přidej větu o změně chování blink/fade 0 a neplatných barev.
- **Commit:** `refactor(awtrix3)!: table-driven normalizer, honor zero blink/fade, drop invalid colors`

### H5 [O] · F4p: nahradit source-parsing testy behaviorálními

- **Soubory:** `test/awtrixng-device-settings.test.js` (+ případné další s
  `getSourceBetween`/čtením .ts souborů – najdi grepem `readFileSync.*\.ts`),
  `test/helpers/fake-homey.js`, `drivers/awtrixng/device.ts` (jen případné
  odstranění `refreshAvailability`)
- **Kroky:**
  1. Grep: které testy čtou zdrojový text. Strukturní testy (`awtrixng-lib-structure`,
     compose testy, entrypoint testy) PONECH – kontrolují legitimní invarianty.
  2. Source-parsing asserce nahraď behaviorálními testy nad fake transportem
     (onSettings scénáře: local change s kandidátem, builtin apps change,
     kombinovaná změna, chyba mid-way = R7 fail-fast).
  3. Teprve potom posud' `refreshAvailability`: pokud po přepisu nemá produkční
     ani testovací call-site, odstraň ji; pokud má, nech a zdokumentuj proč.
- **Commit:** `test(awtrixng): behavioral onSettings coverage instead of source parsing`

### H6 [S] · F5p: přesun `DeviceFailer`/`DevicePoll` do lib/awtrix3

- **Soubory:** nový `lib/awtrix3/Interfaces.ts`; `drivers/awtrixlight/interfaces.ts`
  (smazat); importy: `lib/awtrix3/Api/Api.ts`, `drivers/awtrixlight/device.ts`
- **Kroky:** přesuň oba interfacy beze změny obsahu; `Api.ts` přestane importovat
  z `drivers/` (otočení směru závislosti UVNITŘ Awtrix3 – není to společný driver
  interface). Do commit message napiš důvod (lib nesmí záviset na driveru).
- **Ověření:** rituál + `grep -rn "drivers/" lib/awtrix3/` → nic.
- **Commit:** `refactor(awtrix3): move device contracts into lib to fix dependency direction`

### H7 [S] · F6p-1: deklarativní `migrate()`

- **Soubory:** `drivers/awtrixlight/device.ts`, `test/awtrix3-lifecycle.test.js`
- **Kroky:** popiš cílový stav daty: `desiredCapabilityOrder: string[]` + jedna
  smyčka (odstraň špatně seřazené, přidej chybějící ve správném pořadí). Sémantika
  1:1 se současným kódem – nejdřív test současného chování pro: správné pořadí
  (no-op), špatné pořadí (reset tří capabilities), chybějící `rssi`/`ip`/
  `button.rediscover`. Zachovej nastavení `ip` hodnoty po přidání.
- **Commit:** `refactor(awtrix3): declarative capability migration`

### H8 [S] · F6p-2: nezahazovat NG icon cache při nezměněném spojení

- **Soubory:** `drivers/awtrixng/device.ts`
- **Pozn. z re-auditu:** po 2.1.0 přestavbě se `activateClient` volá jen při reálné
  změně spojení nebo credentials – hodnota balíčku je malá. Jediný zbývající případ:
  `applySettingsChangesWithCandidateConnection` při změně, která se nakonec rovná
  současnému stavu. **Zvaž přeskočení** (označ v checklistu „vynecháno po re-auditu")
  – implementuj jen pokud je porovnání triviální: v `activateClient` porovnej
  baseUrl+auth se stávajícím klientem (ulož si je vedle) a při shodě ponech `icons`.
- **Commit:** `perf(awtrixng): keep icon cache when connection is unchanged` (nebo skip)

### H9 [O] · F6p-3 + V6: chybový kontrakt refresh vrstvy Awtrix3

- **Soubory:** `drivers/awtrixlight/device.ts`, `test/awtrix3-lifecycle.test.js`
- **Kroky:**
  1. `setCapabilityValues`: `Promise.all` → `allSettled`; při selhání vyhoď
     `AggregateError` s původními příčinami a klíči capability v message.
     Varianta „log + resolve" je zakázaná (sekce 1, pravidlo 5).
  2. V6: odstraň vnitřní `try/catch { this.log }` z `refreshCapabilities` a
     `refreshSettings`, aby agregace v `refreshAll` nebyla mrtvá větev.
  3. Zajisti, že selhání `refreshAll` NEshodí init: v `initializeDevice` obal
     `await this.refreshAll()` do `try/catch → this.error` (availability řídí fail
     counter, ne refresh). Poll callback už chyby chytá přes `onError` – ověř testem.
  4. Testy: capability write selže → AggregateError obsahuje klíč; init s padajícím
     refresh → doběhne, poll běží, chyba zalogovaná.
- **Commit:** `fix(awtrix3): propagate refresh errors through AggregateError without breaking init`

### H10 [S] · F6p-4: `BarLineValues` → `number[]`

- **Soubory:** `lib/awtrix3/Types.ts`, `test/core.test.js`
- **Kroky:** nejdřív testy vstupních cest `bar`/`line` (s ikonou max 11, bez 16,
  přes limit → zahodit, nečíselné → zahodit) – běhové limity hlídá `isBarLineValues`,
  typ je jen dokumentace. Pak nahraď 16řádkový union `number[]` s komentářem
  odkazujícím na validator.
- **Commit:** `refactor(awtrix3): simplify BarLineValues type, runtime limits unchanged`

### H11 [S] · F6p-5: invariant test `transitionEffect` proti dokumentaci

- **Soubory:** nový test v `test/awtrixng-settings-compose.test.js` (rozšíření)
- **Kroky:** vytáhni seznam `transitions` z vendorované dokumentace
  (`docs/vendor/awtrixng-http-api.md` / `awtrixng-http-openapi.yaml` – najdi
  sekci capabilities.transitions) do fixture v testu (s komentářem odkud);
  assert: každé `id` z dropdownu `transitionEffect` v
  `drivers/awtrixng/driver.settings.compose.json` ⊆ dokumentovaný seznam.
  Nemaž ani nedoplňuj hodnoty dropdownu – test jen hlídá drift.
- **Commit:** `test(awtrixng): pin transitionEffect dropdown to documented transitions`

### H12 [S] · F6p-6: omezená paralelizace uploadu bundled ikon NG

- **Soubory:** `drivers/awtrixng/device.ts`, `test/awtrixng-device-availability.test.js`
  (nebo kde je uploadBundledIcons kryté)
- **Kroky:** worker-pool se souběžností 3 (stejný vzor jako `findDiscoveredDevices`
  v NG driveru). **Zachovej R9:** všechny soubory se zpracují i po chybě, selhání
  se sbírají jako `{ fileName, error }` a na konci jednou `this.error(failures)`;
  cache ikon se invaliduje po úspěších (chování `icons.upload` se nemění).
- **Commit:** `perf(awtrixng): bounded parallel bundled icon upload`

### H13 [O] · F7p: upgrade lint toolchainu

- **Soubory:** `package.json`, `package-lock.json`, `.eslintrc.json` (možná formát)
- **Kroky:**
  1. Zjisti z oficiální dokumentace typescript-eslint kompatibilní verze pro TS 5.9
     (typescript-eslint v8 + ESLint 9, nebo nejvyšší řada podporující ESLint 8,
     pokud `eslint-config-athom` nezvládá ESLint 9 – OVĚŘ, nehádej).
  2. Upgrade proveď v samostatné větvi; nové lint nálezy řeš odděleným commitem:
     mechanické (import/order apod.) oprav, každé vypnutí pravidla zdůvodni komentářem.
     **Žádná změna runtime chování** – jen formát/styl.
  3. Node se neřeší (Homey 12.9.0+ = Node 22, tsconfig správně).
- **Commit:** `chore: upgrade eslint toolchain for TypeScript 5.9` (+ follow-up commit na nálezy)

### H14 [S] · F8p: CI workflow · rozhodnuto P3

- **Soubory:** nový `.github/workflows/ci.yml`
- **Kroky:**
  1. GitHub Actions, `ubuntu-latest`, Node 22 (`actions/setup-node`), `npm ci`.
  2. Blokující kroky: `npx tsc --noEmit`, `npm run build`, `node --test test/*.test.js`,
     `npm run lint`.
  3. Homey kroky: `npx homey app build` + `git diff --exit-code app.json`
     a `npx homey app validate --level publish`. **Nejdřív ověř, že fungují bez
     přihlášení** (homey CLI headless) – pokud ne, označ je `continue-on-error: true`
     s komentářem a poznamenej do checklistu.
  4. `npm audit --omit=dev` jako `continue-on-error: true` krok (P3: jen report).
  5. Trigger: push + pull_request na hlavní větev.
- **Commit:** `ci: build, test, lint and homey validation workflow`

### REL2 🔒(pokyn bckp) · Publikace 2.1.0

- **Předpoklad:** fáze G hotová; z fáze H hotové to, co bckp určí. Publikuje se
  **až na výslovný pokyn** (P4).
- **Kroky:** rituál + `homey app build` + `git diff --exit-code app.json` +
  `homey app validate --level publish`; zkontroluj `.homeychangelog.json` 2.1.0
  (vč. věty z G6; pokud mezitím proběhlo H4, jeho changelog jde do 2.1.1/2.2.0);
  samotný publish krok provádí bckp (App Store přihlášení).
- **Commit:** žádný nový (jen ověření), případně `chore(release): finalize 2.1.0 notes`

---

## 6. Checklist průběhu

| Balíček | Model | Stav | Commit | Pozn. |
|---|---|---|---|---|
| G1 | S | ✅ | `3c016d2` | P1: propsat chybu; lint nešel spustit v Linux VM (chybí native binding `unrs-resolver`) |
| G2 | S | ✅ | `5835460` | lint neověřen v Linux VM (stejný důvod jako G1); 289 pass |
| G3 | O | ✅ | `fb0a8ed` | fallback ze store; `setSettings` v `onSettings` je zakázané (`docs/awtrix-ng/06-user-maintainer-guide.md`), sync proto odložený přes `setImmediate` a jen při použití fallbacku; `commitConnection(..., false)` zůstává |
| G4 | S | ✅ | `a4f65a5` | lokální `isRecord`, `AwtrixNgInvalidResponseError` |
| G5 | S | ✅ | `ca6009a` | 5 discovery testů přepsaných z `rejects` na `false` + zalogovaná chyba (předepsaná změna chování) |
| G6 | S | ✅ | `1414daa` | R3a dluh splacen; text 2.1.0 má 311 znaků; lint u G3–G6 neověřen v Linux VM (viz G1) – 298 pass |
| H1 | O | ✅ | `1992b55` | `Support/Guards.ts`: `isRecord` (pole procházejí) + `isPlainObject` (prototype check z device – Transformers/JsonPayload/Icons prošly beze změny testů) + `toValidTcpPort`; device si nechává hard-fail wrapper `toConnectionPort`. Jediná změna testu: registrace `Support` v `awtrixng-lib-structure` (mechanická, ne sémantická). Lint už v sandboxu běží (doinstalován `@unrs/resolver-binding-linux-arm64-gnu`, `--no-save`) |
| H2 | S | ✅ | `f6c5830` | `#clientGetInternal` v `Api.ts`; `Client.get/getDirect` už delegovaly na `#getRequest` – bez duplicity, nemění se; S12: hláška z `weatherOverlayApiValues` |
| H3 | S | ✅ | `44f07f5` | 9 charakterizačních testů, 307 pass. **Korekce plánu (bod 7):** vadná barva ve fragmentu NEDÁ `c: '0'` – `isTextFragment` vyžaduje platnou barvu, takže se text zahodí celý a fallback `toColor('0')` v `toText` je dnes nedosažitelný. Navíc zafixován vedlejší efekt: `basicOptions` mutuje vstupní objekt (`options.duration = undefined`) |
| H4 | O | ✅ | `f269ccb` | tabulka `basicOptionRules` + jedna smyčka, pořadí klíčů zachováno; P2: `blinkText/fadeText: 0` se posílají, neplatná `color` se vynechá; `indicatorOptions` a fragmenty NEZMĚNĚNY. **Rozhodnutí bckp k `toText` (nad rámec P2):** JSON se parsuje jen u vstupu začínajícího `[`, ostatní text je literální – změna u `'null'`/`'true'`/`'{"a":1}'`/`'"abc"'`/`' 123 '`/`'1e3'` (3 aserce z H3 vědomě přepsané). **Changelog neřešen** (rozhodnutí bckp – text doplní při REL2, verze nebumpnuta). 309 pass |
| H5 | O | ✅ | `e71ce74` | 7 source-parsing testů nahrazeno 8 behaviorálními (routovaný fake transport: onInit sync, listenery bez spojení, selhání init sync, builtin apps, kombinovaná změna, R7 fail-fast, validace neznámého klíče před requestem, pořadí probe→write→commit). Strukturní/compose/entrypoint testy PONECHÁNY. `refreshAvailability` ZŮSTÁVÁ (má testovací call-site v `awtrixng-device-availability`) + doplněn doc komentář proč. 310 pass |
| H6 | S | ✅ | `d90db57` | obsah interfaců beze změny; `grep -rn "drivers/" lib/awtrix3/` je prázdný |
| H7 | S | ✅ | `ba4bca8` | `desiredCapabilityOrder` + `additionalCapabilities` + `isInDesiredOrder`, dvě smyčky; 6 nových testů fixujících chování PŘED refaktorem (no-op, drift, chybějící trojice, rssi/ip/rediscover, seed `ip` ze store, kontejnment chyby). Jediná drobná změna: přidání `button.rediscover` se teď loguje jako ostatní. 316 pass |
| H8 | S | ⬜ | | kandidát na skip po re-auditu |
| H9 | O | ⬜ | | AggregateError, ne log+resolve |
| H10 | S | ⬜ | | |
| H11 | S | ⬜ | | |
| H12 | S | ⬜ | | R9 zachovat |
| H13 | O | ⬜ | | samostatná větev |
| H14 | S | ⬜ | | P3: audit jen report |
| REL2 🔒 | – | ⬜ | | čeká na pokyn bckp (P4). **Dluh k changelogu:** H4 změnil pozorovatelné chování (`blinkText`/`fadeText` 0 se posílají; neplatná barva se vynechá; `toText` je literální – `'null'`, `'"abc"'`, `' 123 '`, `'1e3'` se zobrazí přesně jak zadané) – při publikaci rozhodnout verzi a doplnit text |

## 7. Vědomě vynecháno

- **V7 i18n drobnosti** (anglické hlášky adaptéru `applicationIcon` a
  `AwtrixNgDeviceIdentityMismatchError`) – diagnostické texty, ne uživatelské UI;
  neopravovat, dokud si o to uživatelé neřeknou.
- Sjednocování čehokoli mezi `lib/awtrix3` a `lib/awtrixng` – trvale (viz sekce 1).
- TTL cache ikon (R8), sekvenční fail-fast NG settings (R7) – rozhodnuto, neměnit.
- `getVersion()`, `getCapabilities()`, `toAwtrixNgRtttlPayload`,
  `fromAwtrixNgHomeyPushedAppName` – dokumentovaný API kontrakt, nemazat.
