# Dodatečná rizika – třetí průchod (2026-08-05)

> Třetí nezávislý průchod kódem (claude-fable-5), navazuje na:
> [`claude.md`](claude.md) + [`claude-remediation-plan.md`](claude-remediation-plan.md) (Opus)
> a [`code-audit-2026-08-05.md`](code-audit-2026-08-05.md) (ChatGPT).
> Obsahuje **pouze rizika, která v žádném z těchto dokumentů nejsou** – překryvy jsem vynechal.
> Stav repozitáře: commit `f596dc9`, pracovní strom čistý. Žádný zdrojový soubor nebyl změněn.
>
> ID nálezů: `F*` (namespace `A/B/C/D/N/O/S/T` už obsazují předchozí dokumenty).

## Závazné pravidlo

**Awtrix3 a AwtrixNG jsou dva oddělené drivery a nesmí se nijak prolínat.**
Každá mitigace níže to respektuje: kde má stejný problém obě vrstvy (F4), je náprava
navržena **dvakrát, nezávisle** – žádná sdílená třída, žádný společný transport.
Sdílet lze nanejvýš myšlenku, ne kód s API sémantikou.

## Jak byla rizika ověřena

- Statické čtení všech `*.ts` v `drivers/` a `lib/`, compose souborů a testů.
- Nálezy F1, F4 ověřeny grepem přímo v repozitáři (absence `onDiscovery*` v NG,
  absence `maxRedirects`, verze v lockfile).
- Nález F2 ověřen **spuštěním zkompilovaného kódu** z `.homeybuild` – není to spekulace.
- Položky závislé na chování reálného zařízení nebo Homey runtime jsou označené **UNKNOWN**,
  v souladu s praxí projektu (`docs/awtrix-ng/05-todo-list.md`).

---

## F1. NG zařízení se po změně IP adresy už nikdy nenajde · **vysoká**

**Důkaz:** `grep -n "onDiscovery" drivers/awtrixng/device.ts drivers/awtrixng/driver.ts`
→ **žádný výskyt**. `AwtrixNgDevice` čte adresu výhradně ze store
(`getBaseUrlFromStore()`, `device.ts:262–277`), který se zapisuje jen při párování.

Srovnání: Awtrix3 driver má kompletní re-discovery řetěz –
`onDiscoveryResult` / `onDiscoveryAvailable` / `onDiscoveryAddressChanged`
(`drivers/awtrixlight/device.ts:192–219`), fallback `tryRediscover()` volaný z pollingu
(`:63–65`) **a** maintenance tlačítko `button.rediscover`. NG driver nemá **nic z toho**,
přestože `driver.compose.json` deklaruje `discovery: awtrixng-mdns` – discovery se tedy
používá jen při párování a pak už nikdy.

**Dopad:** jakmile DHCP přidělí NG zařízení jinou adresu, zařízení zůstane trvale
unavailable. Poll běží dál proti mrtvé `baseUrl`, mDNS oznámení o nové adrese se ignoruje
a uživatel nemá ani maintenance akci – jediná cesta je zařízení smazat a spárovat znovu
(čímž přijde o flows navázané na device instanci).

**Mitigace (pouze v NG vrstvě):**

1. Implementovat v `AwtrixNgDevice`:
   - `onDiscoveryResult(r)` → `r.id === this.getData().id`,
   - `onDiscoveryAddressChanged(r)` → přepočítat `toAwtrixNgBaseUrl({address, port})`,
     zapsat do store, `configureClient(...)`, hned `refreshDeviceState()`,
   - `onDiscoveryAvailable(r)` → totéž, když je zařízení unavailable.
2. Zvážit paritu maintenance tlačítka `button.rediscover` s Awtrix3 (vlastní implementace,
   ne sdílená).
3. **UNKNOWN k ověření na zařízení:** discovery compose má `"id": "{{txt.id}}"`
   a device `data.id` se plní z `/api/v1/device` polem `uid`. Rovnost `txt.id === uid`
   je předpoklad, na kterém párování `onDiscoveryResult` stojí – před implementací ověřit
   na fyzickém NG zařízení a výsledek zapsat do `06-user-maintainer-guide.md`.

**Ověření:** test s fake discovery výsledkem – změna adresy vede k novému klientovi
a okamžitému probe; cizí `txt.id` se ignoruje.

**Zařazení do plánu:** etapa 3 (robustnost NG), hned vedle B3.

---

## F2. Awtrix3 posílá `user: true, pass: true` do settings endpointu zařízení · **vysoká**

**Důkaz (runtime, spuštěno nad `.homeybuild`):**

```
> settingOptions({ user: 'admin', pass: 'secret', TIM: true, TEFF: '2' })
{"TEFF":2,"TIM":true,"user":true,"pass":true}
```

Příčina v `lib/awtrix3/Normalizer.ts:312–326`: `settingOptions` iteruje přes
`{ ...defaultSettingsOptions, ...options }`, tedy **i přes klíče, které přišly zvenku**.
Podmínka `key in options` pak propustí jakýkoli cizí klíč a `!!options[key]` z něj udělá
boolean. Protože `drivers/awtrixlight/device.ts:177` volá
`this.api.setSettings(newSettings)` s **kompletním** settings objektem Homey (včetně
`user` a `pass`), každé uložení nastavení pošle na `POST /api/settings` zařízení
pole `user: true, pass: true` plus cokoliv dalšího, co kdy v settings přibude.

**Dopad:** zařízení dostává nedokumentovaná pole odvozená z credentials. Dnes je AWTRIX 3
firmware zřejmě ignoruje, ale je to přesně ten typ tichého kontraktového driftu, který
`AGENTS.md` zakazuje („Do not silently drop unsupported fields" platí i obráceně – neposílat
pole, která nejsou součástí kontraktu). Kolize s budoucím firmware klíčem stejného jména by
byla tichá a těžko diagnostikovatelná.

**Mitigace:** iterovat **jen přes klíče `defaultSettingsOptions`**:

```ts
// náčrt – lib/awtrix3/Normalizer.ts
Object.keys(defaultSettingsOptions).forEach((key) => {
  if (key !== 'TEFF' && key in options) {
    opt[key as OptionalSettingOptions] = !!options[key];
  }
});
```

**Ověření:** rozšířit `core.test.js` o
`assert.deepEqual(settingOptions({ user: 'a', pass: 'b', TIM: true }), { TIM: true })`.

**Zařazení do plánu:** etapa 2 – souvisí s N9 (chybový kontrakt write operací),
ale je samostatně opravitelné a bezpečné i dříve.

---

## F3. Změna libovolného nastavení Awtrix3 při offline zařízení selže jako „špatné heslo" · **střední–vysoká**

**Důkaz:** `drivers/awtrixlight/device.ts:162–175`:

```ts
if (typeof newSettings.user === 'string' && typeof newSettings.pass === 'string') {
  if (!await this.testDevice(newSettings.user, newSettings.pass)) {
    ...
    throw new Error(this.homey.__('states.invalidCredentials'));
  }
```

Podmínka **nekontroluje `changedKeys`** – jakmile uživatel někdy uložil settings
(text pole se pak posílají jako `''`), je splněná při každé další změně.
`testDevice` vrací `false` i při timeoutu / nedostupnosti (`clientVerify` → `Status.NotFound`),
takže přepnutí checkboxu „Time app" u zrovna nedostupného zařízení skončí chybou
**„Username or password is not valid"** a Homey celou změnu odmítne.

Vedlejší efekt: `clientVerify(true, …)` volá `processResponseCode`, který během ukládání
nastavení inkrementuje fail counter a může přepnout availability – ukládání settings tak
má skrytý vliv na stavový automat dostupnosti (souvisí s N2).

**Mitigace:**

1. Credentials testovat jen když `changedKeys` obsahuje `user` nebo `pass`.
2. Rozlišit výsledek podle `Status`: `AuthRequired`/`AuthFailed` → `invalidCredentials`;
   `NotFound`/`Error` → nová hláška typu „zařízení není dosažitelné, zkuste to později"
   (nový klíč v `locales/en.json`).
3. Test proti současnému chování napsat **před** opravou (spadá do harness N1).

**Zařazení do plánu:** etapa 2, dělat společně s N9/N10 (dotýká se téhož `onSettings`).

---

## F4. Redirecty z zařízení nejsou omezené · **nízká–střední (hardening)**

**Důkaz:** `grep -rn "maxRedirects"` → žádný výskyt v žádné vrstvě.
Lockfile: `axios 1.18.1`, `follow-redirects 1.16.0`.

Oba HTTP klienty (`lib/awtrix3/Api/Client.ts` i `lib/awtrixng/Http/AxiosTransport.ts`)
posílají ručně složenou `Authorization: Basic …` hlavičku a nechávají axios následovat
až 5 redirectů (default). Konkrétní rizika:

- `follow-redirects ≥ 1.14.8` sice `Authorization` při **cross-host** redirectu odstraňuje
  (ověřeno – lockfile má 1.16.0, tedy bezpečnou verzi), ale při redirectu na **stejném hostu**
  hlavičku ponechává a celé chování je závislé na verzi tranzitivní závislosti,
  kterou nikdo nehlídá.
- LAN zařízení nemá žádný legitimní důvod přesměrovávat API volání. Kompromitované nebo
  podvržené zařízení (mDNS spoofing na LAN je triviální) by mohlo přesměrováním měnit,
  kam requesty tečou.
- Bonus v Awtrix3: `statusFromHttpCode` (`Client.ts:8`) mapuje **celé pásmo 200–399 na `Status.Ok`**,
  takže kdyby se 3xx někdy vynořilo (vyčerpané redirecty se projeví jinak, ale např.
  změna chování axios adaptéru), tvářilo by se jako úspěch.

**Mitigace (v každé vrstvě zvlášť, žádné sdílení):**

1. `maxRedirects: 0` v axios configu Awtrix3 `Client` – redirect se stane chybou.
2. `maxRedirects: 0` v NG `AxiosTransport` – tam se přirozeně zabalí do `AwtrixNgHttpError`
   se zachovanými detaily (mantinel „neztrácet chyby" zůstává splněn).
3. V Awtrix3 zúžit `statusFromHttpCode` na `code >= 200 && code < 300` → `Ok`.
4. Do CI (T6 v plánu) přidat `npm audit --omit=dev`, aby se verze `follow-redirects`
   a `axios` hlídaly průběžně.

**Ověření:** test s fake serverem/adapterem vracejícím 302 → obě vrstvy hlásí chybu,
nikoli úspěch.

---

## F5. Detekce „vyžaduje přihlášení" u NG je křehká · **střední**

**Důkaz:** `lib/awtrixng/Discovery/Detection.ts:94`:

```ts
const isUnauthorizedError = (error) => error.httpStatus === 401 && error.code === 'unauthorized';
```

Stav `auth-required` vznikne **jen** když zařízení vrátí současně HTTP 401 **a** error
envelope s přesně `code: "unauthorized"`. Jakákoli odchylka – starší/novější firmware
s jiným envelope, reverse proxy před zařízením, 401 s prázdným tělem
(→ `parseAwtrixNgApiError` dá `code: 'unknownErrorEnvelope'`) – spadne do větve `offline`.

**Dopad:** párování pak místo formuláře pro přihlášení ukáže „The device cannot be contacted"
(`manual_pairing_placeholder.html:184`), což uživatele pošle špatným směrem (kontrola kabelů
místo zadání hesla). Stejná miskategorizace postihne availability hlášku běžícího zařízení
(`Device is offline. …` místo `Authentication is required. …`).

**Mitigace:** klasifikovat `auth-required` podle **samotného `httpStatus === 401`**;
`code === 'unauthorized'` brát jako potvrzení, ne podmínku. Envelope detaily
(kód, message, field) dál zachovat, když existují – mantinel o neztrácení chyb se nemění.
Zvážit i `httpStatus === 403` → vlastní větev, ne `offline` (**UNKNOWN**: nutno ověřit,
kdy NG firmware vrací 403 vs. 401 – zapsat do vendor dokumentace po testu na zařízení).

**Ověření:** rozšířit `awtrixng-detection.test.js` o 401 bez envelope a 401 s cizím kódem.

---

## F6. NG validuje jen odpověď `/device`; ostatní odpovědi se castují naslepo · **střední**

**Důkaz:** `probeAwtrixNgDevice` má poctivý shape guard (`isAwtrixNgDeviceStateResponse`),
ale `getSettings()`, `getDisplay()`, `getApps()` vracejí `(await transport.request()).data`
přetypované na deklarovaný typ bez jakékoli runtime kontroly
(`lib/awtrixng/Api/Client.ts:59–79, 127–132`). Konzumenti pak:

- `toAwtrixNgHomeySettingsUpdate` (`Services/Settings.ts:90–104`) čte pole jako
  `settings.autoBrightness` – při chybějícím poli vznikne `update.autoBrightness = undefined`
  a `device.setSettings(update)` dostane `undefined` hodnoty (chování Homey při
  `undefined` v setSettings není dokumentované – **UNKNOWN**),
- `toAwtrixNgBuiltinAppSettingsUpdate` iteruje `apps.find(...)` – při ne-poli spadne
  na `TypeError`, což je sice chyba „nezahozená", ale nediagnostická.

Projekt přitom má zásadu „Treat documentation and actual existing code as separate sources
of truth" – důvěra v tvar odpovědi je dnes implicitní, nikde nezapsaná.

**Mitigace:** lehké guardy na vstupu konzumace (ne plná validace):
`Array.isArray(apps)`, `isRecord(settings)` + filtrace `undefined` hodnot před
`setSettings`. Při nesplnění vyhodit popsanou NG chybu (`unknownErrorEnvelope` styl),
ne pokračovat. Alternativně explicitně zapsat do `06-user-maintainer-guide.md`, že tvary
odpovědí mimo `/device` jsou důvěřované – ale rozhodnout to vědomě.

---

## F7. Cílový Node runtime Homey vs. `@tsconfig/node22` · **UNKNOWN / střední**

**Důkaz:** `tsconfig.json` dědí `@tsconfig/node22` (target/lib ES2023),
`package.json` má `engines.node >= 22`. Ani jedno ale neovlivňuje, **jakou verzí Node**
skutečně běží aplikace na Homey Pro – `engines` Homey neřídí a tsc s lib ES2023 ochotně
pustí API, které na starším runtime za běhu spadne (`Array.prototype.findLast`,
`structuredClone`, …).

Dnes kód žádné takové API zjevně nepoužívá (prošel jsem grep na typické kandidáty),
takže je to **latentní** riziko: první použití moderního API projde tsc, projde testy
(lokální Node je nový) a spadne až na zařízení.

**Mitigace:**

1. Ověřit verzi Node aktuálního Homey Pro firmware pro SDK3 aplikace (dokumentace/`process.version`
   v logu) a zapsat ji do `06-user-maintainer-guide.md`.
2. Pokud je runtime starší než 22, snížit `@tsconfig/nodeXX` na odpovídající verzi –
   je to jednořádková změna, která z latentního rizika udělá compile-time chybu.

---

## F8. Tlačítko „Try to discover" neobnoví dostupné zařízení · **nízká–střední**

**Důkaz:** `drivers/awtrixlight/device.ts:112–130`:

```ts
if (await this.api.clientVerify() === Status.Ok) {
  return;      // ← žádný setAvailable, žádný poll.start
}
```

`clientVerify()` bez `verify=true` **nevolá** `processResponseCode`, takže úspěšné ověření
nezmění stav zařízení. Scénář: zařízení bylo chvíli nedostupné → unavailable + extended
poll (5 min). Uživatel ho zapne a klikne na maintenance tlačítko → ověření projde,
handler tiše skončí, ale zařízení **zůstane unavailable** až do dalšího extended pollu.
Z pohledu uživatele tlačítko „nefunguje".

**Mitigace:** v úspěšné větvi volat `this.api.clientVerify(true)` (procesuje response code,
který zařízení zpřístupní a restartuje normální poll) – nebo explicitně
`setAvailable()` + `failsReset()` + `poll.start()`. Dělat po N2, protože se dotýká
téhož stavového automatu.

---

## F9. NG vrstva míchá lokalizované a natvrdo anglické uživatelské texty · **nízká**

**Důkaz:** Awtrix3 hlásí stavy přes `homey.__('states.*')` / `api.error.*`.
NG naproti tomu ukazuje uživateli natvrdo anglické texty:

- `lib/awtrixng/Device/Availability.ts:51,58,64` – „Authentication is required. …",
  „The device did not return a valid response.", „Device is offline. …" → jdou přímo
  do `setUnavailable()`, tedy do UI,
- `drivers/awtrixng/device.ts:74` – „Device address is not configured yet.",
- `drivers/awtrixng/driver.ts:227` – jméno pairing položky `'Add manually'`,
  přestože klíč `pair.manual.title` v `locales/en.json` existuje a používá ho HTML view.

**Mitigace:** v souladu s vrstvením – `lib/awtrixng` nemá znát Homey i18n; nechat lib
vracet **strukturovaný stav** (to už dělá: `AwtrixNgAvailabilityState`) a lidský text
skládat až v `drivers/awtrixng/device.ts` přes `homey.__(…)` s novými klíči v `locales/en.json`.
Technické detaily chyby (code/field/status) ponechat anglicky za přeloženou hlavičkou.
`locales.test.js` pak pokryje nové klíče automaticky.

---

## F10. NG flow `weatherOverlay` zapisuje capability bez guardu · **nízká**

**Důkaz:** `drivers/awtrixng/flow-actions.ts:219–222` volá
`args.device.setCapabilityValue(AwtrixNgWeatherOverlayCapabilityId, …)` nepodmíněně,
zatímco `refreshDisplayFromDevice` (`device.ts:196–198`) tentýž zápis správně hlídá přes
`hasCapability()`. Pokud capability chybí (zařízení spárované starší verzí driveru,
selhavší migrace), flow akce **selže až po** úspěšném `patchDisplay` – zařízení overlay
změní, ale flow ohlásí chybu.

**Mitigace:** doplnit do `AwtrixNgFlowActionDevice` rozhraní `hasCapability(id): boolean`
a zápis podmínit; nebo zápis capability z flow akce úplně vypustit a nechat ho na pollu
(do 60 s se srovná sám). Rozhodnout explicitně, ne obojí.

---

## F11. Nenakonfigurované NG zařízení je slepá ulička · **nízká**

**Důkaz:** `drivers/awtrixng/device.ts:71–76` – když store nemá `baseUrl` ani
`address+port`, `onInit` skončí `setUnavailable('Device address is not configured yet.')`
a `return`. V tu chvíli nejsou zaregistrované capability listenery, neexistuje poll
a `onSettings` (`:109–113`) hází tutéž chybu. Neexistuje žádná cesta, jak zařízení
opravit – jen smazat a znovu spárovat.

Prakticky by tento stav neměl nastat (párování store vždy naplní), ale je to trap bez
východu, který se při jakékoli budoucí chybě párování/migrace stane permanentním.

**Mitigace:** buď (a) přidat adresu/port do device settings jako opravitelné pole
a v `onSettings` umožnit rekonfiguraci ze „nenakonfigurovaného" stavu, nebo
(b) zdokumentovat v `06-user-maintainer-guide.md`, že tento stav je terminální záměrně.
Rozhodnout, nezůstávat v mezistavu.

---

## F12. mDNS guard v NG driveru je tautologie · **nízká**

**Důkaz:** `drivers/awtrixng/driver.ts:481–484` volá

```ts
isAwtrixNgMdnsCandidate({ serviceName: AwtrixNgMdnsServiceName, txt: … })
```

– `serviceName` se předává **jako vlastní konstanta**, takže větev `serviceNameMatches`
v `Detection.ts:104–108` je vždy pravdivá a reálně se kontroluje jen `txt.type === 'awtrixng'`.
Druhá větev (`name === 'awtrixng' && protocol === 'tcp'`) je z tohoto call-situ mrtvá.
Filtrování služby dělá fakticky jen compose (`awtrixng-mdns.json`); runtime guard budí
dojem druhé obranné linie, kterou není.

**Mitigace:** předávat skutečná metadata discovery výsledku (pokud je Homey poskytuje),
nebo funkci zjednodušit na `hasAwtrixNgTxtType(txt)` a přestat předstírat kontrolu
serviceName. Souvisí s F1 – při implementaci re-discovery se stejně bude řešit,
co přesně mDNS výsledek obsahuje.

---

## Drobné poznámky (bez vlastního ID)

- **Awtrix3 párování snímkuje discovery jednou.** `drivers/awtrixlight/driver.ts:81–82`
  volá `getDiscoveryResults()` při startu session, mimo handler; zařízení zapnuté během
  otevřeného pairing dialogu se v seznamu neobjeví ani po refreshi. NG to dělá správně
  (uvnitř handleru). Oprava = přesun jednoho řádku.
- **`indicatorNumber` propustí `NaN`.** `lib/awtrix3/Normalizer.ts:123–125`:
  nenumerické `id` → `Math.min(3, Math.max(1, NaN))` = `NaN` → endpoint `indicatorNaN`.
  Flow karty to kryjí dropdownem, ale `cmdIndicator` je veřejné API zařízení.
  Jeden `isNumeric` guard.
- **Párování Awtrix3 ukládá `settings: { user: null, pass: null }`**, zatímco settings
  compose deklaruje textová pole s `value: ""`. Kvůli tomu se F3 projeví až po prvním
  uložení settings (pak už jsou to `''` řetězce). Sjednotit na `''` při párování.
- **Závislosti jsou v lockfile aktuální** (axios 1.18.1, follow-redirects 1.16.0,
  form-data 4.0.6) – ale nic je nehlídá průběžně; `npm audit` patří do CI kroku T6
  (viz mitigace F4).

## Zařazení do etap remediation plánu

| Etapa (dle `claude-remediation-plan.md`) | Nálezy odsud |
|---|---|
| 1 – bezriziková údržba | F12, drobné poznámky (snapshot, `indicatorNumber`, `null` settings) |
| 2 – kontrakt AWTRIX 3 | **F2**, **F3**, F8, awtrix3 část F4 |
| 3 – robustnost NG | **F1**, F5, F6, F10, F11, NG část F4 |
| průřezově / UNKNOWN | F7 (runtime Node), F9 (i18n), ověření `txt.id === uid` (F1) |

Tučně = doporučuji zařadit mezi priority dané etapy; F1 a F2 považuji za nejzávažnější
z celého tohoto průchodu.
