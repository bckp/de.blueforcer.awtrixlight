# Prováděcí plán oprav – de.blueforcer.awtrixlight

> Tento dokument je **návod k provedení**, ne analýza. Je psaný pro model (Opus/Sonnet),
> který bude opravy implementovat. Analytické zázemí: [`claude.md`](claude.md),
> [`claude-remediation-plan.md`](claude-remediation-plan.md),
> [`claude-additional-risks.md`](claude-additional-risks.md),
> [`code-audit-2026-08-05.md`](code-audit-2026-08-05.md).
> Vztažný commit analýz: `f596dc9`. **Čísla řádků v analýzách driftují – hledej podle
> symbolů, ne podle řádků.**
>
> **Stav plánu: FINÁLNÍ (2026-08-05).** Všechna lidská rozhodnutí R1–R12 jsou zodpovězená
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
session, i kdyby se zdály triviální. A2 a A3 se oba dotýkají `package.json` a
`package-lock.json`; musí proto proběhnout sekvenčně v oddělených sessions.

---

## 1. Globální pravidla (platí pro každý balíček, bez výjimky)

**MUSÍŠ:**

1. **Awtrix3 (`drivers/awtrixlight` + `lib/awtrix3`) a AwtrixNG (`drivers/awtrixng` +
   `lib/awtrixng`) jsou dva oddělené drivery. Nesmí se nijak prolinat.** Stejný problém
   v obou vrstvách se řeší dvěma nezávislými implementacemi. Žádná sdílená třída,
   žádný společný transport, žádný import mezi `lib/awtrix3` a `lib/awtrixng`.
2. Před začátkem ověř `git status` – čistý strom. Jediná výjimka je A1: tři předem
   připravené `xlarge.png` smějí být jeho přesně vyjmenovaný vstupní diff. Předem
   připravené dokumentační změny plánu musí být před implementací commitnuté odděleně;
   checklist a upřesnění zjištěná při konkrétním balíčku patří do jeho commitu. Pracuj
   přímo na aktuální implementační větvi a pro jednotlivé balíčky nezakládej samostatné
   větve.
3. Jeden balíček = jeden commit (formát zprávy je u balíčku). Nic navíc.
4. `app.json` NIKDY needituj ručně – je generovaný. Změny dělej v `.homeycompose/`
   a přegeneruj přes `homey app build` (pokud CLI není dostupné, změň jen
   `.homeycompose/` a napiš to do commit message).
5. Chyby NG API se nesmí zahazovat ani zjednodušovat – zachovej HTTP status, kód,
   message a field (viz `AGENTS.md`).
6. Když musíš změnit existující test, aby prošel, znamená to změnu chování. Ověř,
   že je to PŘESNĚ ta změna, kterou balíček předepisuje. Pokud ne → revert, stop, zeptej se.
7. Po dokončení balíčku aktualizuj checklist v sekci 6 ve stejném commitu (jen ✅ a
   poznámka, **bez hashe**). Hash je dohledatelný v Git historii a nelze jej zapsat do
   commitu, jehož je součástí.

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
node --test test/*.test.js  # musí: 0 failed; zaznamenej aktuální počet pass
npm run lint              # musí: 0 errors (pozn.: funguje jen na macOS stroji vlastníka)
```

Pokud baseline neprochází už PŘED tvou změnou → stop, nahlas to, nezačínej. Počet
úspěšných testů se mezi balíčky přirozeně zvyšuje; nesmí klesnout, pokud to konkrétní
balíček výslovně nepředepisuje.

---

## 3. Rozhodnutí člověka – ZODPOVĚZENO 2026-08-05

Všechna rozhodnutí jsou uzavřená. Technické důvody z této tabulky jsou závaznou
součástí prováděcího plánu; implementace je nesmí reinterpretovat.

| # | Otázka | Blokuje | Odpověď bckp |
|---|---|---|---|
| R1 | `applicationIcon` + `lib/awtrix3/List/Apps.ts` | C6 | Kartu ponechat `deprecated` a doplnit funkční kompatibilní adaptér; smazat pouze nepoužitý skeleton. |
| R2 | Chybějící `xlarge.png` | A1 | Vytvořit nové high-resolution assety podle stávajícího vzhledu: app 1000×700, oba drivery 1000×1000. Připraveno a Homey publish validace prošla. |
| R3 | Migrace jmen custom app (B5) | C5 | Opravit pořadí normalizace, žádný dual-delete ani changelog. Staré dočasné app zaniknou restartem zařízení. |
| R4 | Nenakonfigurované NG zařízení (F11) | D6–D8 | `address`, `port` i credentials editovatelné; pairing je předvyplní. Každá změna i rediscovery se ověří dočasným klientem včetně UID a až potom commitne. |
| R5 | Sémantika fail counteru (N2) | C1 | **Ano** – `failThreshold = 3` = 3 po sobě jdoucí selhání → unavailable; úspěch nuluje. |
| R6-2 | 401 vs 403 při špatných credentials | D4 | **Ověřeno na zařízení: 401 v obou případech** (bez credentials i se špatnými). 403 správně zůstává v `offline` větvi. |
| R6-3 | Verze Node na Homey | (F7) | **Node 22** – Homey od verze 12.9.0 (naše minimum). `@tsconfig/node22` i `engines >= 22` jsou správně; nález F7 je uzavřen bez akce. |
| R6-1 | `txt.id` (mDNS) == `uid` (`/api/v1/device`)? | D6 | **Ověřeno na zařízení: SHODNÉ.** TXT: `"type=awtrixng" "name=awtrixng" "id=48e7291211d8"`, API `uid`: `48e7291211d8`. D6 odblokován. |
| R7 | Více skupin NG settings | D9 | Vše nejprve lokálně validovat, potom odesílat sekvenčně fail-fast. Operaci nenazývat atomickou; původní strukturovanou chybu zachovat. |
| R8 | TTL seznamu ikon | D3 | Zachovat AWTRIX 3 = 120 s (náročný HTML provider) a NG = 5 s (specializované API). Sdílet jen princip single-flight; po uploadu invalidovat cache. |
| R9 | Selhání uploadu bundled ikon | C3, D13 | U obou driverů nekritické: zpracovat všechny soubory, chyby agregovat a diagnosticky vypsat; u NG zachovat status/code/message/field. Zařízení zůstane použitelné. |
| R10 | Checklist a commity | globální pravidla | Jeden balíček = jeden commit; checklist bez hashů. |
| R11 | Volitelná fáze F | `plan-after.md` | Odložit celou do samostatného následného backlogu `docs/plan-after.md`. |
| R12 | Cílová release verze | REL1 | `2.1.0` (nová funkčnost bez úmyslného breaking change). |

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

Pořadí fází: **A → B → C → D → E → REL1**. Uvnitř fáze jdi po pořadí.
**Žádný balíček není blokovaný** – všechna rozhodnutí R1–R12 jsou zodpovězená v sekci 3.
Nízkoprioritní backlog fáze F není součástí tohoto provedení; je v `docs/plan-after.md`.

---

### FÁZE A – bezrizikové, mechanické (žádná změna runtime chování*)

*\*výjimky A7/A8 mění chování jen v jasně chybových situacích, viz jejich kroky.*

#### A1 · Chybějící `xlarge.png` — nálezy B2, N3 · rozhodnuto R2

- **Soubory:** `assets/images/`, `drivers/awtrixlight/assets/images/`,
  `drivers/awtrixng/assets/images/`
- **Kroky:** použij již připravené high-resolution varianty odvozené ze stávajícího
  vizuálu: (1) `assets/images/xlarge.png` 1000×700, (2)
  `drivers/awtrixlight/assets/images/xlarge.png` 1000×1000 a (3) náhradu
  `drivers/awtrixng/assets/images/xlarge.png` 1000×1000. Driverové obrázky zachovávají
  schválené samostatné vizuály: AWTRIX 3 původní ciferník a AWTRIX NG ciferník s nápisem
  „NG“. Negeneruj je znovu a nedeformuj app-level poměr stran.
- **Ověření:** rituál + rozměry všech tří (`sips -g pixelWidth -g pixelHeight *.png`)
  = app 1000×700, drivery 1000×1000; `homey app validate --level publish` musí projít.
- **Commit:** `fix(assets): provide high-resolution xlarge app and driver images`

#### A2 · Sjednocení verzí — nálezy T2, N4

- **Soubory:** `package.json`, `package-lock.json`, nový `test/version-consistency.test.js`
- **Kroky:** (1) `package.json` verze → `2.0.1`; (2) `npm install --package-lock-only`
  pro propsání do lockfile (root verze je dnes `1.0.2`); (3) nový test: verze v
  `package.json` === `.homeycompose/app.json` === `package-lock.json` root
  === `packages[""]`.
- **Nesmíš:** měnit verze závislostí v lockfile. Po `npm install --package-lock-only`
  vždy zkontroluj diff; pokud se změnilo cokoli mimo root metadata verze, změnu
  závislostí vrať a uprav pouze příslušná root version pole.
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
  `refreshAvailability` (waypoint pro source-parsing test; následný backlog v
  `docs/plan-after.md`).
- **Ověření:** rituál; počet testů musí být stejný jako bezprostřední baseline A7.
- **Commit:** `refactor: remove verified dead code (no behavior change)`

#### A8 · Ochranné testy manifestu — nálezy N8 + assety

- **Soubory:** nové `test/manifest.test.js`
- **Kroky:** dva testy nad `app.json`:
  1. každá lokální cesta v `images`/`icon` polích existuje na disku,
  2. každé flow action ID má runtime registraci – registrovaná ID zjisti regexem
     `getActionCard\('([^']+)'\)` nad `app.ts` + `drivers/*/driver.ts`;
     dočasný povolený seznam výjimek `manifestOnly = ['applicationIcon']` s komentářem,
     že C6 doplní kompatibilní runtime registraci a výjimku odstraní.
- **Neduplikuj:** version-consistency test z A2 ponech v jeho vlastním souboru.
- **Pozn.:** test (1) MUSÍ po A1 procházet; pokud A1 ještě neproběhl, dej chybějící
  xlarge do dočasného allowlistu s TODO komentářem a po A1 allowlist odstraň.
- **Commit:** `test: guard manifest assets, versions and flow card registrations`

#### A9 · Drobné opravy z třetího průchodu — `claude-additional-risks.md` (drobné poznámky)

- **Soubory:** `drivers/awtrixlight/driver.ts`, `lib/awtrix3/Normalizer.ts`,
  `test/core.test.js`
- **Kroky:**
  1. V `onPair` přesuň `getDiscoveryResults()` dovnitř `list_devices` handleru
     (dnes se snímkuje jednou při otevření session).
  2. `indicatorNumber`: nečíselné ID ani číslo mimo 1–3 nikdy nemapuj na skutečný
     indikátor. Vyhoď `RangeError` ještě před HTTP requestem; přidej unit test do
     `core.test.js` ověřující chybu a nulový počet requestů.
  3. V pairing datech změň `settings: { user: null, pass: null }` na `{ user: '', pass: '' }`
     (soulad s typem `text` v settings compose).
- **Commit:** `fix(awtrix3): pairing discovery snapshot, indicator validation, settings defaults`

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

> Provádět až po B1. Jednotné release notes pro všechny dokončené změny zapíše až
> REL1; jednotlivé balíčky neupravují již vydaný záznam `2.0.1`.

#### C1 · Stavový automat availability — nález N2 · rozhodnuto R5 (3 po sobě jdoucí)

- **Soubory:** `lib/awtrix3/Api/Api.ts`, `drivers/awtrixlight/device.ts`, testy z B1
- **Kroky:**
  1. Udělej `processResponseCode` i `processUnavailability` asynchronní a ve všech
     `clientGet`/`clientGetDirect`/`clientPost`/`clientUpload`/`clientVerify` call-sites
     je `await`uj. `setAvailable`/`setUnavailable` nesmí zůstat fire-and-forget.
  2. V `processResponseCode` case `Status.Ok`: volej `failsReset()` VŽDY
     (i když je zařízení available); early-return až po něm.
  3. V `processUnavailability`: nejdřív `failsAdd()`, pak `failsExceeded()` test.
  4. `poll.extend()` + `await setUnavailable` volej jen při PŘECHODU do unavailable.
     Použij `poll.isExtended()` jako synchronický guard: pokud je false, zavolej
     `poll.extend()` ještě před prvním `await` a potom awaitni `setUnavailable`.
     Neřiď přechod výsledkem neawaitovaného `getAvailable()`; souběžné chyby smějí
     přechod spustit právě jednou.
  5. Přepiš charakterizační test z B1 na cílovou sémantiku (R5): 3 po sobě jdoucí
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
  3. `refreshAll()`: udělej `async`; spusť `refreshCapabilities`, `refreshSettings` a
     `refreshEffects` souběžně přes `Promise.allSettled`, počkej na VŠECHNY výsledky a
     při chybě vyhoď `AggregateError` s původními příčinami. V `initializeDevice` ji
     awaituj PŘED `finally` blokem, aby fail-critical okno pokrylo celý refresh.
  4. `refreshSettings()`: `await this.setSettings(…)`.
  5. `onAdded`: přepiš na `fs.promises.readdir` + sekvenční `await uploadImage`.
     Selhání bundled ikony je podle R9 nekritické: pokračuj dalšími soubory, u každé
     chyby uchovej název souboru a původní příčinu a na konci zavolej `this.error`
     s jedním `AggregateError`. `onAdded` kvůli ikonám neodmítej.
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
  3. Rediscover button: v úspěšné větvi použij `await clientVerify(true)`. Po C1 se tím
     před návratem listeneru dokončí `setAvailable`, `failsReset` i restart pollu.
- **Test:** změna `TIM` s offline zařízením → NEPADÁ na credentials; změna `user`
  s offline zařízením → padá na `deviceUnreachable`, ne `invalidCredentials`.
- **Commit:** `fix(awtrix3): credential check only on credential change, rediscover restores availability`

#### C5 · Sanitizace jmen custom app — nález B5 · rozhodnuto R3

- **Soubory:** `lib/awtrix3/Normalizer.ts`, `lib/awtrix3/Api/Api.ts`, testy
- **Kroky:**
  1. Oprav `appName`: nejdřív `toLowerCase()`, potom odstraň znaky mimo `[a-z0-9]`.
     Pokud po sanitizaci nezůstane nic, vyhoď explicitní `RangeError`; nikdy neposílej
     samotné `homey:`.
  2. V `customApp` a `removeCustomApp` použij opravené `appName()` +
     `encodeURIComponent`: `custom?name=${encodeURIComponent(appName(name))}`.
  3. ŽÁDNÝ dual-delete a podle R3 ani žádný záznam do `.homeychangelog.json` – staré
     dočasné aplikace zaniknou restartem zařízení.
- **Test:** `My App & co` → `homey%3Amyappco`; přidej uppercase, oddělovače a vstup,
  který po sanitizaci zůstane prázdný; při chybě nesmí proběhnout HTTP request.
- **Commit:** `fix(awtrix3): sanitize and URL-encode custom app names`

#### C6 · Kompatibilita deprecated `applicationIcon` — nálezy B1, D1, A5(audit) · rozhodnuto R1

- **Soubory:** `app.ts`, `.homeycompose/flow/actions/applicationIcon.json`,
  `lib/awtrix3/List/Apps.ts`, `test/manifest.test.js`,
  `test/awtrixng-flow-compose.test.js`, testy shared flow akcí
- **Kroky:**
  1. Kartu ani její ID NEMAŽ; ponech `deprecated: true` a AWTRIX 3 filter. Neměň typy
     ani pořadí existujících argumentů, aby se nerozbily uložené Flows.
  2. V `app.ts` zaregistruj run listener, který převede legacy `name` ze stringu nebo
     autocomplete objektu (`id`/`name`) na neprázdný string a zavolá současný
     `runSharedApplicationAction`. Neplatný tvar musí skončit explicitní chybou.
  3. Pro `icon` použij existující `autocompleteSharedIconAction`. Pro legacy argument
     `name` zaregistruj jednoduchý autocomplete vracející z neprázdného query položku
     `{ id: query, name: query }`, aby deprecated karta zůstala technicky funkční i
     při editaci; nejde o emulaci seznamu aplikací.
  4. Smaž pouze `lib/awtrix3/List/Apps.ts` (nikde neimportované no-op stuby).
  5. Odeber `applicationIcon` z `manifestOnly` allowlistu v `test/manifest.test.js`,
     ale ponech kartu v compose i očekávaných titulcích.
- **Test:** registrace karty; běh se stringovým i autocomplete názvem volá přesně
  současnou AWTRIX 3 custom-app cestu; neplatný/blank název rejectne; manifest karta
  zůstává deprecated a runtime registrovaná.
- **Commit:** `fix(awtrix3): restore deprecated applicationIcon compatibility`

#### C7 · Hardening HTTP – redirecty a debug log — nálezy F4(awtrix3), N11

- **Soubory:** `lib/awtrix3/Api/Client.ts`, testy
- **Kroky:**
  1. Do všech axios volání přidej `maxRedirects: 0`.
  2. `statusFromHttpCode`: `Ok` jen pro `code >= 200 && code < 300` (3xx přestane být úspěch).
  3. Redakce `Authorization` v `#debugRequest`/`#debugResponse` – vlastní ~5řádkový
     helper po vzoru NG (`<redacted>`), ale NEIMPORTUJ nic z `lib/awtrixng`.
  4. Odstraň duplicitní inicializaci `log`. Odstraň vlastní `abortSignal` i jeho timer
     a ponech jediný timeout mechanismus axios `timeout: Timeout`; tím nevznikají
     nezrušené timery po dokončených requestech.
- **Test:** mock 302 → `Status.Error`; debug log obsahuje `<redacted>`, request skutečný token.
- **Commit:** `fix(awtrix3): no redirects, 2xx-only success, redacted auth in debug logs`

---

### FÁZE D – robustnost AWTRIX NG

> Nezávislá na fázi C. Pozor: `test/awtrixng-device-settings.test.js` parsuje ZDROJOVÝ
> text `drivers/awtrixng/device.ts` (mezi `async onSettings({` a `async refreshAvailability`).
> Pokud tvůj balíček tento úsek mění, uprav test vědomě a napiš to do commit message.

#### D1 · `poll.start()` vždy — nález B3

- **Soubory:** `drivers/awtrixng/device.ts`, `lib/awtrixng/Device/Availability.ts`, testy
- **Kroky:** v `onInit` obal blok `refreshDeviceState` + tři `refresh*FromDevice` do
  `try/catch/finally`: catch → `this.error(e)` + `await setUnavailable(<zpráva se
  zachovanými NG detaily>)`; finally → `this.poll.start()`. Z `Availability.ts` nejprve
  exportuj malý formatter technických detailů pro `unknown`/`AwtrixNgApiError` a použij
  jej zde i v existujícím availability mapování. Formatter musí zachovat message,
  field, code a HTTP status. Úspěšná cesta se nesmí změnit.
- **Test (harness B1 + fakeAwtrixNgTransport):** `getSettings` hodí `AwtrixNgApiError`
  → zařízení unavailable **a zároveň** `setInterval` byl zavolán.
- **Commit:** `fix(awtrixng): always start polling even when initial sync fails`

#### D2 · Single-flight poll + error handler — nálezy B4, N12

- **Soubory:** `lib/awtrixng/Device/Poll.ts`, `lib/awtrix3/Poll.ts`,
  `drivers/awtrixng/device.ts`, `drivers/awtrixlight/device.ts` – **dvě nezávislé
  úpravy stejného vzoru, žádné sdílení kódu**
- **Kroky (v každém souboru zvlášť):** interval callback obal:
  `if (running) return; running = true; Promise.resolve().then(() => cb()).catch(onError).finally(() => running = false)`.
  Pouhé `Promise.resolve(cb())` nepoužívej – nezachytí synchronní throw z `cb()`.
  `onError` přidej do konstruktoru jako povinný callback a oba device call-sites mu
  předají logger zachovávající celý error objekt (NG nesmí chybu převést jen na message).
  Po zapojení `onError` odstraň z AWTRIX 3 poll callbacku vnější `try/catch` přidaný
  v C3; jednotlivé operace dál awaituj, ale rejection zpracuje právě Poll.
  Zachovej existující API (`start/stop/isActive`, u awtrix3 i `extend/isExtended`).
- **Test:** fake timer, callback trvající 2 ticky → druhý tick se přeskočí;
  rejected callback → `onError` zavolán, poll běží dál.
- **Commit:** `fix(poll): single-flight execution and rejection handling in both drivers`

#### D3 · Icon cache: in-flight guard + TTL — nálezy N13, O8

- **Soubory:** `lib/awtrixng/Services/Icons.ts`, `lib/awtrix3/List/Icons.ts`,
  `drivers/awtrixlight/device.ts` (implementace driverů zůstávají oddělené)
- **Kroky:**
  1. NG `all()`: cachuj rozpracovanou Promise (`#inFlight ??= loadIcons().finally(…)`),
     rejection ji musí vyčistit a NESMÍ uložit prázdný seznam jako platný.
  2. Stejný vzor zvlášť implementuj v awtrix3 `Icons.all()`. Současný `loadIcons()`
     nesmí catchnout chybu a uložit `[]`; chybu propaguj do in-flight Promise a po
     rejection umožni další pokus.
  3. TTL ZÁMĚRNĚ NESJEDNOCUJ (R8): AWTRIX 3 ponech 120 s, protože parsuje náročný HTML
     provider; NG ponech 5 s, protože má rychlé specializované API. Ke konstantám přidej
     tento důvod.
  4. Přidej explicitní `invalidate()` do obou icon services. NG `upload()` ji zavolá
     po úspěchu; AWTRIX 3 `onAdded` z C3 ji zavolá po každém úspěšném `uploadImage`.
     Neúspěšný upload nesmí zahodit předchozí validní cache.
- **Commit:** `fix(icons): deduplicate in-flight loads and preserve driver-specific TTLs`

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
  `lib/awtrixng/Services/Apps.ts`, nový
  `lib/awtrixng/Api/InvalidResponseError.ts`, testy
- **Kroky:**
  1. `refreshAppsFromDevice`/`applyAwtrixNgBuiltinAppSettingsChange` konzumace:
     pokud `!Array.isArray(apps)` → throw novou `AwtrixNgInvalidResponseError`, která
     nese `endpoint`, očekávaný tvar a bezpečný popis skutečného typu; nečekej na
     náhodný `TypeError` z `.find`.
  2. `toAwtrixNgHomeySettingsUpdate`: do `update` nikdy nedávej `undefined` hodnoty
     (filtruj `value !== undefined`).
  3. `refreshSettingsFromDevice`: pokud odpověď není plain objekt → throw stejnou
     `AwtrixNgInvalidResponseError` s endpointem settings a očekávaným tvarem.
- **Nesmíš:** zavádět plnou runtime validaci všech polí – jen tyhle minimální guardy.
- **Commit:** `fix(awtrixng): guard response shapes before consuming settings/apps data`

#### D6 · NG re-discovery po změně IP — nález F1 ⚠️ nejdůležitější balíček fáze D · odblokováno R6-1

- **Soubory:** `drivers/awtrixng/device.ts`,
  `docs/awtrix-ng/06-user-maintainer-guide.md`, testy
- **Předpoklad SPLNĚN:** R6-1 ověřeno na fyzickém zařízení – `txt.id === uid`
  (`48e7291211d8`, záznam v sekci 3). Párování přes `r.id === this.getData().id`
  je korektní. Součástí balíčku je propsat toto ověření do
  `06-user-maintainer-guide.md`.
- **Kroky:**
  1. `onDiscoveryResult(r)` → `return r.id === this.getData().id;`
  2. Zaveď privátní NG-only helper pro **ověření kandidátního spojení před commitem**:
     z address/port/auth vytvoří dočasný klient, provede `probeAwtrixNgDevice`, vyžaduje
     stav `detected` a `result.device.uid === this.getData().id`. Pro `auth-required`
     a `offline` vyhodí původní error objekt; pro `rejected` použije
     `AwtrixNgInvalidResponseError` z D5 a pro jiné UID lokální
     `AwtrixNgDeviceIdentityMismatchError` s `expectedUid` a `actualUid`. Aktivní
     klient ani store při žádném neúspěchu nezmění.
  3. `onDiscoveryAddressChanged(r)` → sestav kandidátní `baseUrl` přes
     `toAwtrixNgBaseUrl` (port validuj jako v driveru), zavolej helper s aktuálními
     credentials a **až po úspěšném probe** awaitni zápis `baseUrl`/`address`/`port`,
     synchronizuj Homey settings a přepni klienta. Pak obnov stav zařízení.
  4. `onDiscoveryAvailable(r)` → pokud zařízení není available, proveď stejnou
     ověřovací a commit cestu jako (3); nekopíruj odlišnou variantu logiky.
  5. Vzor lifecycle metod si vezmi z `drivers/awtrixlight/device.ts`, ale
     implementuj nezávisle nad NG klientem – žádný import z awtrix3 vrstvy.
- **Test:** úspěšný fake discovery result → probe proběhne před zápisem a store/client
  se přepnou; offline, auth chyba nebo jiné UID → store, settings i aktivní klient
  zůstanou beze změny a chyba si zachová NG detaily.
- **Commit:** `feat(awtrixng): re-discover device after IP address change`

#### D7 · Adresa/port do NG device settings — nález F11 · rozhodnuto R4

- **Soubory:** `drivers/awtrixng/driver.settings.compose.json`,
  `drivers/awtrixng/driver.ts`, `drivers/awtrixng/device.ts`,
  `lib/awtrixng/Services/Settings.ts`,
  `locales/en.json`, testy
- **Kroky:**
  1. Do settings compose přidej skupinu „Connection" s poli `address` (text)
     a `port` (number, 1–65535, default 80) – s hintem, že se běžně plní automaticky.
  2. `address`/`port` přidej mezi **lokální** settings pole
     (`localSettingsFields` v `Services/Settings.ts` – nesmí se poslat zařízení
     jako device setting).
  3. V každé pairing cestě v `driver.ts` zapiš nalezené/manual `address` a `port` do
     `settings` vedle credentials; `baseUrl` dál zůstává jen odvozený store údaj.
  4. V `onSettings` zpracuj změnu `address`/`port`/credentials jednou společnou cestou:
     z CELÝCH `newSettings` sestav kandidátní spojení a použij dočasný probe helper z
     D6 včetně kontroly UID. Až po úspěchu přepni store a aktivního klienta. Při chybě
     nic necommituj a vyhoď původní NG chybu se všemi detaily.
  5. Pokud stejný submit obsahuje také device settings, lokálně připrav všechny payloady,
     ověř kandidátní spojení a remote zápisy proveď přes kandidátní klient; aktivní
     spojení přepni až po jejich úspěchu. D9 určuje sekvenční fail-fast pořadí.
  6. `onInit` bez adresy nastaví explicitní unavailable důvod, ale dokončí registraci
     capability listenerů a dovolí `onSettings` opravu. Každá operace vyžadující klienta
     musí do té doby vyhodit explicitní „connection not configured" chybu; žádný no-op.
  7. Discovery změna z D6 synchronizuje settings `address`/`port`, aby UI nelhalo.
- **Pozor:** source-parsing test `awtrixng-device-settings.test.js` – uprav vědomě.
- **Commit:** `feat(awtrixng): allow fixing device address via settings`

#### D8 · Drobné NG opravy — nálezy F10, F4(NG), F12

- **Soubory:** `drivers/awtrixng/flow-actions.ts`,
  `lib/awtrixng/Http/AxiosTransport.ts`, `drivers/awtrixng/driver.ts`
- **Kroky:**
  1. F10: do `AwtrixNgFlowActionDevice` přidej `hasCapability(id: string): boolean`;
     ve `runAwtrixNgWeatherOverlayAction` zapiš capability jen když existuje.
  2. F4: `maxRedirects: 0` v `AxiosTransport` configu (redirect → `AwtrixNgHttpError`
     se zachovanými detaily).
  3. F12: Homey discovery strategy už podle compose filtruje mDNS name/protocol a
     runtime výsledek je dál neposkytuje. Zjednoduš `isAwtrixNgMdnsCandidate` na
     explicitní kontrolu `txt.type === 'awtrixng'`; odstraň mrtvá pole/konstanty
     `serviceName`, `name`, `protocol` a jejich testy nahraď testy TXT typu.
- **Neduplikuj:** ověření credentials je již jednotně vyřešené v D7; nevytvářej zde
  druhou cestu.
- **Commit:** `fix(awtrixng): capability guard, no redirects and honest mdns check`

#### D9 · Validace před zápisem + sekvenční fail-fast settings — rozhodnuto R7

- **Soubory:** `drivers/awtrixng/device.ts`, `lib/awtrixng/Services/Settings.ts`,
  `lib/awtrixng/Services/Apps.ts`, testy (pozor na source-parsing test!)
- **Kroky:**
  1. Odděl přípravu/validaci payloadů od write requestů. Nejprve validuj všechny
     hodnoty, které lze ověřit lokálně (včetně obecného settings patch a typů builtin
     přepínačů). Pokud se mění builtin apps, potom smí proběhnout read-only `getApps`,
     guard tvaru z D5 a konstrukce order payloadu. **Žádný write request nesmí začít,
     dokud nejsou obě skupiny připravené.**
  2. Potom odešli write skupiny ve stávajícím pořadí sekvenčně. Při první API
     chybě okamžitě skonči a vyhoď PŮVODNÍ error objekt; žádný `join`, nový plain
     `Error` ani `allSettled`.
  3. V komentáři a testech pojmenuj kontrakt přesně: endpointy neposkytují transakci,
     takže při selhání druhého requestu může být první skupina už aplikovaná. Další
     uložení stav dorovná; neimplementuj nespolehlivý rollback.
- **Test:** lokálně neplatná druhá skupina → 0 requestů; chyba při `getApps` → 0 write
  requestů; chyba prvního write endpointu → druhý se nevolá; chyba druhého → původní
  strukturovaná chyba je identická a první write je jediný možný částečný zápis.
- **Commit:** `fix(awtrixng): validate settings before sequential fail-fast writes`

#### D10 · Paralelní discovery + sjednocení konstrukce klienta — nálezy O5, S7, B5(audit)

- **Soubory:** `drivers/awtrixng/driver.ts`, testy
- **Kroky:**
  1. Vytvoř privátní `#createProbeClient({ baseUrl, auth? })` factory a použij ji ve
     všech třech cestách (`probeManualPairingInput`, `probePendingAuthPairTarget`,
     `probeDiscoveryResult`). Mapování výsledků ponech v každém workflow explicitní,
     protože mají odlišné výstupní tvary; nevynucuj společný `#mapProbeResult`.
     Stavy `detected/auth-required/rejected/offline` a serializace chyb se NESMÍ změnit.
  2. `findDiscoveredDevices`: nejdřív synchronní filtr kandidátů, pak probe paralelně
     s limitem 4 souběžných (malý inline semafor, žádná nová závislost);
     výsledky seřaď deterministicky podle `name`.
- **Nesmíš:** slučovat manual/credentials/discovery workflow do jednoho.
- **Commit:** `refactor(awtrixng): shared probe client factory and bounded parallel discovery`

#### D11 · Validace číselných polí NG payloadů — nález B9

- **Soubory:** `lib/awtrixng/Payload/Transformers.ts`, `test/awtrixng-transformers.test.js`
- **Kroky:**
  1. Pro číselná pole `durationMs`, `repeat`, `textBlinkMs`, `textFadeMs`,
     `textOffsetX`, `iconOffsetX`, `effectSpeed`, `paletteSpan`, `paletteSpeed`,
     `lifetimeMs` a `progress` ověř minimálně `typeof value === 'number'` a
     `Number.isFinite(value)`.
  2. Integer/range validaci přidej JEN tam, kde ji výslovně dokládá
     `docs/vendor/awtrixng-http-openapi.yaml`. Současné OpenAPI deklaruje u flat
     pushed-app polí pouze `textOffsetX: integer`; nedovozuj nezápornost offsetů,
     celočíselnost `effectSpeed` ani rozsah `progress` z AWTRIX 3 či názvu pole.
  3. `assertBooleanField` použij pro `hold`, `stack`, `wakeup`, `soundLoop`,
     `textCenter`, `textInFront`, `chartAutoscale`, `paletteBlend`.
  4. Ke každému poli bez doloženého rozsahu přidej `// UNKNOWN: range not documented`;
     aplikace má hlídat bezpečný typ, firmware zůstává autoritou pro nezdokumentované
     doménové rozsahy.
- **Test:** `NaN`/`Infinity` reject; záporný offset a desetinný `effectSpeed` se nesmí
  odmítnout bez dokumentovaného důvodu; non-boolean hodnoty boolean polí reject.
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

#### D13 · Bundled NG ikony jsou nekritické — rozhodnuto R9

- **Soubory:** `drivers/awtrixng/device.ts`, testy
- **Kroky:** `uploadBundledIcons()` ponech sekvenční, ale zpracuj všechny soubory.
  Každý neúspěch ulož jako `{ fileName, error }` s PŮVODNÍM error objektem. Po dokončení
  pošli celý strukturovaný seznam do `this.error`; status, code, message a field nesmí
  být zploštěné ani ztracené. Chyby nevyhazuj z `onAdded`, zařízení kvůli bundled ikonám
  nenastavuj unavailable. Úspěšné uploady dál invalidují NG icon cache.
- **Test:** jeden upload selže a další uspěje → oba byly zavolány, `onAdded` resolve,
  diagnostika obsahuje fileName a identický `AwtrixNgApiError` včetně všech detailů.
- **Commit:** `fix(awtrixng): report bundled icon failures without blocking pairing`

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

- **Soubory:** `lib/awtrixng/Api/Types.ts`, `lib/awtrixng/Payload/Transformers.ts`,
  `lib/awtrixng/Services/Settings.ts`, testy
- **Kroky:** pro `pageFields`, `notificationFields`, `pushedAppFields`, `indicatorFields`,
  `scrollFields`, `settingsFields`: vzor
  `const map: Record<keyof AwtrixNgApiPagePayload, true> = {…}` +
  `const pageFields = Object.keys(map)` – TypeScript pak vynutí synchronizaci s typem.
  `notificationFields = new Set([...pageFields, ...notificationOnlyFields])` (S9 – only
  seznamy definuj jednou). S10: `writableSettingsFields` v `Services/Settings.ts` importuj
  z jedné konstanty místo druhé kopie.
- **Commit:** `refactor(awtrixng): field allowlists type-checked against API payload types`

---

### ZÁVĚREČNÝ RELEASE BALÍČEK

#### REL1 · Připravit release 2.1.0 — rozhodnuto R12

- **Předpoklad:** A1–E2 včetně D13 jsou dokončené, checklist je zelený a worktree čistý.
- **Soubory:** `.homeycompose/app.json`, `package.json`, `package-lock.json`,
  `.homeychangelog.json`, generovaný `app.json`, version/manifest testy
- **Kroky:**
  1. Zvyš verzi v `.homeycompose/app.json`, `package.json` a root metadata
     `package-lock.json` na `2.1.0`; závislosti ani jejich resolved verze se nesmí změnit.
  2. Do `.homeychangelog.json` přidej jediný konsolidovaný anglický záznam `2.1.0`,
     který shrne spolehlivost AWTRIX 3, bezpečně editovatelné NG připojení,
     rediscovery a zachování API chyb. Podle R3 nezmiňuj změnu normalizace názvů app.
  3. Přegeneruj `app.json` přes `homey app build`; ruční editace je zakázaná.
  4. Spusť celý rituál, version-consistency test a
     `homey app validate --level publish`. Zkontroluj, že Git diff neobsahuje
     dependency update ani soubor z `docs/plan-after.md` backlogu.
- **Nesmíš:** publikovat aplikaci, tagovat release ani pushovat bez samostatného
  výslovného pokynu uživatele.
- **Commit:** `chore(release): prepare 2.1.0`

---

## 5. Co je vědomě VYNECHÁNO (neopravovat!)

- Dvojice Poll/Client/Normalizer/Icons/Types mezi vrstvami – záměrné oddělení
  (`claude.md` sekce 6).
- `getVersion()`, `getCapabilities()`, `toAwtrixNgRtttlPayload`,
  `fromAwtrixNgHomeyPushedAppName` – dokumentovaný API kontrakt, nemazat.
- Duplicitní driver assets (ikony, small/large) – Homey je vyžaduje per-driver.
- Deprecated karty `customApp`, `notificationIcon`, `notificationJson`,
  `removeCustomApp` a `applicationIcon` – zůstávají funkční.
- Nález F7 (Node runtime vs. tsconfig) – **UZAVŘENO bez akce**: Homey 12.9.0+ (naše minimum)
  běží na Node 22, `@tsconfig/node22` i `engines >= 22` jsou správně (ověřil bckp, R6-3).
- Veškerý nízkoprioritní úklid z `docs/plan-after.md` – není součástí tohoto provedení.

## 6. Checklist průběhu

| Balíček | Stav | Pozn. |
|---|---|---|
| A1 | ✅ | R2: rozměry i publish validace ověřeny; NG používá schválený samostatný vizuál |
| A2 | ✅ | package, lockfile a Homey compose sjednoceny na 2.0.1; přidán consistency test |
| A3 | ✅ | nepoužité přímé závislosti odebrány; `mime-types` zůstává jen tranzitivně přes `form-data` |
| A4 | ✅ | inertní volby odstraněny; struktura `.homeybuild` před/po beze změny |
| A5 | ✅ | README popisuje sdílené karty a NG-only `applicationRaw`/`weatherOverlay` |
| A6 | ✅ | `.homeyignore` vylučuje dokumentaci, testy a projektové meta soubory; `.homeycompose/` zůstává dostupná buildu |
| A7 | ✅ | odstraněno osm ověřených mrtvých bloků; pairing test aktualizován dle schváleného rozsahu |
| A8 | ✅ | manifest assety i runtime registrace kryté testy; dočasný allowlist `applicationIcon` zůstává do C6 |
| A9 | ✅ | discovery načítáno při `list_devices`; indikátory validovány před requestem; credentials používají prázdné stringy |
| A10 | ✅ | `settingOptions` iteruje jen podporované klíče; `user`/`pass` se neposílají do device settings |
| B1 | ✅ | fake Homey má řízené timery a oddělené AWTRIX 3/NG klienty; fail counter charakterizován pro pre-C1 stav |
| C1 | ✅ | R5: 3 consecutive; úspěch resetuje; unavailable/recovery jsou awaitované a přechod nastane právě jednou |
| C2 | ✅ | AWTRIX 3 write metody odmítají neúspěch; flow chyby propagují a onSettings awaituje setSettings |
| C3 | ✅ | lifecycle operace jsou awaitované; refresh chyby agregované; upload ikon sekvenční a nekritický |
| C4 | ✅ | credentials se ověřují jen při změně; auth a offline chyby jsou rozlišené; rediscover dokončí recovery |
| C5 | ✅ | appName lowercasuje před sanitizací; endpointy používají URL encoding; bez dual-delete a changelogu |
| C6 | ✅ | R1: deprecated karta má kompatibilní runtime adaptér; no-op Apps skeleton odstraněn |
| C7 | ✅ | AWTRIX 3 nepovoluje redirecty, uznává jen 2xx a rediguje Authorization v debug logu |
| D1 | ✅ | polling startuje ve finally; init chyby zachovávají NG message, field, code i HTTP status |
| D2 | ✅ | oba Poll objekty jsou single-flight; rejection se loguje jako původní error a další tick pokračuje |
| D3 | ✅ | R8: oddělené single-flight cache; TTL 120 s AW3 / 5 s NG; úspěšný upload invaliduje cache |
| D4 | ✅ | každý HTTP 401 znamená auth-required bez závislosti na envelope; 403 zůstává offline dle R6-2 |
| D5 | ✅ | guardy settings/apps tvarů, strukturovaná chyba a filtrování undefined hodnot |
| D6 | ✅ | R6-1 zdokumentováno; discovery probe a kontrola UID proběhnou před přepnutím spojení |
| D7 | ⬜ | R4: address/port/auth, pairing + settings |
| D8 | ⬜ | credential verification už řeší D7 |
| D9 | ⬜ | R7: validate-all, potom sequential fail-fast |
| D10 | ⬜ | sdílet factory, ne output mapper |
| D11 | ⬜ | žádné nedokumentované rozsahy |
| D12 | ⬜ | |
| D13 | ⬜ | R9: NG icon upload nekritický, strukturovaná diagnostika |
| E1 | ⬜ | |
| E2 | ⬜ | |
| REL1 | ⬜ | R12: 2.1.0, bez publikace |
