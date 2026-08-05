# Plán náprav – companion k `docs/claude.md`

> Vypracováno: 2026-08-05 · Stav repozitáře: commit `f596dc9`, pracovní strom čistý
> **V rámci přípravy tohoto dokumentu nebyl změněn žádný zdrojový soubor.**

## Jak dokument číst

- **ID** odpovídají nálezům v [`docs/claude.md`](claude.md): `B*` chyby, `D*` mrtvý kód,
  `S*` duplicity, `O*` zjednodušení, `T*` tooling.
- Položky `N*` jsou **nové**, doplněné po srovnání s [`docs/code-audit-2026-08-05.md`](code-audit-2026-08-05.md).
  U každé je uvedeno, zda pochází odtud nebo z tohoto průchodu, a jak jsem ji ověřil.
- Každá náprava má **Cíl / Postup / Riziko / Ověření / Odhad**.
- Náčrty kódu jsou ilustrace záměru, ne hotové patche. Řádkové odkazy platí ke commitu `f596dc9`.
- **Odhad** je hrubý: `XS` < 30 min, `S` ~1 h, `M` půl dne, `L` 1–2 dny.

## Mantinely, které žádná náprava nesmí porušit

Převzato z `AGENTS.md` a ze zadání:

1. AWTRIX 3 musí zůstat funkční. Legacy Flow karty zůstávají použitelné, jen se mohou označit `deprecated`.
2. **Drivery Awtrix3 a AwtrixNG jsou oddělené vrstvy. Žádná náprava je nesmí slučovat.**
   Kde se řeší stejný problém v obou vrstvách, řeší se **dvakrát, odděleně** – ne extrakcí sdílené třídy.
   Sdílet lze pouze drobné technické utility bez API sémantiky (např. `isRecord`).
3. NG chyby se nesmí zahazovat ani tiše emulovat. Zachovat HTTP status, kód, zprávu a pole.
4. Nepodporovaná pole se nesmí tiše zahazovat.
5. Deprecated Flow kartu nelze smazat jen proto, že nemá runtime volajícího – může být v uživatelských Flows.
6. Velké typové definice NG API **nejsou** mrtvý kód; jsou explicitním kontraktem s dokumentovaným API.

Bod 6 je důvod, proč v sekci mrtvého kódu v `claude.md` **nejsou** navrženy k odstranění typy
z `lib/awtrixng/Api/Types.ts`, přestože část z nich runtime nepoužívá.

## Doporučené pořadí

| Etapa | Obsah | Proč v tomto pořadí |
|---|---|---|
| **0** | Záchranná síť testů | Etapy 2 a 5 mění pozorovatelné chování. Bez testů to nelze bezpečně ověřit. |
| **1** | Manifest, metadata, závislosti | Nulové riziko, odblokuje publish, dá se udělat hned a samostatně. |
| **2** | Chybový a async kontrakt AWTRIX 3 | Největší reálný dopad na uživatele. Vyžaduje etapu 0. |
| **3** | Robustnost NG (lifecycle, polling, cache) | Nezávislé na etapě 2, lze paralelně. |
| **4** | Jeden zdroj pravdy pro seznamy polí | Největší dlouhodobý přínos, ale mechanicky rozsáhlé. |
| **5** | Mrtvý kód, duplicity, čitelnost, výkon | Až nakonec – jinak se refaktoruje kód, který se mezitím mění. |

---

# Etapa 0 – Záchranná síť

## N1. Fake Homey harness pro lifecycle testy

> **Původ:** `code-audit-2026-08-05.md` (A6). Potvrzuji: 206 testů pokrývá NG transformace,
> endpoint kontrakty a shared dispatch, ale ani jeden nespustí `AwtrixLightDevice.onInit()`
> nebo `AwtrixNgDevice.onInit()`. Nálezy B3, B4, B6, N2, N3 by současnou sadou prošly.

**Cíl:** umožnit testovat lifecycle bez reálného Homey.

**Postup:** malý `test/helpers/fake-homey.js` poskytující:

```js
// náčrt
createFakeHomey() -> {
  homey: { setInterval, clearInterval, setTimeout, clearTimeout, __: (k) => k },
  // řízený čas: tick(ms) místo reálného čekání
  tick(ms),
  // záznamy pro asserce
  capabilityWrites: [], availability: [], settingsWrites: [], flowCards: Map,
}
createFakeDevice({ store, settings, capabilities }) // getStoreValue/setStoreValue/…
createFakeAwtrix3Client({ responses })   // vlastní pro vrstvu awtrix3
createFakeAwtrixNgTransport({ responses }) // vlastní pro vrstvu awtrixng
```

Dvě oddělené fake implementace klientů – v souladu s mantinelem 2. Nesnažit se o jeden univerzální fake.

**Riziko:** nízké, jen testovací kód.

**Ověření:** první test, který harness použije, je N2 (fail counter).

**Odhad:** M

## N2. Test stavového automatu availability AWTRIX 3 – a teprve pak oprava

> **Původ:** `code-audit-2026-08-05.md` (A1). **Ověřeno v tomto průchodu** čtením řídicího toku:
> `lib/awtrix3/Api/Api.ts:162–194` + `drivers/awtrixlight/device.ts:473–487`.

Dvě samostatné vady v jednom automatu:

**Vada a) – počítadlo neměří po sobě jdoucí selhání.**
`processResponseCode` na `Status.Ok`:

```ts
case Status.Ok:
  if (this.device.getAvailable()) {
    return;                 // ← failsReset() se NEZAVOLÁ
  }
  this.device.setAvailable()…;
  this.device.failsReset();
```

Když je zařízení available, úspěšná odpověď počítadlo nevynuluje. Tři nesouvisející výpadky
rozprostřené přes týden se tedy sečtou stejně jako tři po sobě jdoucí.

**Vada b) – posun o jednu.**
`processUnavailability` testuje limit **před** inkrementací:

```ts
if (this.device.failsExceeded()) { setUnavailable(); poll.extend(); }
else { this.device.failsAdd(); }
```

Při `failThreshold = 3`: chyba 1→`count=1`, 2→`2`, 3→`3`, a teprve **4. chyba** označí unavailable.

**Vedlejší efekt:** jakmile je zařízení unavailable, `failCount` zůstane na 3, takže každá další
chyba znovu volá `poll.extend()`, což pokaždé restartuje interval. Zařízení v dlouhodobém výpadku
tak nemusí nikdy dokončit ani jeden extended poll cyklus.

**Cíl:** threshold znamená „3 po sobě jdoucí selhání".

**Postup:**

1. **Nejdřív test** proti současnému chování (aby bylo vidět, co se mění).
2. Rozhodnout explicitně sémantiku a zapsat ji do `docs/awtrix-ng/06-user-maintainer-guide.md`
   nebo do komentáře u `failThreshold`.
3. Teprve pak: `failsReset()` volat při každém `Status.Ok`; v `processUnavailability`
   nejdřív `failsAdd()`, pak test; `poll.extend()` volat jen při přechodu do unavailable,
   ne opakovaně.

**Riziko:** **střední, pozorovatelná změna legacy chování.** Zařízení začnou přecházet do
unavailable dřív (3. chyba místo 4.) a zároveň méně často (jen po sobě jdoucí chyby).
U nestabilní WiFi se to projeví.

**Ověření:** testy `success→reset`, `3× fail→unavailable`, `2× fail + success + fail→available`,
`unavailable→success→available + poll.start()`.

**Odhad:** S (test) + S (oprava)

---

# Etapa 1 – Manifest, metadata, závislosti

Vše bezrizikové a nezávislé. Dá se udělat v jednom commitu.

## B2 + N3. Chybějící `xlarge.png` – na **dvou** místech

> **Rozšířeno:** v `claude.md` jsem uvedl jen driver. `code-audit-2026-08-05.md` (D2) správně
> doplňuje i app-level asset. **Ověřeno:** `ls assets/images/` → jen `large.png`, `small.png`.

Chybí:

- `assets/images/xlarge.png` – odkazuje `.homeycompose/app.json:25`
- `drivers/awtrixlight/assets/images/xlarge.png` – odkazuje `drivers/awtrixlight/driver.compose.json`

**Pozor na past:** `drivers/awtrixng/assets/images/xlarge.png` sice existuje, ale je
**bitově identický s `large.png`** (md5 `206eb2c4…`, obojí 42 728 B). Není to skutečný
1000×1000 asset, jen kopie. Kopírovat tento vzor na další dvě místa problém neřeší.

**Postup:**

1. Zjistit aktuální požadované rozměry v Homey docs (`small` 75×75, `large` 500×500, `xlarge` 1000×1000).
2. Vygenerovat skutečné xlarge z originálního zdroje, ne upscale z `large.png`.
3. Nahradit i NG kopii skutečným assetem.
4. Alternativa, pokud zdroj v dostatečném rozlišení není: `xlarge` z manifestu **odebrat**
   (ověřit, zda je pro danou SDK verzi povinný).

**Riziko:** žádné pro runtime.

**Ověření:** test, který projde všechny cesty k souborům v `app.json` a ověří existenci:

```js
// náčrt – test/manifest-assets.test.js
const app = require('../app.json');
for (const p of collectLocalPaths(app)) {
  assert.ok(fs.existsSync(path.join(__dirname, '..', p)), `missing asset ${p}`);
}
```

Tenhle test by odchytil i to, co `homey app validate` podle auditu neodhalilo.

**Odhad:** S

## T2 + N4. Verze rozjeté ve **třech** zdrojích

> **Rozšířeno:** `code-audit-2026-08-05.md` (D1) přidává lockfile. **Ověřeno:**
> `package-lock.json` → `version: "1.0.2"` v rootu i v `packages[""]`.

| Zdroj | Verze |
|---|---|
| `.homeycompose/app.json`, `app.json` | `2.0.1` |
| `package.json` | `2.0.0` |
| `package-lock.json` (root) | `1.0.2` |

Poslední commit se jmenuje „Bump 2.0.1", takže se povýšil jen Homey manifest.

**Postup:** jeden release skript, který nastaví všechny tři, plus CI test:

```js
// náčrt – test/version-consistency.test.js
assert.equal(pkg.version, compose.version);
assert.equal(lock.version, pkg.version);
```

**Riziko:** žádné.
**Odhad:** XS

## N5. Nepoužité přímé závislosti `mime-types` a `@types/mime-types`

> **Původ:** `code-audit-2026-08-05.md` (C1). **Ověřeno:** `grep -rn "mime-types\|mime\."`
> přes `*.ts`/`*.js` mimo `node_modules` a `.homeybuild` → žádný výskyt.

**Postup:** odebrat z `package.json` (`dependencies` i `devDependencies`), přegenerovat lockfile.

**Riziko:** nízké, ale ne nulové – `mime-types` zůstane tranzitivní závislostí `form-data`,
takže se nezmenší balíček. Přínos je jen přesnější manifest. Po odebrání spustit plný build + test.

**Odhad:** XS

## N6. `tsconfig.json` obsahuje nepoužitou konfiguraci

> **Původ:** `code-audit-2026-08-05.md` (C3). **Ověřeno:** žádný import netvaru `from 'lib/…'`
> ani `from 'drivers/…'`; mimo `test/` (které je z kompilace vyloučeno) neexistuje žádný `.js` soubor.

`allowJs: true`, `baseUrl` a `paths` (`drivers/*`, `lib/*`) nemají v současném kódu žádný efekt –
všechny importy jsou relativní.

**Postup:** buď je odstranit, **nebo** aliasy skutečně zavést. Částečná migrace nemá hodnotu.
Pokud aliasy, je nutné ověřit, že je Homey build i runtime resoluce zvládne – TS `paths`
samo o sobě nepřepisuje výstupní JS.

**Riziko:** nízké. Po změně ověřit, že `.homeybuild` má stejnou strukturu (testy z něj requirují).

**Odhad:** XS

## N7. README popisuje neaktuální Flow model

> **Původ:** `code-audit-2026-08-05.md` (D3). **Ověřeno:** `README.md:13` tvrdí
> „AWTRIX NG flows use separate `awtrixng*` flow cards".

Realita: podporovaný subset jede přes **shared** karty (`notification`, `application`,
`indicator`, `displaySet`, `playRTTTL`, …) s dispatchem podle `getAwtrixDeviceType()`.
NG-only jsou jen `applicationRaw` a `weatherOverlay` – a ani ty se nejmenují `awtrixng*`.
Žádná flow karta v repu nemá prefix `awtrixng`.

**Postup:** sladit README s `docs/awtrix-ng/06-user-maintainer-guide.md`.
**Toto je oprava dokumentace, ne důvod měnit fungující shared architekturu.**

**Riziko:** žádné.
**Odhad:** XS

## B1 + D1. `applicationIcon` a `List/Apps.ts` jako **jedno** rozhodnutí

> **Zpřesněno podle `code-audit-2026-08-05.md` (A5).** Původně jsem je v `claude.md` vedl
> jako dva nezávislé nálezy (B1 a D1). Audit správně ukazuje, že vznikly společně jako WIP:
> karta deklaruje autocomplete argument `name` (seznam aplikací) a `lib/awtrix3/List/Apps.ts`
> je přesně ten nedokončený service skeleton, který ho měl obsluhovat. Rozhodovat je odděleně
> by znamenalo buď smazat kartu a nechat skeleton, nebo naopak.

Stav:

- `.homeycompose/flow/actions/applicationIcon.json` → v `app.json`, `deprecated: true`,
  má autocomplete argument `name` **i** `icon`, ani jeden nemá listener,
- žádná `registerRunListener` pro `applicationIcon` neexistuje (`app.ts:26–66`, `drivers/awtrixlight/driver.ts:45–76`),
- `lib/awtrix3/List/Apps.ts` – 4 metody vracející `[]`, `false`, `null`; nikde neimportováno;
  importuje `AwtrixLightDevice`, čímž tvoří cyklus driver → lib → driver.

**Postup – nejdřív zjistit dopad, pak rozhodnout:**

1. Ověřit, zda byla verze s touto kartou vůbec publikována (git tagy + Homey App Store historie).
2. Pokud **nikdy nefungovala**, nemůže být v žádném funkčním uživatelském Flow –
   mantinel 5 se pak neuplatní a lze odstranit kartu i skeleton, se záznamem do changelogu.
3. Pokud existuje pochybnost, ponechat kartu jako manifest-only a **explicitně ji označit**
   (viz N8), aby ji budoucí kontrola nehlásila jako chybu.
4. Skeleton `List/Apps.ts` odstranit v obou případech – no-op návratové hodnoty porušují
   mantinel „Prefer explicit capability checks over no-op methods" z `AGENTS.md`.

**Riziko:** střední – jde o kompatibilitní rozhodnutí, ne o technickou úpravu.
**Nedělat podle „nemá importy".**

**Odhad:** S (průzkum) + XS (provedení)

## N8. Test: každá deklarovaná karta má právě jednu registraci

> **Původ:** `code-audit-2026-08-05.md` (balíček 2).

Zabrání opakování B1.

```js
// náčrt
const declared = app.flow.actions.map((a) => a.id);
const registered = collectRegisteredCardIds(); // parse app.ts + drivers/*/driver.ts
const manifestOnly = new Set(['applicationIcon']); // explicitní, s odůvodněním
assert.deepEqual(
  declared.filter((id) => !registered.includes(id) && !manifestOnly.has(id)),
  [],
);
```

Seznam `manifestOnly` musí být krátký a komentovaný – jinak se z výjimky stane pravidlo.

**Odhad:** S

---

# Etapa 2 – Chybový a async kontrakt AWTRIX 3

**Vyžaduje etapu 0.** Všechny položky mění pozorovatelné chování.

## N9. Neúspěšné write operace se zahazují

> **Původ:** `code-audit-2026-08-05.md` (A2). V `claude.md` jsem měl jen podmnožinu (B6, `onSettings`).
> Audit správně ukazuje, že jde o systémový problém celého command rozhraní.

`lib/awtrix3/Api/Api.ts:135–147` vrací `boolean`. Ale `drivers/awtrixlight/device.ts:386–420`
má návratový typ `Promise<void>` a hodnotu zahodí:

```ts
async cmdNotify(msg: string, params: any): Promise<void> {
  await this.api.notify(msg, params);   // ← boolean zahozen
}
```

Flow akce proto skončí úspěšně i tehdy, když zařízení vrátilo 500.
`onSettings` (`:177`) je horší varianta: `this.api.setSettings(newSettings).catch(this.error)`
– neúspěch je `false`, tedy **splněná** Promise, takže `.catch` se nikdy nespustí a Homey
si nové nastavení uloží jako platné.

**Cíl:** neúspěšná operace = neúspěšná Flow akce.

**Postup:** zachovat `Promise<void>` rozhraní (tím se nemění shared driver interface,
mantinel z `AGENTS.md`), ale při `false` vyhodit:

```ts
// náčrt – lib/awtrix3/Api/Api.ts
private async requireOk(op: string, p: Promise<boolean>): Promise<void> {
  if (!await p) throw new Error(this.device.homey.__('api.error.commandFailed', { op }));
}
```

Doplnit klíč do `locales/en.json`.

**Riziko:** **vysoké z hlediska UX.** Flow, které dnes „tiše fungují", začnou hlásit chyby.
To je správně, ale uživatelé to poznají. Patří do release notes.
Nasadit **až po** N1 a N2 a nejlépe samostatným releasem.

**Ověření:** test, že Flow akce odmítne při HTTP 500 a projde při 200; test `onSettings`,
že při selhání vyhodí a Homey nastavení neuloží.

**Odhad:** M

## N10. Fire-and-forget v lifecycle AWTRIX 3

> **Původ:** `code-audit-2026-08-05.md` (A3). Přesnější a úplnější než můj nález B4.

`drivers/awtrixlight/device.ts`:

| Místo | Problém |
|---|---|
| `:73` | `onInit()` neawaituje `initializeDevice()` |
| `:58–66` | poll callback neawaituje `refreshCapabilities()` ani `tryRediscover()` |
| `:221–225` | `refreshAll()` spustí tři Promise bez awaitu a sama nevrací Promise |
| `:97–110` | `finally` spustí poll a zruší critical režim dřív, než doběhne `refreshAll()` |
| `:292` | `refreshSettings()` neawaituje `setSettings()` |
| `:136–151` | `onAdded()` nečeká na `setCapabilityValue` ani na upload ikon |

**Dopad:** Homey považuje hook za dokončený dřív, než práce skončí. Chyby přiletí mimo
lifecycle Promise. Refresh cykly se mohou překrývat.

**Postup:** postupně, po jedné položce, každou s testem. `refreshAll()` udělat `async`
a vracet Promise; `Promise.all` uvnitř pouze pokud test potvrdí, že to nerozbije pořadí
zápisů do fail counteru (souvisí s N2 – dělat **až po** něm).

**Riziko:** střední. Pořadí operací během initu se změní.

**Odhad:** M

## N11. Basic Auth hlavička v debug logu

> **Původ:** `code-audit-2026-08-05.md` (A4). **Ověřeno:** `lib/awtrix3/Api/Client.ts:103`
> předává `this.#getHeaders(headers)` do `#debugRequest`, který je na `:179–184` loguje beze změny.
> GET cesta (`:84`) hlavičky nepředává, takže se týká POST a upload cest.
> `#debugResponse` (`:187–198`) loguje i `response.headers`.

NG transport to řeší správně: `lib/awtrixng/Http/AxiosTransport.ts:57–60` má
`redactSensitiveHeaders()` a `RedactedHeaderValue = '<redacted>'`.

**Postup:** stejný **princip** implementovat v `lib/awtrix3/Api/Client.ts` – vlastní kopií,
ne sdílením transportu (mantinel 2). Je to ~6 řádků.

**Riziko:** žádné. Aktivuje se jen při `DEBUG=1`.

**Ověření:** test, že axios dostane skutečnou hlavičku `Authorization`, ale logger `<redacted>`.

**Odhad:** XS

## B5. Sanitizace a escapování jména aplikace

`lib/awtrix3/Api/Api.ts:76,80` vkládá `name` přímo do query stringu.
`lib/awtrix3/Normalizer.ts:127–129` obsahuje `appName()`, která prefix i sanitizaci dělá –
a nikde se nevolá (nález D3).

**Postup:**

```ts
// náčrt – lib/awtrix3/Api/Api.ts
async customApp(name: string, options: any): Promise<boolean> {
  return this.clientPost(
    `custom?name=${encodeURIComponent(appName(name))}`,
    appOptions(options, this.device.getStoreValue('effects') || []),
  );
}
```

**Pozor na migraci:** `appName()` dělá `id.replace(/[^a-z0-9]+/g, '').toLowerCase()`.
Aplikace vytvořená dnes pod jménem `My App` je na zařízení jako `homey:My App`;
po opravě by `removeCustomApp('My App')` mířilo na `homey:myapp` a **starou by nesmazalo**.
Buď to přijmout a zdokumentovat, nebo při mazání zkusit obě varianty.

**Riziko:** střední kvůli té migraci. Rozhodnout explicitně.

**Ověření:** test, že jméno s mezerou/diakritikou/`&` produkuje očekávanou URL.

**Odhad:** S

---

# Etapa 3 – Robustnost NG

Nezávislé na etapě 2.

## B3. `poll.start()` se nemusí provést

`drivers/awtrixng/device.ts:85–93` – pokud `refreshSettingsFromDevice()` /
`refreshDisplayFromDevice()` / `refreshAppsFromDevice()` vyhodí, `onInit` skončí odmítnutím
a `this.poll.start()` se nikdy nezavolá. Zařízení se pak samo neobnoví až do restartu aplikace.

**Postup:**

```ts
// náčrt
try {
  const result = await this.refreshDeviceState({ allowAddCapabilities: true });
  if (result?.status === 'detected') {
    await this.syncFromDevice();   // uvnitř zachovat NG chybové detaily
  }
} catch (error) {
  this.error(error);                       // chybu NEZAHAZOVAT
  await this.setUnavailable(describe(error)); // promítnout do availability
} finally {
  this.poll.start();                       // ← vždy
}
```

`describe(error)` použije `toAwtrixNgAvailabilityState` / `formatApiErrorDetails`,
aby se zachoval kód, pole i HTTP status (mantinel 3).

**Riziko:** nízké. Zlepšení bez změny úspěšné cesty.

**Ověření:** test, že při chybě `getSettings()` je zařízení unavailable **a** poll běží.

**Odhad:** S

## B4 + N12. Polling není single-flight a nemá error handler

> **Rozšířeno:** `code-audit-2026-08-05.md` (B2) přidává souběh, který jsem v `claude.md` neměl.

Dva problémy naráz, v **obou** vrstvách:

- `lib/awtrixng/Device/Poll.ts:22–25` a `lib/awtrix3/Poll.ts:22–25` předávají async callback
  přímo do `setInterval`. Interval nečeká na dokončení předchozího běhu → při latenci
  nad interval vznikají souběžné refresh cykly.
- Návratová Promise nikdo nechytá → unhandled rejection při každém neúspěšném pollu.

**Postup – v každé vrstvě zvlášť, dvě nezávislé změny:**

```ts
// náčrt – varianta s guardem
start(): void {
  this.stop();
  this.#timer = this.#timerHost.setInterval(() => {
    if (this.#running) { this.#onSkip?.(); return; }
    this.#running = true;
    Promise.resolve(this.#callback())
      .catch((e) => this.#onError(e))
      .finally(() => { this.#running = false; });
  }, this.#intervalMs);
}
```

Alternativa: rekurzivní `setTimeout` naplánovaný až po dokončení callbacku (přesnější,
ale mění sémantiku intervalu z „každých 60 s" na „60 s po dokončení").
**Zvolit jednu variantu a použít ji v obou vrstvách nezávisle** – ne extrakcí sdílené třídy.

U NG platí mantinel 3: `#onError` musí chybu zalogovat s detaily, ne ji spolknout.

**Riziko:** nízké. Skip je pozorovatelný jen v logu.

**Ověření:** s fake timer hostem – callback trvající 2 intervaly vyvolá právě jeden běh a jeden skip.

**Odhad:** S na vrstvu

## N13. Icon cache dovoluje souběžné duplicitní GETy

> **Původ:** `code-audit-2026-08-05.md` (B6). **Ověřeno:** `lib/awtrixng/Services/Icons.ts:94–101`.

```ts
async all() {
  if (this.#list.length === 0) { await this.loadIcons(); }   // ← žádný in-flight guard
  this.#resetTimer();
  return this.#list;
}
```

Autocomplete v Homey střílí dotaz na každý úhoz. Dvě volání před dokončením prvního
`loadIcons()` obě uvidí prázdný seznam a obě pošlou `GET /api/v1/files`.
V kombinaci s TTL 5 s (nález O8) to znamená opakované requesty při běžném psaní.

**Postup:** cacheovat i rozpracovanou Promise a po rejection ji vyčistit:

```ts
// náčrt
async all() {
  if (this.#list.length === 0) {
    this.#inFlight ??= this.loadIcons().finally(() => { this.#inFlight = undefined; });
    await this.#inFlight;     // rejection propaguje, neukládá se prázdný seznam
  }
  this.#resetTimer();
  return this.#list;
}
```

Stejný vzor lze potom **samostatně** použít i v `lib/awtrix3/List/Icons.ts`.

**Riziko:** nízké. Pozor, aby se chyba neuložila jako prázdný seznam – to by cache „zamkla" na prázdno.

**Odhad:** S

## O8. Sjednotit TTL cache ikon

`lib/awtrixng/Services/Icons.ts:7` `DefaultCacheTtlMs = 5000` proti
`lib/awtrix3/List/Icons.ts:6` `Timeout = 120000`. 24× rozdíl bez zjevného důvodu.

**Postup:** rozhodnout jednu hodnotu (30–60 s je rozumný kompromis mezi čerstvostí a zátěží),
nastavit v každé vrstvě zvlášť a **doplnit komentář s odůvodněním**, aby to příště nevypadalo
jako přehlédnutí. Dělat až po N13, které snižuje dopad krátkého TTL.

**Odhad:** XS

## B7. Částečná aplikace nastavení NG

`drivers/awtrixng/device.ts:115–126`. Tři vady:

1. `configureClient()` uloží nové credentials **bez ověření** (AWTRIX 3 driver naopak
   v `onSettings` volá `testDevice()` a při selhání vrací staré hodnoty a vyhodí).
2. Když `applyAwtrixNgBuiltinAppSettingsChange` vyhodí, `applyAwtrixNgHomeySettingsChange`
   se neprovede – uživatel dostane chybu a půl aplikované změny.
3. Homey si mezitím nová nastavení uloží.

**Postup:**

1. Před uložením credentials udělat probe s novými hodnotami; při selhání vyhodit a nechat staré.
2. Obě apply operace spustit tak, aby se vyhodnotily obě, a chyby agregovat:

```ts
// náčrt
const results = await Promise.allSettled([appsChange, settingsChange]);
const failures = results.filter((r) => r.status === 'rejected');
if (failures.length > 0) {
  throw new Error(failures.map((f) => describeNgError(f.reason)).join(' | '));
}
```

`Promise.allSettled` je zde přijatelné **jen** proto, že se všechny chyby souhrnně propagují.
Ignorovat je nesmí (mantinel 3).

**Riziko:** střední. Mění se pořadí a atomicita.

**Odhad:** M

## B8 + B9. Kontrakt validace payloadů

**B8** – `lib/awtrixng/Api/Types.ts:325` deklaruje `scroll?: AwtrixNgApiScrollPayload | AwtrixNgApiScrollMode`,
ale `Transformers.ts:378–385` řetězcovou zkratku odmítá. Zúžení je záměrné
(`AwtrixNgPageInput`, `Transformers.ts:65–67`), ale v `Api/Types.ts` to není poznamenané.
→ **Náprava je komentář**, ne změna kódu: u pole `scroll` doplnit, že vstupní transformace
řetězcovou variantu nepřijímá a proč.

**B9** – `assertPagePayload` (`:579–587`) nevaliduje žádné číselné pole (`durationMs`, `repeat`,
`progress`, `textOffsetX`, `iconOffsetX`, `effectSpeed`, `paletteSpan`, `paletteSpeed`,
`textBlinkMs`, `textFadeMs`) ani `sound` / `soundRtttl` / `stack` / `wakeup` / `hold`.
Vzhledem k tomu, jak přísně jsou ošetřená ostatní pole, je to mezera, ne rozhodnutí.

**Postup:** doplnit `assertNonNegativeIntegerField` a `assertBooleanField` pro chybějící pole.
Odvodit rozsahy z `docs/vendor/awtrixng-http-openapi.yaml` – **ne odhadem**.
Pole, jehož rozsah není v OpenAPI doložený, nechat nevalidované a **označit komentářem `UNKNOWN`**,
v souladu s praxí v `05-todo-list.md`.

**Riziko:** střední. Přísnější validace může odmítnout payload, který dnes projde.
Patří do release notes.

**Odhad:** M

## B1 (NG část) + O5. Sekvenční discovery při párování

`drivers/awtrixng/driver.ts:453–463` – `for (… of …) { await this.probeDiscoveryResult(…) }`.
Timeout je 10 s, takže nejhorší doba otevření seznamu je `počet kandidátů × 10 s`.
Jeden offline kandidát zdrží všechny za sebou.

**Postup:**

1. Nejdřív synchronně odfiltrovat neplatné kandidáty (`isAwtrixNgDiscoveryResult`, `toPort`) –
   ty nepotřebují HTTP vůbec.
2. Zbytek probovat paralelně s malým limitem konkurence (4–6), ne neomezeně –
   Homey Pro nemá neomezené sokety.
3. Každý výsledek musí zachovat stávající stavy `detected` / `auth-required` / `offline` / `rejected`
   i detaily NG chyby.

Udělat **společně s S7**, protože se dotýká stejného kódu.

**Riziko:** nízké. Pořadí v seznamu se změní → seřadit deterministicky (podle `name`/`id`).

**Odhad:** S

---

# Etapa 4 – Jeden zdroj pravdy pro seznamy polí

## S8 + S9 + S10. Runtime seznamy odvodit z typů

Největší dlouhodobý přínos. `lib/awtrixng/Payload/Transformers.ts:83–221` obsahuje
13 ručně psaných konstant, které zrcadlí typy z `Api/Types.ts` bez jakékoli vazby
(úplná tabulka je v `claude.md`, sekce S8).

**Postup – dva různé vzory podle druhu:**

**a) String-literal uniony** → otočit směr odvození. V `Api/Types.ts`:

```ts
export const AwtrixNgApiScrollModes = ['static', 'wrap', 'loop', 'bounce'] as const;
export type AwtrixNgApiScrollMode = typeof AwtrixNgApiScrollModes[number];
```

`Transformers.ts` pak importuje konstantu místo vlastní kopie.
Týká se: `scrollModes`, `scrollDirections`, `scrollEntries`, `scrollWhenFits`,
`textCases`, `fonts`, `iconModes`, `lifetimeExpiries`.

**b) Seznamy klíčů objektů** → typ nelze za běhu vyjmenovat, ale lze vynutit úplnost:

```ts
const pageFieldMap: Record<keyof AwtrixNgApiPagePayload, true> = {
  text: true, textCase: true, /* … */
};   // ← TS chyba, když se do typu přidá pole a sem ne
const pageFields = Object.keys(pageFieldMap);
```

Týká se: `pageFields`, `notificationFields`, `pushedAppFields`, `indicatorFields`, `scrollFields`.

**c) S9** – `notificationFields` složit jako `new Set([...pageFields, ...notificationOnlyFields])`
místo dvojího vypsání stejných řetězců.

**d) S10** – `writableSettingsFields` (`Services/Settings.ts:31–37`) a `settingsFields`
(`Transformers.ts:140–146`) jsou identické; k tomu typ `AwtrixNgWritableSettingsField`
a interface `AwtrixNgSettingsPatchInput` popisují totéž. Zredukovat na jednu `as const`
konstantu a zbytek odvodit.

**Riziko:** nízké funkčně, ale **mechanicky rozsáhlé**. Dělat po částech, každou s běžícími testy.
Existující testy v `awtrixng-transformers.test.js` (13 kB) tuto oblast pokrývají dobře.

**Ověření:** po každé části musí projít celá sada beze změny testů.
Pokud test bylo nutné změnit, znamená to změnu chování → vrátit se.

**Odhad:** L

---

# Etapa 5 – Úklid, duplicity, čitelnost

Až nakonec. Nic z toho není urgentní.

## Mrtvý kód – D1 až D15

Rozdělené podle toho, jak bezpečné je odstranění:

**Bezpečné (žádný volající, žádný test):**
D2 `Api.isAvaible()`, D3 `isHomeyApp` / `toTextFragments`, D5 `cmdReboot` / `cmdSetSettings` /
`cmdGetImages`, D6 `ManualAdd` blok, D8 no-op detekce restartu, D9 nedosažitelná větev
v `isColor`, D13 a D14 konstantně pravdivé podmínky, D15 mrtvý handler v pairing HTML.
Plus `AwtrixNgDevice.refreshAvailability()` (**nové z auditu**, C2 – jen definice, poll volá
`refreshDeviceState()` přímo).

**Vyžaduje rozhodnutí:**

- `appName()` (D3) – **neodstraňovat**, má se naopak zapojit (B5).
- D1 `List/Apps.ts` – řešit s B1 jako celek.
- D4 `Poll.isExtended()`, D10 `toAwtrixNgRtttlPayload`, D11 `fromAwtrixNgHomeyPushedAppName`,
  D12 `getVersion()` / `getCapabilities()` – používají je jen testy.
  Podle mantinelu 6 to **nejsou automaticky zbytečné funkce**: jsou explicitní součástí
  dokumentovaného klienta. Rozhodnout jako rozsah API, ne jako výsledek dead-code nástroje.
  `fromAwtrixNgHomeyPushedAppName` je logický protějšek zapisovací transformace a bude
  potřeba pro budoucí listing aplikací – **nemazat**.
  `getCapabilities()` je naopak kandidát na **zapojení**, ne smazání (viz O4).
- D7 prázdné pairing handlery – **ověřit proti reálnému Homey pairing runtime**, zda jsou
  pro použitý `list_devices → add_devices` template vůbec volány. Pokud ne, odstranit.

**Odhad:** S (bezpečná část) + M (rozhodnutí)

## Duplicity – S1 až S17

**Udělat:**

- **S1** – 7 kopií `isRecord`. Jeden `lib/awtrixng/Support/Guards.ts` se dvěma pojmenovanými
  predikáty (`isRecord`, `isPlainObject` – rozdíl je `!Array.isArray`), plus **samostatná kopie**
  ve `drivers/shared-flow-actions.ts`, aby sdílená driver vrstva nezávisela na `lib/awtrixng`.
- **S7** – `probeManualPairingInput` (`:288–329`) vs. `probePendingAuthPairTarget` (`:339–391`),
  ~45 řádků duplicity. Audit správně přidává třetí výskyt: `probeDiscoveryResult` (`:487–526`).
  Vytáhnout **factory klienta** a **čistý mapper probe výsledku**.
  **Nesjednocovat** discovery / manual / credentials do jednoho workflow – jejich vstupy a UX
  zůstávají explicitní. Dělat s O5.
- **S14** – `clientGet` vs. `clientGetDirect` (`Api.ts:111–133`), stejné zdvojení i v `Client.ts:74–80`.
- **S16** – `Client.log` inicializovaný dvakrát (`:41` a `:50`).
- **S17** – neuklízený `setTimeout` v `abortSignal()` (`Client.ts:26–31`) + redundantní
  axios `timeout`. Zvolit jeden mechanismus; pokud `AbortController`, timer po dokončení
  requestu zrušit.
- **S4, S5, S12** – drobnosti ve sdílené a Display vrstvě.
- **S3** – tři kopie autocomplete ikon; `drivers/awtrixlight/driver.ts:50–52,69–71`
  může volat `autocompleteSharedIconAction`.

**Zvážit:**

- **S2** – 4 identické tvary „ikony". Sjednotit **jen ve sdílené vrstvě**;
  per-vrstvové aliasy ponechat a okomentovat, že jsou úmyslné.
- **S13** – duplicitní glue kód v pairing HTML (~45 řádků). Homey pair views nesdílí
  `<script src>` triviálně. Řešit jen s build krokem, ne ručním include.

**Neodstraňovat:**

- **S6** – duplicitní driver assets (~52 KiB ikon + small/large). Runtime cesty jsou
  driver-specific; odstranit lze jen spolehlivým build/copy krokem. Kvůli malé velikosti
  **nezavádět build složitost bez dalšího důvodu**.
- **S11** – `ErrorParser.ts` jako re-export barrel. Sjednotit importy na jednu cestu je
  levné, ale samotný barrel může zůstat kvůli stabilitě importních cest.

## Čitelnost a výkon – O1 až O12

**Nejvyšší hodnota:**

- **O2** `basicOptions` (110 řádků `if`ů) – přepsat tabulkově.
  **Až po** doplnění testů, protože obsahuje nekonzistence, které se dají snadno nepozorovaně
  „opravit": `blinkText`/`fadeText` zahazují `0`, `toColor()` mění neplatnou barvu na `'0'`
  místo vynechání pole. **Každou z nich rozhodnout explicitně**, nesjednocovat mlčky.
- **O1** `toText` – duplicitní blok, `JSON.parse` na každém řetězci.
- **O12** směr závislosti `lib/awtrix3` → `drivers`. Přesunout `DeviceFailer` / `DevicePoll`
  do `lib/awtrix3/`. NG vrstva to už dělá správně (`AwtrixNgAppsClient`, `AwtrixNgTimerHost`…).
  **Není to slučování vrstev**, je to narovnání směru uvnitř Awtrix3.

**Zbytek:** O3 (`BarLineValues` → `number[]`), O4 (kontrola `transitionEffect` proti
`/api/v1/capabilities`), O6 + O7 (upload ikon – omezená konkurence, Promise FS API,
sjednotit lifecycle sémantiku mezi drivery), O9 (`configureClient` zahazuje icon cache),
O10 (`Promise.all` → `allSettled` v `setCapabilityValues`), O11 (`migrate()` deklarativně).

**O6 a O7 pozor:** obě vrstvy mají opačný extrém – NG čeká na 12 sekvenčních uploadů,
AWTRIX 3 nečeká vůbec a chyby zahazuje. Sjednotit **sémantiku** (co znamená dokončený `onAdded`),
ale implementovat v každé vrstvě zvlášť.

## T1. Lint toolchain mimo podporované rozmezí

`typescript` 5.9.3 vs. `@typescript-eslint/parser` ^5.62.0 (podporuje `<5.2.0`);
`eslint` ^7.32.0 je po EOL. Lint prochází, ale parser nemusí rozumět novější syntaxi.

**Postup:** povýšit `@typescript-eslint/*` + ESLint na verze odpovídající TS 5.9,
nebo TS připnout pod 5.2. Dělat samostatně – povýšení ESLintu typicky vyplaví novou várku nálezů.

**Odhad:** M

## T4. Testy parsující zdrojový text

`awtrixng-device-settings.test.js:56` používá
`getSourceBetween(source, 'async onSettings({', 'async refreshAvailability')`.
Takový test se rozbije při přejmenování metody a netestuje chování – navíc svazuje
odstranění `refreshAvailability()` (viz D-sekce) s úpravou testu.

**Postup:** nahradit testy proti chování s fake klientem z N1.
Source-shape testy ponechat **jen** tam, kde skutečně kontrolují Homey entrypoint
nebo compose invariant (`awtrixng-homey-entrypoints.test.js`, `awtrixng-lib-structure.test.js`).

**Odhad:** M

## T5. `.DS_Store` a chybějící `.homeyignore`

`docs/.DS_Store` a `drivers/awtrixng/.DS_Store` (po 6 148 B) jsou v `.gitignore`,
ale `.homeyignore` v repu neexistuje, takže se mohou dostat do publikovaného balíčku.

**Postup:** přidat `.homeyignore` s `.DS_Store`, `docs/`, `test/`, `.homeycompose/`
(ověřit, co Homey CLI vyžaduje ponechat).

**Odhad:** XS

## T6. CI kontroly

Souhrn kontrol navržených výše – nasadit jako jeden krok:

1. `npm run build && npm test`
2. `homey app build` + `git diff --exit-code app.json` (odchytí drift `.homeycompose` → `app.json`)
3. `homey app validate --level publish`
4. test existence assetů (N3)
5. test konzistence verzí (N4)
6. test registrace Flow karet (N8)

Body 4–6 jsou nutné právě proto, že `homey app validate` je podle auditu neodhalil.

**Odhad:** M

---

## Shrnutí

Největší přínos nepřinese refaktoring transformerů, ale:

1. **doplnění lifecycle testů** (etapa 0) – bez nich nelze etapu 2 udělat bezpečně,
2. **zpřesnění chybového a async kontraktu AWTRIX 3** (N2, N9, N10) – dnes může Flow
   akce skončit úspěšně, i když zařízení vrátilo chybu,
3. **explicitní rozhodnutí o `applicationIcon` + `List/Apps.ts`** (B1 + D1) jako
   kompatibilitním celku, ne jako dead-code úklidu.

U AWTRIX NG je architektura chyb a payloadů podstatně přísnější. Největší rezervy jsou
`poll.start()` v `finally` (B3), single-flight polling (B4), latence sekvenčního
discovery (O5) a systémová duplicita runtime seznamů vůči typům (S8).

Etapa 1 je celá bezriziková a dá se udělat okamžitě a samostatně.
