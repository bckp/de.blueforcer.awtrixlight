# Review implementace 2.1.0 – třetí kontrolní průchod (2026-08-06)

> Kontrola 33 commitů `f596dc9..ccdccad` („Bump 2.0.1" → „chore(release): prepare 2.1.0")
> proti [`plan.md`](plan.md). Navazuje na [`claude.md`](claude.md),
> [`claude-additional-risks.md`](claude-additional-risks.md) a [`plan-after.md`](plan-after.md).
> Žádný zdrojový soubor nebyl při review změněn.

## Ověřený stav

| Kontrola | Výsledek |
|---|---|
| `npx tsc --noEmit` | ✅ 0 chyb |
| `npm run build && node --test test/*.test.js` | ✅ **285/285** (baseline byl 206) |
| `npm run lint` | ⚠️ v mém Linux prostředí neprůkazné (nativní resolver, známý artefakt) – směrodatný je macOS běh |
| Křížové importy awtrix3 ↔ awtrixng | ✅ **žádné** (grep oběma směry) |
| `drivers/shared-flow-actions.ts` | ✅ beze změny – dispatch vzor zachován |
| `git status` | ✅ čistý strom |

## Celkové hodnocení

Implementace je disciplinovaná a věrná plánu. Namátkou ověřené balíčky (C1, C2, C7,
D1, D2, D4, D6, D8, D11, E1, E2) odpovídají krokům plánu včetně detailů, které se
snadno odbývají: redakce `Authorization` i v response hlavičkách, `maxRedirects: 0`
v obou vrstvách nezávisle, komentář s odkazem na hardware ověření R6-2 u 401 detekce,
`Record<keyof …, true>` mapy vynucující synchronizaci allowlistů s typy, konzervativní
D11 bez vymyšlených rozsahů (`UNKNOWN` komentáře). Odchylky od plánu (R1 → adaptér
místo smazání karty, R7 → sekvenční fail-fast místo `allSettled`, R8 → TTL zůstávají
oddělené) jsou zdokumentované v checklistu a v `plan-after.md` jako vědomá rozhodnutí.

Našel jsem však **jednu regresi a dvě reálné mezery**, které doporučuji opravit před
publikací 2.1.0, plus několik menších poznámek.

---

## V1 · REGRESE: autocomplete ikon Awtrix3 spadne na `TypeError`, když je zařízení nedostupné · **střední–vysoká**

**Kde:** `lib/awtrix3/List/Icons.ts` (`loadIcons`) × `lib/awtrix3/Api/Api.ts` (`getImages`).

**Mechanismus:** původní kód měl

```ts
const icons = await this.api.getImages().catch(this.device.error) || [];
```

Nová verze (commit `cd25d3f`) chybovou větev odstranila:

```ts
const icons = await this.api.getImages();
this.list = [this.empty, ...icons.map(…)];
```

Jenže `Api.getImages()` deklaruje `Promise<AwtrixImage[]>`, ale ve skutečnosti volá
`clientGetDirect`, který **každou chybu chytí a vrátí `null`** (a `null` vrací i při
prázdné odpovědi: `response.data ?? null`). Nedostupné zařízení tedy nevede k rejection,
kterou by nový in-flight mechanismus čistě propagoval, ale k `icons = null` →
`null.map` → `TypeError: Cannot read properties of null (reading 'map')`.

**Dopad:** uživatel píšící do autocomplete ikon u offline zařízení dostane syrový
TypeError místo prázdného seznamu (staré chování) nebo popsané chyby. `test/awtrix3-icons.test.js`
tento případ nekryje – fake `getImages` vrací vždy pole.

**Doporučení (vybrat jedno, ne obě):**

- (a) minimální: v `loadIcons` → `const icons = await this.api.getImages() ?? [];`
  a narovnat návratový typ `getImages(): Promise<AwtrixImage[] | null>`;
- (b) konzistentní s C2: `getImages` při `null` vyhodí popsanou chybu – pak autocomplete
  odmítne se smysluplnou hláškou. Je to změna chování → mini-rozhodnutí uživatele.

V obou případech doplnit test s `getImages → null`.

## V2 · MIGRACE: změna hesla u zařízení spárovaného před 2.1.0 selže na „address not configured" · **střední**

**Kde:** `drivers/awtrixng/device.ts` – `applySettingsChangesWithCandidateConnection`
→ `getConnectionCandidateFromSettings`.

**Mechanismus:** local-settings větev (`authUser`, `authPass`, `address`, `port`)
staví kandidátní spojení **výhradně ze settings**:

```ts
const address = typeof settings.address === 'string' ? settings.address.trim() : '';
if (address === '') throw new Error(this.getConnectionNotConfiguredMessage());
```

Zařízení spárovaná před 2.1.0 ale mají v settings `address = ''` (nový compose default)
– adresu mají jen ve **store** (`baseUrl`). Uživatel, který po upgradu změní jen heslo,
dostane „Device address is not configured yet.", přestože zařízení normálně běží.
Settings se store synchronizují až při discovery události (`commitDiscoveredConnection`
se `syncHomeySettings=true`) – tedy u zdravého zařízení se stabilní IP možná nikdy.

**Dopad:** zmírněný tím, že pole adresy je ve stejném dialogu (uživatel ho může vyplnit
ručně) a že 2.0.x s NG driverem pravděpodobně nevyšla veřejně – ale minimálně tvoje
vlastní vývojové zařízení to potká.

**Doporučení:** fallback – když `settings.address` je prázdné, vzít adresu/port ze
store snapshotu (`getStoreSnapshot()`); nebo jednorázová synchronizace store → settings
v `onInit` (obdoba `syncHomeySettings` větve). Test: zařízení se store `baseUrl`,
prázdnými settings a změnou `authPass` → projde.

## V3 · `connected()` je floating promise, který po C2 může rejectnout · **střední**

**Kde:** `drivers/awtrixlight/device.ts:104` (`initializeDevice`), `:139` (`onAdded`),
definice `:336`.

**Mechanismus:** `connected()` volá `this.cmdNotify('HOMEY', …)` bez `await` a bez
`.catch`. Před C2 vnitřní promise nikdy nerejectla (API vracelo `boolean`); **po C2**
`cmdNotify` odmítá při každém neúspěšném zápisu. Když zařízení vypadne mezi úspěšným
init testem a uvítací notifikací (nebo je při `onAdded` pomalé), vznikne unhandled
rejection – přesně ta kategorie, kterou C3 jinde systematicky odstranil. Totéž platí
pro `this.setCapabilityValue('ip', …)` na `:141` (floating).

**Doporučení:** uvítací notifikace je nekritická → `connected()` udělat `async`,
uvnitř `try/catch` s `this.error`, a volání awaitovat; `setCapabilityValue` v `onAdded`
awaitovat nebo `.catch(this.error)`. Jeden řádek komentáře, že jde o best-effort.

## V4 · NG ikony: `response.files` bez shape guardu · **nízká**

**Kde:** `lib/awtrixng/Services/Icons.ts:51` (`toAwtrixNgIconAutocompleteItems`).

D5 zavedl `AwtrixNgInvalidResponseError` pro `/api/v1/settings` a `/api/v1/apps`,
ale odpověď `/api/v1/files` se dál konzumuje bez kontroly – `response.files.map`
na malformed odpovědi spadne na `TypeError` místo strukturované chyby. Nekonzistence
se zbytkem D5, oprava je pětiřádková (guard `Array.isArray(response.files)` +
`AwtrixNgInvalidResponseError`).

## V5 · Rejections z NG discovery handlerů – ověřit chování SDK · **nízká**

**Kde:** `drivers/awtrixng/device.ts` – `onDiscoveryAddressChanged` /
`onDiscoveryAvailable` → `commitDiscoveredConnection`.

`commitDiscoveredConnection` propaguje výjimku, když je kandidát v okamžiku discovery
události nedosažitelný nebo když nesedí UID (`verifyCandidateConnection` hází).
Awtrix3 protějšek (`onDiscoveryAddressChanged`) výjimky chytá a vrací `false`.
Jestli Homey SDK rejections z těchto hooků čistě zaloguje, nebo vyprodukuje unhandled
rejection, není z dokumentace jisté.

**Doporučení:** pro paritu s Awtrix3 obalit `try/catch` → `this.error(e)` +
`return false`. UID-mismatch chybu logovat vždy (je diagnosticky cenná – znamená
recyklovanou IP).

## V6 · Mrtvá větev: `refreshAll` AggregateError se prakticky nikdy nevyhodí · **kosmetické**

`refreshAll()` poctivě agreguje přes `allSettled`, ale `refreshCapabilities()` i
`refreshSettings()` mají uvnitř vlastní `try/catch { this.log }`, takže navenek
nikdy nerejectnou; reálně může selhat jen `refreshEffects` (přes `setStoreValue`).
Není to chyba – jen si agregační mechanismus a vnitřní polykání chyb protiřečí.
Kandidát k narovnání při F3p/F4p (až budou behaviorální testy), ne teď.

## V7 · Drobné poznámky (bez akce, případně do `plan-after.md`)

- `toConnectionPort` (NG device) vs. `toPort` (NG driver) vs. validace v
  `toAwtrixNgBaseUrl` – tři implementace téže kontroly portu uvnitř NG vrstvy;
  kandidát k F1p (Support/Guards).
- `isPlainObject` v NG device je čtvrtá varianta record-guardu v NG vrstvě – tamtéž.
- Chybové hlášky adaptéru `applicationIcon` v `app.ts` a `AwtrixNgDeviceIdentityMismatchError`
  jsou natvrdo anglicky. U flow/diagnostických chyb přijatelné, jen to zmiňuji
  kvůli konzistenci s D12.
- `.homeychangelog.json` 2.1.0 je v pořádku; verze sjednocené (2.1.0 všude,
  kryto testem).
- Checklist v `plan.md` deklaruje u C5 „bez dual-delete a changelogu" – changelog
  záznam pro odstranění/změnu chování jmen custom app v 2.1.0 textu nezmiňuje
  migraci starých jmen (R3a říkala „přijmout + changelog"). Zvaž doplnění jedné
  věty do changelogu před publikací.

## Doporučené pořadí před publikací 2.1.0

1. **V1** – regrese, jasná oprava, půlhodina i s testem.
2. **V3** – dva floating promises, čtvrthodina.
3. **V2** – migrace; jestli NG zařízení mají jen vývojáři, stačí fallback na store.
4. **V4, V5** – nice-to-have, mohou jít i do 2.1.1.
5. R3a changelog věta (V7 poslední bod).

Body V6/V7 patří do `plan-after.md` backlogu, ne před release.

---

*Pozn. k metodice: prošel jsem kompletní diff `f596dc9..HEAD` všech zdrojových souborů
(drivery, lib, compose, locales, app.ts), namátkově testy a harness. Nálezy V1–V3 jsou
ověřené čtením řídicího toku v aktuálním kódu (V1 navíc potvrzeno tvarem
`clientGetDirect`), ne jen diffu. Testovací sada je výrazně silnější než před
implementací, ale V1–V3 jsou přesně v místech, která nekryje.*
