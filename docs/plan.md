# Prováděcí plán oprav – de.blueforcer.awtrixlight

> Tento dokument je **návod k provedení**, ne analýza. Je psaný pro model (Opus/Sonnet),
> který bude opravy implementovat. Analytické zázemí: [`claude.md`](claude.md),
> [`claude-remediation-plan.md`](claude-remediation-plan.md),
> [`claude-additional-risks.md`](claude-additional-risks.md),
> [`code-audit-2026-08-05.md`](code-audit-2026-08-05.md).
> Vztažný commit analýz: `f596dc9`. **Čísla řádků v analýzách driftují – hledej podle
> symbolů, ne podle řádků.**
>
> **Stav plánu: FINÁLNÍ (2026-08-05).** Všechna lidská rozhodnutí R1–R6 jsou zodpovězená
> v sekci 3, včetně hardware ověření na fyzickém AwtrixNG. Žádný balíček není blokovaný.

---

## 0. Jak s tímto plánem pracovat

**Pro člověka (bckp):** každý balíček spouštěj v nové session tímto promptem:

```
Přečti docs/plan.md. Proveď POUZE balíček <ID>. Dodržuj globální pravidla v sekci 1
a ověřovací rituál v sekci 2. Pokud narazíš na cokoli nejednoznačného, zastav se
a zeptej se – nehádej. Po dokončení aktualizuj checklist v sekci 6.
```

**Pro model:** načti si tento soubor, `AGENTS.md` a soubory uvedené u balíčku.
Analytické dokumenty otevírej jen tehdy, když ti kroky balíčku nestačí – balíčky jsou
psané tak, aby stačily samy o sobě. Šetři kontext: nečti celé `lib/` ani `node_modules`.

**Ekonomika tokenů:** balíčky jsou řazené tak, že fáze A je levná (drobné, mechanické) –
pokud dochází rozpočet, fáze A má smysl i samostatně. Balíčky NIKDY neslučuj do jedné
session, i kdyby se zdály triviální. Výjimka: A2+A3+A4+A5+A6 lze provést v jedné session
jako jeden commit-per-balíček, protože se nedotýkají stejných souborů.

---

## 1. Globální pravidla (platí pro každý balíček, bez výjimky)

**MUSÍŠ:**

1. **Awtrix3 (`drivers/awtrixlight` + `lib/awtrix3`) a AwtrixNG (`drivers/awtrixng` +
   `lib/awtrixng`) jsou dva oddělené drivery. Nesmí se nijak prolinat.** Stejný problém
   v obou vrstvách se řeší dvěma nezávislými implementacemi. Žádná sdílená třída,
   žádný společný transport, žádný import mezi `lib/awtrix3` a `lib/awtrixng`.
2. Před začátkem ověř `git status` – čistý strom. Pracuj na větvi `fix/<id-balíčku>`.
3. Jeden balíček = jeden commit (formát zprávy je u balíčku). Nic navíc.
4. `app.json` NIKDY needituj ručně – je generovaný. Změny dělej v `.homeycompose/`
   a přegeneruj přes `homey app build` (pokud CLI není dostupné, změň jen
   `.homeycompose/` a napiš to do commit message).
5. Chyby NG API se nesmí zahazovat ani zjednodušovat – zachovej HTTP status, kód,
   message a field (viz `AGENTS.md`).
6. Když musíš změnit existující test, aby prošel, znamená to změnu chování. Ověř,
   že je to PŘESNĚ ta změna, kterou balíček předepisuje. Pokud ne → revert, stop, zeptej se.
7. Po dokončení balíčku aktualizuj checklist v sekci 6 (✅ + hash commitu).

**NESMÍŠ:**

1. Refaktorovat „při cestě" cokoliv mimo kroky balíčku – ani zjevné duplicity.
   Zvlášť: duplicity mezi vrstvami awtrix3/awtrixng jsou ZÁMĚRNÉ (viz `claude.md` sekce 6).
2. Přejmenovávat soubory, symboly nebo flow ID nad rámec balíčku.
3. Měnit `drivers/shared-flow-actions.ts` dispatch vzor (explicitní type guard +
   výjimka pro nepodporovaný typ) – jen doplňovat podle stejného vzoru.
4. Mazat deprecated flow karty – mohou být v uživatelských flows.
5. Rozhodovat věci ze sekce 3 – ty rozhoduje člověk.
6. Instalovat nové závislosti (výjimka: balíček to explicitně předepisuje).

---

## 2. Ověřovací rituál

Spusť **před začátkem** (baseline) i **po dokončení** každého balíčku:

```bash
npx tsc --noEmit          # musí: 0 chyb
npm run build             # musí: projít
node --test test/*.test.js  # musí: 0 failed (baseline: 206 pass)
npm run lint              # musí: 0 errors (pozn.: funguje jen na macOS stroji vlastníka)
```

Pokud baseline neprochází už PŘED tvou změnou → stop, nahlas to, nezačínej.

---

## 3. Rozhodnutí člověka – ZODPOVĚZENO 2026-08-05

Všechna rozhodnutí padla; jediná zbývající neznámá je R6(1) – viz poznámka pod tabulkou.

| # | Otázka | Blokuje | Odpověď bckp |
|---|---|---|---|
| R1 | `applicationIcon` + `lib/awtrix3/List/Apps.ts` | C6 | **(a) Smazat obojí** – kartu i skeleton, + záznam do changelogu. |
| R2 | Chybějící `xlarge.png` | A1 | **(b) Upscale z `large.png`** – vygenerovat 1000×1000 pro app-level, awtrixlight i náhradu NG fake souboru. |
| R3 | Migrace jmen custom app (B5) | C5 | **(a) Přijmout + changelog** – žádný dual-delete; staré raw-jmenné aplikace si uživatel smaže na zařízení. |
| R4 | Nenakonfigurované NG zařízení (F11) | D7 | **(a) Adresa/port do device settings** – umožnit rekonfiguraci přes `onSettings`. |
| R5 | Sémantika fail counteru (N2) | C1 | **Ano** – `failThreshold = 3` = 3 po sobě jdoucí selhání → unavailable; úspěch nuluje. |
| R6-2 | 401 vs 403 při špatných credentials | D4 | **Ověřeno na zařízení: 401 v obou případech** (bez credentials i se špatnými). 403 správně zůstává v `offline` větvi. |
| R6-3 | Verze Node na Homey | (F7) | **Node 22** – Homey od verze 12.9.0 (naše minimum). `@tsconfig/node22` i `engines >= 22` jsou správně; nález F7 je uzavřen bez akce. |
| R6-1 | `txt.id` (mDNS) == `uid` (`/api/v1/device`)? | D6 | **Ověřeno na zařízení: SHODNÉ.** TXT: `"type=awtrixng" "name=awtrixng" "id=48e7291211d8"`, API `uid`: `48e7291211d8`. D6 odblokován. |

### Záznam ověření R6-1 (provedeno 2026-08-05, fyzické AwtrixNG zařízení, macOS `dns-sd`)

```
awtrixng._awtrixng._tcp    TXT    "type=awtrixng" "name=awtrixng" "id=48e7291211d8"
GET /api/v1/device → "uid": "48e7291211d8"
```

**Závěr: `txt.id === uid` – potvrzeno.** Párování v `onDiscoveryResult` přes
`r.id === this.getData().id` je korektní. Balíček D6 má za úkol tento fakt
propsat i do `docs/awtrix-ng/06-user-maintainer-guide.md` (sekce ověřených
předpokladů), aby přežil mimo tento plán.

---

## 4. Fáze a balíčky

Pořadí fází: **A → B → C → D → E → F**. Uvnitř fáze jdi po pořadí.
**Žádný balíček není blokovaný** – všechna rozhodnutí R1–R6 jsou zodpovězená v sekci 3.

---

### FÁZE A – bezrizikové, mechanické (žádná změna runtime chování*)

*\*výjimky A7/A8 mění chování jen v jasně chybových situacích, viz jejich kroky.*

#### A1 · Chybějící `xlarge.png` — nálezy B2, N3 · rozhodnuto R2(b)

- **Soubory:** `assets/images/`, `drivers/awtrixlight/assets/images/`,
  `drivers/awtrixng/assets/images/`
- **Kroky:** upscale `large.png` → 1000×1000 (např.
  `sips -z 1000 1000 large.png --out xlarge.png` nebo ImageMagick s kvalitním filtrem).
  Vytvoř: (1) `assets/images/xlarge.png` z app-level `large.png`,
  (2) `drivers/awtrixlight/assets/images/xlarge.png` z driver `large.png`,
  (3) NAHRAĎ `drivers/awtrixng/assets/images/xlarge.png` – současný soubor je jen
  bitová kopie `large.png` (500×500), ne skutečný xlarge.
- **Ověření:** rituál + rozměry všech tří (`sips -g pixelWidth -g pixelHeight *.png`)
  = 1000×1000.
- **Commit:** `fix(assets): provide real 1000x1000 xlarge images (upscaled)`

#### A2 · Sjednocení verzí — nálezy T2, N4

- **Soubory:** `package.json`, `package-lock.json`, nový `test/version-consistency.test.js`
- **Kroky:** (1) `package.json` verze → `2.0.1`; (2) `npm install --package-lock-only`
  pro propsání do lockfile (root verze je dnes `1.0.2`); (3) nový test: verze v
  `package.json` === `.homeycompose/app.json` === `package-lock.json` root
  === `packages[""]`.
- **Nesmíš:** měnit verze závislostí v lockfile.
- **Commit:** `chore: align version across package.json, lockfile and homey manifest`

#### A3 · Odstranit nepoužité závislosti — nález N5

- **Soubory:** `package.json`, `package-lock.json`
- **Kroky:** odeber `mime-types` z `dependencies` a `@types/mime-types` z
  `devDependencies`; přegeneruj lockfile. Před tím ověř grepem, že `mime` není nikde
  importováno mimo `node_modules` (stav k `f596dc9`: není).
- **Ověření:** rituál kompletně – zvlášť `npm run build`.
- **Commit:** `chore: drop unused mime-types dependency`

#### A4 · Úklid tsconfig — nález N6

- **Soubory:** `tsconfig.json`
- **Kroky:** odeber `allowJs`, `baseUrl`, `paths` (nic z toho nemá efekt – všechny importy
  jsou relativní, žádné produkční `.js` neexistuje). NEZAVÁDĚJ aliasy.
- **Ověření:** rituál + porovnej strukturu `.homeybuild` před/po (testy z ní requirují).
- **Commit:** `chore: remove inert tsconfig options`

#### A5 · Oprava README — nález N7

- **Soubory:** `README.md`
- **Kroky:** oprav řádek tvrdící „AWTRIX NG flows use separate `awtrixng*` flow cards".
  Realita: podporovaný subset jede přes sdílené karty (dispatch dle `getAwtrixDeviceType()`),
  NG-only jsou pouze `applicationRaw` a `weatherOverlay`. Slaď s
  `docs/awtrix-ng/06-user-maintainer-guide.md`. **Neměň architekturu, jen text.**
- **Commit:** `docs: align README flow-card description with implementation`

#### A6 · `.homeyignore` — nález T5

- **Soubory:** nový `.homeyignore`
- **Kroky:** vytvoř s obsahem minimálně: `.DS_Store`, `docs/`, `test/`, `AGENTS.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`. Ověř v dokumentaci Homey CLI, že
  `.homeycompose/` ignorovat nelze/netřeba (build ji potřebuje).
- **Commit:** `chore: add .homeyignore to keep dev files out of the app bundle`

#### A7 · Bezpečný mrtvý kód — nálezy D2, D5, D6, D8, D9, D13, D14, D15

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `drivers/awtrixlight/device.ts`,
  `drivers/awtrixlight/driver.ts`, `lib/awtrix3/Validator.ts`,
  `drivers/awtrixng/device.ts`, `lib/awtrixng/Payload/Transformers.ts`,
  `drivers/awtrixng/pair/manual_pairing_placeholder.html`
- **Kroky – smaž přesně toto, nic víc:**
  1. `Api.isAvaible()` (D2)
  2. `cmdReboot`, `cmdSetSettings`, `cmdGetImages` v awtrixlight device (D5)
  3. konstantu `ManualAdd` + nedosažitelný `if (ManualAdd)` blok v awtrixlight driver (D6)
  4. no-op `if (stats.uptime <= this.getStoreValue('uptime'))` blok – ale ponech
     `setStoreValue('uptime', …)` (D8)
  5. větev `typeof color === 'number'` v `isColor` (D9)
  6. konstantně pravdivou podmínku `if (!availability.available)` v NG device –
     `setUnavailable` volej přímo (D13)
  7. vnitřní redundantní `if (!allowedFields.has(field))` v `assertKnownFields` –
     ponech throw, odstraň jen mrtvou podmínku (D14)
  8. zakomentované tlačítko `back-to-list` + jeho mrtvý handler v pairing HTML (D15)
- **NEMAŽ:** `appName`, `isHomeyApp`, `toTextFragments` (D3 – `appName` se zapojí v C5),
  `List/Apps.ts` (🔒R1), `isExtended` (D4 – používá ho `core.test.js`),
  `toAwtrixNgRtttlPayload`, `fromAwtrixNgHomeyPushedAppName`, `getVersion`,
  `getCapabilities` (D10–D12 – dokumentovaný API kontrakt, viz `claude.md` sekce 9),
  `refreshAvailability` (waypoint pro source-parsing test, řeší se ve F4).
- **Ověření:** rituál; počet testů se nesmí změnit (206).
- **Commit:** `refactor: remove verified dead code (no behavior change)`

#### A8 · Ochranné testy manifestu — nálezy N8 + assety

- **Soubory:** nové `test/manifest.test.js`
- **Kroky:** tři testy nad `app.json`:
  1. každá lokální cesta v `images`/`icon` polích existuje na disku,
  2. každé flow action ID má runtime registraci – registrovaná ID zjisti regexem
     `getActionCard\('([^']+)'\)` nad `app.ts` + `drivers/*/driver.ts`;
     povolený seznam výjimek `manifestOnly = ['applicationIcon']` s komentářem
     odkazujícím na R1,
  3. verze test z A2 sem případně přesuň (jeden soubor pro manifest invarianty).
- **Pozn.:** test (1) MUSÍ po A1 procházet; pokud A1 ještě neproběhl, dej chybějící
  xlarge do dočasného allowlistu s TODO komentářem a po A1 allowlist odstraň.
- **Commit:** `test: guard manifest assets, versions and flow card registrations`

#### A9 · Drobné opravy z třetího průchodu — `claude-additional-risks.md` (drobné poznámky)

- **Soubory:** `drivers/awtrixlight/driver.ts`, `lib/awtrix3/Normalizer.ts`
- **Kroky:**
  1. V `onPair` přesuň `getDiscoveryResults()` dovnitř `list_devices` handleru
     (dnes se snímkuje jednou při otevření session).
  2. `indicatorNumber`: pokud `!isNumeric(id)`, vrať `1` (default) místo `NaN`
     – přidej unit test do `core.test.js`.
  3. V pairing datech změň `settings: { user: null, pass: null }` na `{ user: '', pass: '' }`
     (soulad s typem `text` v settings compose).
- **Commit:** `fix(awtrix3): pairing discovery snapshot, indicator NaN guard, settings defaults`

#### A10 · F2 – `settingOptions` propouští cizí klíče ⚠️ nejdůležitější balíček fáze A

- **Soubory:** `lib/awtrix3/Normalizer.ts`, `test/core.test.js`
- **Kontext:** runtime ověřeno: `settingOptions({user:'admin',pass:'secret',TIM:true})`
  vrací `{TIM:true,user:true,pass:true}` → credentials-odvozené booleany jdou na
  `POST /api/settings` zařízení.
- **Kroky:** v `settingOptions` iteruj **jen přes `Object.keys(defaultSettingsOptions)`**
  (bez `TEFF`), ne přes merge s `options`. Chování pro známé klíče se nesmí změnit –
  existující testy `settings retain transition effect zero` a spol. musí projít beze změny.
- **Test:** `assert.deepEqual(settingOptions({ user: 'a', pass: 'b', TIM: true }), { TIM: true })`
- **Commit:** `fix(awtrix3): stop leaking unknown settings keys (user/pass) to device settings endpoint`

---

### FÁZE B – testovací záchranná síť (nutná pro fáze C a D)

#### B1 · Fake Homey harness — nález N1

- **Soubory:** nové `test/helpers/fake-homey.js`, `test/awtrix3-lifecycle.test.js`
- **Kroky:**
  1. Harness: `createFakeHomey()` s řízenými timery (`tick(ms)`, žádné reálné čekání),
     `__: (k) => k`, záznamem `setInterval`/`clearInterval` volání;
     `createFakeAwtrix3Device()` se zaznamenávanými `setCapabilityValue`, `setSettings`,
     `setAvailable`/`setUnavailable`, `getStoreValue`/`setStoreValue`.
  2. **Dva oddělené fake klienty**: `fakeAwtrix3Client` (odpovídá tvarem
     `lib/awtrix3/Api/Client` Response objektům) a `fakeAwtrixNgTransport`
     (implementuje `AwtrixNgHttpTransport.request`, umí vracet `AwtrixNgHttpError`).
     ŽÁDNÝ společný fake pro obě vrstvy.
  3. První reálný test: charakterizace SOUČASNÉHO chování fail counteru
     (`Api.processResponseCode` + device fails* metody) – zafixuj dnešní chování včetně
     obou vad (reset se nevolá při Ok+available; unavailable až 4. chybou).
     Tenhle test se v C1 vědomě přepíše – dej mu komentář `// characterization: pre-C1`.
- **Ověření:** rituál; nové testy zelené.
- **Commit:** `test: fake Homey harness + characterization tests for awtrix3 availability`

---

### FÁZE C – chybový a async kontrakt AWTRIX 3 ⚠️ mění pozorovatelné chování

> Každý balíček této fáze = položka do release notes. Provádět až po B1.

#### C1 · Stavový automat availability — nález N2 · rozhodnuto R5 (3 po sobě jdoucí)

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `drivers/awtrixlight/device.ts`, testy z B1
- **Kroky:**
  1. V `processResponseCode` case `Status.Ok`: volej `failsReset()` VŽDY
     (i když je zařízení available); early-return až po něm.
  2. V `processUnavailability`: nejdřív `failsAdd()`, pak `failsExceeded()` test.
  3. `poll.extend()` + `setUnavailable` volej jen při PŘECHODU do unavailable
     (ne opakovaně při každé další chybě – jinak se extended interval pořád restartuje).
  4. Přepiš charakterizační test z B1 na cílovou sémantiku (R5): 3 po sobě jdoucí
     selhání → unavailable; úspěch kdykoli → reset; recovery → available + normální poll.
- **Commit:** `fix(awtrix3): fail counter counts consecutive failures, threshold means 3`

#### C2 · Propagace write chyb — nálezy N9, B6

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `drivers/awtrixlight/device.ts`,
  `locales/en.json`, testy
- **Kroky:**
  1. Do `Api` přidej privátní helper: `async #requireOk(promise)` → když resolve na
     `false`, `throw new Error(this.device.homey.__('api.error.commandFailed'))`.
     Klíč přidej do `locales/en.json`.
  2. Obal jím write metody: `dismiss`, `rtttl`, `power`, `indicator`, `appNext`,
     `appPrev`, `reboot`, `notify`, `customApp`, `removeCustomApp`, `setSettings`,
     `uploadImage`. Signatury `cmd*` metod v device zůstávají `Promise<void>` –
     **shared driver interface se nemění**.
  3. V `onSettings`: `await this.api.setSettings(newSettings)` (bez `.catch(this.error)`) –
     selhání musí odmítnout uložení nastavení.
- **Test:** flow akce s klientem vracejícím `Status.Error` → reject; s `Status.Ok` → resolve.
- **Commit:** `fix(awtrix3): failed device writes now reject instead of resolving silently`

#### C3 · Lifecycle await — nálezy N10, B4(awtrix3 část), O7

- **Soubory:** `drivers/awtrixlight/device.ts`, testy
- **Kroky (po jednom, mezi kroky spouštěj testy):**
  1. `onInit`: `await this.initializeDevice()`.
  2. Poll callback: obal celé tělo `try { await … } catch (e) { this.error(e); }` –
     await `refreshCapabilities()` i `tryRediscover()`.
  3. `refreshAll()`: udělej `async`, `await Promise.all([refreshCapabilities(),
     refreshSettings(), refreshEffects()])`; v `initializeDevice` ji awaituj PŘED
     `finally` blokem (fail-critical okno musí pokrýt celý refresh).
  4. `refreshSettings()`: `await this.setSettings(…)`.
  5. `onAdded`: přepiš na `fs.promises.readdir` + sekvenční `await uploadImage` s
     `try/catch` per soubor a souhrnným `this.error` (paralelizace až ve F, ne teď).
  6. `onDiscoveryAddressChanged`: `await` u `setStoreValue` i `setCapabilityValue`.
- **Nesmíš:** měnit pořadí `failsCritical(true/false)` vůči testu dostupnosti – jen
  rozšířit rozsah čekání.
- **Commit:** `fix(awtrix3): await lifecycle operations, contain poll errors`

#### C4 · F3 + F8 — settings netestují credentials zbytečně, rediscover button obnoví zařízení

- **Soubory:** `drivers/awtrixlight/device.ts`, `locales/en.json`, testy
- **Kroky:**
  1. `onSettings`: credentials test (`testDevice`) spouštěj JEN když
     `changedKeys.includes('user') || changedKeys.includes('pass')`.
  2. Rozliš výsledek podle `Status` z `clientVerify`: `AuthRequired`/`AuthFailed`
     → `states.invalidCredentials`; `NotFound`/`Error` → nový klíč
     `states.deviceUnreachable` („Device is not reachable, try again later").
  3. Rediscover button: v úspěšné větvi nahraď `clientVerify()` za `clientVerify(true)`
     (procesuje response code → setAvailable + failsReset + poll restart).
- **Test:** změna `TIM` s offline zařízením → NEPADÁ na credentials; změna `user`
  s offline zařízením → padá na `deviceUnreachable`, ne `invalidCredentials`.
- **Commit:** `fix(awtrix3): credential check only on credential change, rediscover restores availability`

#### C5 · Sanitizace jmen custom app — nález B5 · rozhodnuto R3(a)

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `.homeychangelog.json`, testy
- **Kroky:** v `customApp` a `removeCustomApp` použij existující `appName()`
  z `Normalizer` + `encodeURIComponent`:
  `custom?name=${encodeURIComponent(appName(name))}`.
  ŽÁDNÝ dual-delete legacy jmen (rozhodnutí R3a) – místo toho přidej do
  `.homeychangelog.json` poznámku, že aplikace vytvořené staršími verzemi pod
  nenormalizovaným jménem je potřeba jednorázově smazat přímo na zařízení.
- **Test:** jméno `My App & co` → URL obsahuje `homey%3Amyappco`.
- **Commit:** `fix(awtrix3): sanitize and URL-encode custom app names`

#### C6 · Odstranit `applicationIcon` + `List/Apps.ts` — nálezy B1, D1, A5(audit) · rozhodnuto R1(a)

- **Soubory:** `.homeycompose/flow/actions/applicationIcon.json`,
  `lib/awtrix3/List/Apps.ts`, `test/manifest.test.js`,
  `test/awtrixng-flow-compose.test.js`, `.homeychangelog.json`
- **Kroky:**
  1. Smaž `.homeycompose/flow/actions/applicationIcon.json`, přegeneruj `app.json`.
  2. Smaž `lib/awtrix3/List/Apps.ts` (nikde neimportováno, jen no-op stuby).
  3. Odeber `applicationIcon` z allowlistu `manifestOnly` v `test/manifest.test.js`
     a z očekávaných titulků v `test/awtrixng-flow-compose.test.js`.
  4. Zapiš do `.homeychangelog.json`: karta nikdy neměla implementaci a byla odstraněna.
- **Commit:** `feat(awtrix3)!: remove never-functional applicationIcon card and Apps skeleton`

#### C7 · Hardening HTTP – redirecty a debug log — nálezy F4(awtrix3), N11

- **Soubory:** `lib/awtrix3/Api/Client.ts`, testy
- **Kroky:**
  1. Do všech axios volání přidej `maxRedirects: 0`.
  2. `statusFromHttpCode`: `Ok` jen pro `code >= 200 && code < 300` (3xx přestane být úspěch).
  3. Redakce `Authorization` v `#debugRequest`/`#debugResponse` – vlastní ~5řádkový
     helper po vzoru NG (`<redacted>`), ale NEIMPORTUJ nic z `lib/awtrixng`.
  4. Bonus (S16/S17, stejný soubor): odstraň duplicitní inicializaci `log`;
    v `abortSignal` ulož timer a zrušit ho po dokončení requestu – nebo `abortSignal`
    úplně odstraň a nech jen axios `timeout` (vyber jedno, okomentuj).
- **Test:** mock 302 → `Status.Error`; debug log obsahuje `<redacted>`, request skutečný token.
- **Commit:** `fix(awtrix3): no redirects, 2xx-only success, redacted auth in debug logs`

---

### FÁZE D – robustnost AWTRIX NG

> Nezávislá na fázi C. Pozor: `test/awtrixng-device-settings.test.js` parsuje ZDROJOVÝ
> text `drivers/awtrixng/device.ts` (mezi `async onSettings({` a `async refreshAvailability`).
> Pokud tvůj balíček tento úsek mění, uprav test vědomě a napiš to do commit message.

#### D1 · `poll.start()` vždy — nález B3

- **Soubory:** `drivers/awtrixng/device.ts`, testy
- **Kroky:** v `onInit` obal blok `refreshDeviceState` + tři `refresh*FromDevice` do
  `try/catch/finally`: catch → `this.error(e)` + `setUnavailable(<zpráva se zachovanými
  NG detaily – použij formatery z Device/Availability.ts>)`; finally → `this.poll.start()`.
  Úspěšná cesta se nesmí změnit.
- **Test (harness B1 + fakeAwtrixNgTransport):** `getSettings` hodí `AwtrixNgApiError`
  → zařízení unavailable **a zároveň** `setInterval` byl zavolán.
- **Commit:** `fix(awtrixng): always start polling even when initial sync fails`

#### D2 · Single-flight poll + error handler — nálezy B4, N12

- **Soubory:** `lib/awtrixng/Device/Poll.ts` a `lib/awtrix3/Poll.ts` – **dvě nezávislé
  úpravy stejného vzoru, žádné sdílení kódu**
- **Kroky (v každém souboru zvlášť):** interval callback obal:
  `if (running) return; running = true; Promise.resolve(cb()).catch(onError).finally(() => running = false)`.
  `onError` přidej do konstruktoru (NG: povinný, musí logovat celou chybu;
  awtrix3: default `console.log`-kompatibilní, device předá `this.error`).
  Zachovej existující API (`start/stop/isActive`, u awtrix3 i `extend/isExtended`).
- **Test:** fake timer, callback trvající 2 ticky → druhý tick se přeskočí;
  rejected callback → `onError` zavolán, poll běží dál.
- **Commit:** `fix(poll): single-flight execution and rejection handling in both drivers`

#### D3 · Icon cache: in-flight guard + TTL — nálezy N13, O8

- **Soubory:** `lib/awtrixng/Services/Icons.ts`, `lib/awtrix3/List/Icons.ts` (odděleně!)
- **Kroky:**
  1. NG `all()`: cachuj rozpracovanou Promise (`#inFlight ??= loadIcons().finally(…)`),
     rejection ji musí vyčistit a NESMÍ uložit prázdný seznam jako platný.
  2. Stejný vzor zvlášť implementuj v awtrix3 `Icons.all()`.
  3. TTL: sjednoť na 60 s v obou (NG `DefaultCacheTtlMs`, awtrix3 `Timeout`) +
     komentář proč (autocomplete per-keystroke vs. čerstvost).
- **Commit:** `fix(icons): in-flight request dedup and unified 60s cache TTL`

#### D4 · Auth-required detekce — nález F5

- **Soubory:** `lib/awtrixng/Discovery/Detection.ts`, `test/awtrixng-detection.test.js`
- **Kroky:** `isUnauthorizedError` → klasifikuj podle `httpStatus === 401` samotného;
  `code === 'unauthorized'` už nevyžaduj. Envelope detaily dál zachovej v `error`.
  403 NECH v `offline` větvi – **ověřeno na zařízení (R6-2): firmware vrací 401 jak
  bez credentials, tak se špatnými**, 403 tedy není auth signál. Přidej k tomu komentář
  s odkazem na toto ověření.
- **Test:** 401 bez envelope → `auth-required`; 401 s `code:'unknownErrorEnvelope'`
  → `auth-required`; 500 → `offline`.
- **Commit:** `fix(awtrixng): treat any HTTP 401 as auth-required during probe`

#### D5 · Guardy tvarů odpovědí — nález F6

- **Soubory:** `drivers/awtrixng/device.ts`, `lib/awtrixng/Services/Settings.ts`,
  `lib/awtrixng/Services/Apps.ts`, testy
- **Kroky:**
  1. `refreshAppsFromDevice`/`applyAwtrixNgBuiltinAppSettingsChange` konzumace:
     pokud `!Array.isArray(apps)` → throw popsané chyby (styl
     `UnsupportedAwtrixNgPayloadFieldError` nebo nová malá error třída v NG vrstvě),
     ne `TypeError` z `.find`.
  2. `toAwtrixNgHomeySettingsUpdate`: do `update` nikdy nedávej `undefined` hodnoty
     (filtruj `value !== undefined`).
  3. `refreshSettingsFromDevice`: pokud odpověď není objekt → throw popsané chyby.
- **Nesmíš:** zavádět plnou runtime validaci všech polí – jen tyhle minimální guardy.
- **Commit:** `fix(awtrixng): guard response shapes before consuming settings/apps data`

#### D6 · NG re-discovery po změně IP — nález F1 ⚠️ nejdůležitější balíček fáze D · odblokováno R6-1

- **Soubory:** `drivers/awtrixng/device.ts`, `drivers/awtrixng/driver.compose.json`
  (jen pokud přidáváš maintenance button), `docs/awtrix-ng/06-user-maintainer-guide.md`, testy
- **Předpoklad SPLNĚN:** R6-1 ověřeno na fyzickém zařízení – `txt.id === uid`
  (`48e7291211d8`, záznam v sekci 3). Párování přes `r.id === this.getData().id`
  je korektní. Součástí balíčku je propsat toto ověření do
  `06-user-maintainer-guide.md`.
- **Kroky:**
  1. `onDiscoveryResult(r)` → `return r.id === this.getData().id;`
  2. `onDiscoveryAddressChanged(r)` → nová `baseUrl` přes `toAwtrixNgBaseUrl`
     (port z discovery výsledku validuj jako v driveru), `setStoreValue('baseUrl', …)`
     + `address`/`port`, `this.configureClient(newBaseUrl, await this.getSettings())`,
     `await this.refreshDeviceState({ allowAddCapabilities: false })`.
  3. `onDiscoveryAvailable(r)` → pokud zařízení není available, proveď totéž co (2).
  4. Vzor si vezmi z `drivers/awtrixlight/device.ts` (onDiscovery* metody), ale
     implementuj nezávisle nad NG klientem – žádný import z awtrix3 vrstvy.
- **Test:** fake discovery result s novou adresou → store aktualizován, vytvořen nový
  transport (ověř přes zaznamenanou baseUrl), proběhl probe.
- **Commit:** `feat(awtrixng): re-discover device after IP address change`

#### D7 · Adresa/port do NG device settings — nález F11 · rozhodnuto R4(a)

- **Soubory:** `drivers/awtrixng/driver.settings.compose.json`,
  `drivers/awtrixng/device.ts`, `lib/awtrixng/Services/Settings.ts`,
  `locales/en.json`, testy
- **Kroky:**
  1. Do settings compose přidej skupinu „Connection" s poli `address` (text)
     a `port` (number, 1–65535, default 80) – s hintem, že se běžně plní automaticky.
  2. `address`/`port` přidej mezi **lokální** settings pole
     (`localSettingsFields` v `Services/Settings.ts` – nesmí se poslat zařízení
     jako device setting).
  3. V `onSettings`: při změně `address`/`port` sestav novou baseUrl
     (`toAwtrixNgBaseUrl`), proveď probe novým klientem; úspěch → zapiš store
     (`baseUrl`, `address`, `port`) + `configureClient`; selhání → vyhoď se
     zachovanými NG detaily a store neměň.
  4. `onInit` větev „není nakonfigurováno": místo prostého `setUnavailable` + return
     zaregistruj alespoň nic-nedělající stav tak, aby `onSettings` fungoval
     (dnes hází „Device address is not configured yet." dřív, než se k rekonfiguraci
     dostane – uprav pořadí kontrol).
  5. Po D6: discovery změna adresy musí settings hodnoty synchronizovat
     (`setSettings({address, port})`), aby UI nelhalo.
- **Pozor:** source-parsing test `awtrixng-device-settings.test.js` – uprav vědomě.
- **Commit:** `feat(awtrixng): allow fixing device address via settings`

#### D8 · Drobné NG opravy — nálezy F10, F4(NG), F12, B7(část 1)

- **Soubory:** `drivers/awtrixng/flow-actions.ts`, `drivers/awtrixng/device.ts`,
  `lib/awtrixng/Http/AxiosTransport.ts`, `drivers/awtrixng/driver.ts`
- **Kroky:**
  1. F10: do `AwtrixNgFlowActionDevice` přidej `hasCapability(id: string): boolean`;
     ve `runAwtrixNgWeatherOverlayAction` zapiš capability jen když existuje.
  2. F4: `maxRedirects: 0` v `AxiosTransport` configu (redirect → `AwtrixNgHttpError`
     se zachovanými detaily).
  3. F12: `isAwtrixNgMdnsCandidate` volání v driveru – předej skutečná data discovery
     výsledku, pokud je Homey poskytuje; jinak funkci v Detection.ts zjednoduš na
     kontrolu `txt.type` a smaž mrtvou name/protocol větev (uprav testy detection).
  4. B7 část: v `onSettings` před `configureClient` s novými credentials proveď probe
     s novým klientem; při selhání vyhoď (se zachovanými NG detaily) a klienta neměň.
- **Commit:** `fix(awtrixng): capability guard, no redirects, honest mdns check, credential verification`

#### D9 · B7 část 2 – atomicita settings

- **Soubory:** `drivers/awtrixng/device.ts`, testy (pozor na source-parsing test!)
- **Kroky:** obě apply operace (`applyAwtrixNgBuiltinAppSettingsChange`,
  `applyAwtrixNgHomeySettingsChange`) spusť přes `Promise.allSettled`; pokud něco
  selhalo, vyhoď souhrnnou chybu se VŠEMI detaily (join přes ` | `). Nikdy neignoruj
  ani jednu z chyb.
- **Commit:** `fix(awtrixng): apply all settings groups, aggregate failures`

#### D10 · Paralelní discovery + sjednocení probe cest — nálezy O5, S7, B5(audit)

- **Soubory:** `drivers/awtrixng/driver.ts`, testy
- **Kroky:**
  1. Vytvoř privátní `#createProbeClient({ baseUrl, auth? })` (factory) a
     `#mapProbeResult(result, ctx)` (mapper na pairing response) – použij je ve
     všech třech cestách (`probeManualPairingInput`, `probePendingAuthPairTarget`,
     `probeDiscoveryResult`). Stavy `detected/auth-required/rejected/offline`
     a serializace chyb se NESMÍ změnit.
  2. `findDiscoveredDevices`: nejdřív synchronní filtr kandidátů, pak probe paralelně
     s limitem 4 souběžných (malý inline semafor, žádná nová závislost);
     výsledky seřaď deterministicky podle `name`.
- **Nesmíš:** slučovat manual/credentials/discovery workflow do jednoho.
- **Commit:** `refactor(awtrixng): shared probe factory/mapper, bounded parallel discovery`

#### D11 · Validace číselných polí NG payloadů — nález B9

- **Soubory:** `lib/awtrixng/Payload/Transformers.ts`, `test/awtrixng-transformers.test.js`
- **Kroky:** doplň do `assertPagePayload` (a notification/pushedApp variant) kontroly
  `assertNonNegativeIntegerField` pro `durationMs`, `repeat`, `textBlinkMs`, `textFadeMs`,
  `textOffsetX`, `iconOffsetX`, `effectSpeed`, `paletteSpan`, `paletteSpeed`, `lifetimeMs`
  a `assertBooleanField` pro `hold`, `stack`, `wakeup`, `soundLoop`, `textCenter`,
  `textInFront`, `chartAutoscale`, `paletteBlend`. Rozsahy ber VÝHRADNĚ z
  `docs/vendor/awtrixng-http-openapi.yaml`; pole bez doloženého rozsahu nech bez
  validace s komentářem `// UNKNOWN: range not documented`.
- **Pozor:** `progress` – OpenAPI pravděpodobně 0–100, ověř. `textOffsetX` může být
  záporné – ověř v OpenAPI, případně jen `Number.isInteger`.
- **Commit:** `feat(awtrixng): validate numeric and boolean payload fields per OpenAPI`

#### D12 · Lokalizace NG uživatelských textů — nález F9

- **Soubory:** `drivers/awtrixng/device.ts`, `drivers/awtrixng/driver.ts`,
  `locales/en.json`, testy
- **Kroky:** texty jdoucí uživateli překládej na hranici driver/device přes `homey.__`:
  availability zprávy (hlavičku přelož, technické detaily code/field/status nech EN
  za dvojtečkou), „Device address is not configured yet.", pairing položka
  `'Add manually'` → `homey.__('pair.manual.title')`. `lib/awtrixng` se NEMĚNÍ
  (nesmí znát Homey i18n) – jen konzumace jeho strukturovaných stavů.
- **Commit:** `fix(awtrixng): localize user-facing availability and pairing texts`

---

### FÁZE E – jeden zdroj pravdy pro NG seznamy polí (nálezy S8, S9, S10)

> Mechanicky rozsáhlé, funkčně nulové. Dělat po částech; po KAŽDÉM kroku musí projít
> celá testovací sada BEZE ZMĚNY testů (změna testu = změna chování = chyba).

#### E1 · String-literal uniony

- **Soubory:** `lib/awtrixng/Api/Types.ts`, `lib/awtrixng/Payload/Transformers.ts`
- **Kroky:** pro `scrollModes`, `scrollDirections`, `scrollEntries`, `scrollWhenFits`,
  `textCases`, `fonts`, `iconModes`, `lifetimeExpiries`: přesuň `as const` pole do
  `Api/Types.ts` (export s prefixem `AwtrixNg…`), typ odvoď `typeof X[number]`,
  v Transformers importuj konstantu a smaž lokální kopii.
- **Commit:** `refactor(awtrixng): derive enum types from single const arrays`

#### E2 · Seznamy klíčů objektů

- **Kroky:** pro `pageFields`, `notificationFields`, `pushedAppFields`, `indicatorFields`,
  `scrollFields`, `settingsFields`: vzor
  `const map: Record<keyof AwtrixNgApiPagePayload, true> = {…}` +
  `const pageFields = Object.keys(map)` – TypeScript pak vynutí synchronizaci s typem.
  `notificationFields = new Set([...pageFields, ...notificationOnlyFields])` (S9 – only
  seznamy definuj jednou). S10: `writableSettingsFields` v `Services/Settings.ts` importuj
  z jedné konstanty místo druhé kopie.
- **Commit:** `refactor(awtrixng): field allowlists type-checked against API payload types`

---

### FÁZE F – zbývající úklid (volitelné, nízká priorita)

Stručně; detaily v `claude-remediation-plan.md` etapa 5:

- **F1p:** S1 `isRecord` → `lib/awtrixng/Support/Guards.ts` (`isRecord`, `isPlainObject`);
  `drivers/shared-flow-actions.ts` si nechá vlastní kopii (nesmí importovat z lib/awtrixng).
- **F2p:** S14 `clientGet`/`clientGetDirect` sjednotit uvnitř awtrix3 Api; S4/S5/S12
  drobné duplicity dle plánu.
- **F3p:** O1 `toText` + O2 `basicOptions` tabulkově – NEJDŘÍV napiš testy fixující
  současné chování falsy hodnot (`blinkText: 0` se dnes zahazuje, `toColor` invalid → `'0'`),
  každou odchylku řeš jako vědomé rozhodnutí, ne mlčky.
- **F4p:** T4 – nahradit source-parsing testy behaviorálními (harness z B1);
  potom teprve smazat `refreshAvailability` (D-kandidát z A7, odložený).
- **F5p:** O12 – přesun `DeviceFailer`/`DevicePoll` do `lib/awtrix3/` (otočení směru
  závislosti; NENÍ to slučování vrstev).
- **F6p:** O11 `migrate()` deklarativně; O9 (`configureClient` nezahazovat icon cache);
  O10 (`setCapabilityValues` → `allSettled` s logem); O3 (`BarLineValues` → `number[]`);
  O4 (test statického `transitionEffect` seznamu proti `getCapabilities()` – zapojení,
  ne mazání); O6 (bounded parallel upload ikon NG).
- **F7p:** T1 – upgrade `eslint` + `@typescript-eslint` na verze podporující TS 5.9
  (samostatná větev, vyplaví nové lint nálezy – řešit odděleně od všeho ostatního).
- **F8p:** T6 – CI workflow: build, test, `homey app build` + `git diff --exit-code
  app.json`, `homey app validate --level publish`, `npm audit --omit=dev`.

---

## 5. Co je vědomě VYNECHÁNO (neopravovat!)

- Dvojice Poll/Client/Normalizer/Icons/Types mezi vrstvami – záměrné oddělení
  (`claude.md` sekce 6).
- `getVersion()`, `getCapabilities()`, `toAwtrixNgRtttlPayload`,
  `fromAwtrixNgHomeyPushedAppName` – dokumentovaný API kontrakt, nemazat.
- Duplicitní driver assets (ikony, small/large) – Homey je vyžaduje per-driver.
- Deprecated karty `customApp`, `notificationIcon`, `notificationJson`,
  `removeCustomApp` – zůstávají funkční.
- F7 (Node runtime vs. tsconfig) – **UZAVŘENO bez akce**: Homey 12.9.0+ (naše minimum)
  běží na Node 22, `@tsconfig/node22` i `engines >= 22` jsou správně (ověřil bckp, R6-3).

## 6. Checklist průběhu

| Balíček | Stav | Commit | Pozn. |
|---|---|---|---|
| A1 | ⬜ | | R2: upscale |
| A2 | ⬜ | | |
| A3 | ⬜ | | |
| A4 | ⬜ | | |
| A5 | ⬜ | | |
| A6 | ⬜ | | |
| A7 | ⬜ | | |
| A8 | ⬜ | | |
| A9 | ⬜ | | |
| A10 | ⬜ | | |
| B1 | ⬜ | | |
| C1 | ⬜ | | R5: 3 consecutive |
| C2 | ⬜ | | |
| C3 | ⬜ | | |
| C4 | ⬜ | | |
| C5 | ⬜ | | R3a: bez dual-delete |
| C6 | ⬜ | | R1a: smazat obojí |
| C7 | ⬜ | | |
| D1 | ⬜ | | |
| D2 | ⬜ | | |
| D3 | ⬜ | | |
| D4 | ⬜ | | |
| D5 | ⬜ | | |
| D6 | ⬜ | | R6-1 ověřeno: txt.id == uid |
| D7 | ⬜ | | R4a: settings |
| D8 | ⬜ | | |
| D9 | ⬜ | | |
| D10 | ⬜ | | |
| D11 | ⬜ | | |
| D12 | ⬜ | | |
| E1 | ⬜ | | |
| E2 | ⬜ | | |
| F1p–F8p | ⬜ | | volitelné |
