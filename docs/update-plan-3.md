# Refactoring plán: fasáda `AwtrixNgApi` pro driver awtrixng

Repo: `bckp/de.blueforcer.awtrixlight` · Připraveno: 7. 8. 2026 · Stav: návrh k implementaci

## 1. Motivace a cíl

Driver **awtrixng** dnes nemá orchestrační vrstvu. Operace nad zařízením jsou rozprostřené
do ~35 volných funkcí (`Services/*`, `Device/*`, `Payload/*`), z nichž většina bere `client`
jako parametr. Důsledky:

- `drivers/awtrixng/device.ts` má **772 řádků a 24 import bloků (~40 symbolů)** — dělá
  orchestraci, která patří do knihovny.
- Každý symbol nese prefix `AwtrixNg*`, protože žije v plochém exportovaném prostoru.
- Driver **awtrixlight** (awtrix3) přitom používá vzor `Device → Api (fasáda) → Client`,
  takže oba drivery jsou architektonicky nekonzistentní.

**Cíl:** zavést fasádu `AwtrixNgApi` po vzoru `lib/awtrix3/Api/Api.ts`, přesunout do ní
orchestraci a srazit `device.ts` na tenkou vrstvu Homey lifecycle + mapování capabilities.

**Ne-cíl (out of scope):** přepis čistých funkcí (`Transformers`, `Guards`, `State`,
`Payload/*`) na třídy — jsou bezstavové, mají izolované testy a fasáda je bude volat interně.
Nemění se veřejné chování driveru, manifest, flow karty ani lokalizace.

## 2. Cílová architektura

```
drivers/awtrixng/device.ts   (Homey lifecycle, capabilities, settings UI)
        │  drží jedinou závislost: this.api
        ▼
lib/awtrixng/Api/Api.ts      ← NOVÉ: fasáda AwtrixNgApi
        │  implements AwtrixNgFlowActionClient
        │  vlastní: Client, Icons; volá čisté funkce ze Services/Payload/Device
        ▼
lib/awtrixng/Api/Client.ts   (beze změny — HTTP endpointy)
lib/awtrixng/Http/*          (beze změny — transport)
```

Zásady:

1. **Fasáda žije v `lib/` a neimportuje `homey`.** Vrací doménové výsledky
   (`AwtrixNgHomeySettingsUpdate`, `AwtrixNgWeatherOverlayValue`, …); zápis do Homey
   (setSettings, setCapabilityValue, i18n hlášky) zůstává v `device.ts`. Tím zůstane
   celá `lib/awtrixng` testovatelná bez mocků Homey — na rozdíl od awtrix3 `Api`,
   která si `device` bere do konstruktoru (vědomá odchylka od vzoru, zdůvodnění: testy).
2. **Fasáda implementuje existující `AwtrixNgFlowActionClient`** z
   `drivers/awtrixng/flow-actions.ts` — flow akce pak dostanou rovnou `device.api`.
3. Čisté funkce, které po migraci nebude nikdo importovat zvenku, se označí jako
   interní (přestat exportovat / přesunout vedle fasády), ale až v posledním kroku.

## 3. Skica rozhraní

Návrh vychází ze skutečných call-sites v `device.ts`, `driver.ts` a `flow-actions.ts`.
Názvy metod bez prefixu `AwtrixNg` — kontext dává třída.

```ts
// lib/awtrixng/Api/Api.ts
import { AwtrixNgBasicAuthOptions } from '../Http/Transport';
import { AwtrixNgDeviceProbeResult } from '../Discovery/Detection';
import { AwtrixNgHomeySettings, AwtrixNgHomeySettingsUpdate } from '../Services/Settings';
import { AwtrixNgBuiltinAppSettingsUpdate } from '../Services/Apps';
import { AwtrixNgWeatherOverlayValue } from '../Services/Display';
import { AwtrixNgHomeyCapabilityId, AwtrixNgCapabilityUpdatePlan } from '../Device/State';
import AwtrixNgIcons, { AwtrixNgIconAutocompleteItem, AwtrixNgIconTimerHost } from '../Services/Icons';
import {
  AwtrixNgApiDeviceStateResponse, AwtrixNgApiDisplayPatch, AwtrixNgApiIndicatorPayload,
  AwtrixNgApiNotificationPayload, AwtrixNgApiOkResponse, AwtrixNgApiPushedAppPayload,
} from './Types';
import { AwtrixNgIndicatorId } from './Client';
import { AwtrixNgFlowActionClient } from '../../../drivers/awtrixng/flow-actions';
// pozn.: interface AwtrixNgFlowActionClient přesunout do lib (viz krok M2),
// ať lib nezávisí na drivers/

export interface AwtrixNgConnectionOptions {
  baseUrl: string;                       // z toAwtrixNgBaseUrl(...)
  auth?: AwtrixNgBasicAuthOptions;
  timeoutMs?: number;
}

export interface AwtrixNgSettingsChangeResult {
  /** hodnoty k propsání zpět do Homey settings (device.setSettings) */
  homeyUpdate?: AwtrixNgHomeySettingsUpdate;
}

export default class AwtrixNgApi implements AwtrixNgFlowActionClient {

  /** Jediný způsob konstrukce — zapouzdřuje new AxiosTransport + new Client. */
  static fromConnection(options: AwtrixNgConnectionOptions, icons?: { timerHost?: AwtrixNgIconTimerHost }): AwtrixNgApi;

  /** Jednorázový probe bez držení instance — pro driver.ts (pairing, rediscovery). */
  static probe(options: AwtrixNgConnectionOptions): Promise<AwtrixNgDeviceProbeResult>;

  readonly baseUrl: string;
  readonly icons: AwtrixNgIcons;

  // ---- identita / dostupnost -------------------------------------------
  probe(): Promise<AwtrixNgDeviceProbeResult>;
  /** probe + kontrola uid; při neshodě vyhodí AwtrixNgDeviceIdentityMismatchError
   *  (error třídu přesunout z device.ts do lib/awtrixng/Api/). */
  verifyIdentity(expectedUid: string): Promise<AwtrixNgDeviceProbeResult>;

  // ---- čtení stavu (sync do Homey) -------------------------------------
  getDeviceState(): Promise<AwtrixNgApiDeviceStateResponse>;
  /** getSettings + toAwtrixNgHomeySettingsUpdate */
  readSettings(current: AwtrixNgHomeySettings): Promise<AwtrixNgHomeySettingsUpdate | undefined>;
  /** getDisplay + toAwtrixNgHomeyWeatherOverlayValue */
  readWeatherOverlay(): Promise<AwtrixNgWeatherOverlayValue>;
  /** getApps + toAwtrixNgBuiltinAppSettingsUpdate */
  readBuiltinAppSettings(current: AwtrixNgHomeySettings): Promise<AwtrixNgBuiltinAppSettingsUpdate | undefined>;
  /** createAwtrixNgCapabilityUpdatePlan — čistá funkce, fasáda ji jen re-exportuje
   *  jako metodu kvůli jednomu importu v device.ts */
  planCapabilityUpdate(
    state: AwtrixNgApiDeviceStateResponse,
    existing: string[],
    options: { allowAddCapabilities: boolean },
  ): AwtrixNgCapabilityUpdatePlan;

  // ---- zápis nastavení ---------------------------------------------------
  /** Konsoliduje dnešní čtveřici z device.ts:
   *  validate → createSettingsPatch → prepareBuiltinAppsChange → writeAppsOrder/writeSettingsPatch.
   *  Vyhazuje AwtrixNgBuiltinAppUnavailableError (beze změny). */
  applySettingsChange(newSettings: AwtrixNgHomeySettings, changedKeys: string[]): Promise<AwtrixNgSettingsChangeResult>;

  // ---- ovládací capabilities --------------------------------------------
  setMatrixPower(on: boolean): Promise<void>;      // runAwtrixNgMatrixPowerCapability
  nextApp(): Promise<void>;                        // runAwtrixNgNextAppCapability
  previousApp(): Promise<void>;                    // runAwtrixNgPreviousAppCapability
  setWeatherOverlay(value: AwtrixNgWeatherOverlayValue): Promise<void>;

  // ---- AwtrixNgFlowActionClient (delegace na Client) ----------------------
  sendNotification(payload: AwtrixNgApiNotificationPayload): Promise<AwtrixNgApiOkResponse>;
  dismissActiveNotification(): Promise<AwtrixNgApiOkResponse>;
  patchDisplay(patch: AwtrixNgApiDisplayPatch): Promise<AwtrixNgApiOkResponse>;
  playRtttl(rtttl: string): Promise<AwtrixNgApiOkResponse>;
  putIndicator(id: AwtrixNgIndicatorId, payload: AwtrixNgApiIndicatorPayload): Promise<AwtrixNgApiOkResponse>;
  deleteIndicator(id: AwtrixNgIndicatorId): Promise<AwtrixNgApiOkResponse>;
  putPushedApp(name: string, payload: AwtrixNgApiPushedAppPayload): Promise<AwtrixNgApiOkResponse>;
  deleteApp(name: string): Promise<AwtrixNgApiOkResponse>;
}
```

Co fasáda **nedrží**: `AwtrixNgPoll`. Poll vlastní timer navázaný na lifecycle zařízení
a callback sahá na Homey — zůstává v `device.ts` (`this.poll`), jen jeho callback se
zjednoduší na volání `this.api.*`.

## 4. Dopad na device.ts (před → po)

| | před | po (odhad) |
|---|---|---|
| import bloků | 24 | ~6 (`AwtrixNgApi`, `Poll`, chybové typy, `Detection.toAwtrixNgBaseUrl`, Homey, typy nastavení) |
| řádků | 772 | ~450–500 |
| privátní metody `createClient/activateClient/configureClient/getClient` | 4 | 1 (`createApi`) |

Příklad migrace call-site:

```ts
// před
const client = await this.verifyCandidateConnection(connection.baseUrl, connection.auth);
await writeAwtrixNgAppsOrder(client, changes.appsOrderPayload);
await writeAwtrixNgSettingsPatch(client, changes.settingsPatch);

// po
const api = await this.verifyCandidateConnection(connection.baseUrl, connection.auth);
const { homeyUpdate } = await api.applySettingsChange(newSettings, changedKeys);
```

## 5. Postup implementace (inkrementálně, testy zelené po každém kroku)

**M1 — Skeleton fasády (bez migrace call-sites)**
1. Vytvořit `lib/awtrixng/Api/Api.ts` dle skici; metody jsou tenké delegace na existující
   funkce/Client. Žádná logika se nekopíruje, jen volá.
2. Přesunout `AwtrixNgDeviceIdentityMismatchError` (dnes inline v `device.ts`) do
   `lib/awtrixng/Api/` jako řádnou `class extends Error` s `instanceof` podporou.
3. Nový test `test/awtrixng-api-facade.test.js`: konstrukce, delegace (fake transport),
   `verifyIdentity` happy + mismatch, `applySettingsChange` happy + `BuiltinAppUnavailable`.

**M2 — Rozvázání směru závislostí**
4. Přesunout interface `AwtrixNgFlowActionClient` z `drivers/awtrixng/flow-actions.ts`
   do `lib/awtrixng/Api/` (flow-actions si ho re-exportuje kvůli zpětné kompatibilitě
   testů). `lib/` nesmí importovat z `drivers/`.

**M3 — Migrace `device.ts`**
5. Nahradit `this.client`/`this.icons` jediným `this.api?: AwtrixNgApi`
   (`activateClient` → `activateApi`).
6. Postupně přepnout call-sites po skupinách: (a) controls, (b) refresh*, (c) settings
   change, (d) verify/probe. Po každé skupině `npm test`.
7. Flow akce: předávat `this.api` tam, kde dnes jde `client` splňující
   `AwtrixNgFlowActionClient` (rozhraní je stejné → změna minimální).

**M4 — Migrace `driver.ts`**
8. `#createProbeClient` + `probeAwtrixNgDevice` → `AwtrixNgApi.probe(...)` (3 call-sites:
   pairing manual, pairing discovery, repair).

**M5 — Úklid**
9. Funkce, které už neimportuje nikdo mimo `lib/awtrixng`, přestat exportovat z veřejných
   míst (příp. přesunout do `Api/internal/`). Ověřit `ts-prune`/`eslint no-unused`.
10. Zvážit zkrácení interních názvů (prefix `AwtrixNg` u ne-exportovaných symbolů už
    nedává smysl) — samostatný, čistě mechanický commit.
11. Aktualizovat `test/awtrixng-lib-structure.test.js` (hlídá strukturu lib) a README
    sekci o architektuře, pokud existuje.

## 5b. M6 (volitelné, schváleno vlastníkem repa): sdílený `Poll`

Vědomá výjimka z pravidla „no shared class" v AGENTS.md — Poll je čistá, protokolově
agnostická infrastruktura (start/stop, guard proti souběhu, callback+onError). Obě dnešní
implementace (`lib/awtrix3/Poll.ts`, `lib/awtrixng/Device/Poll.ts`) sdílejí identické jádro;
liší se jen v (a) extend/failsafe režimu, který má pouze awtrix3, a (b) `TimerHost`
abstrakci, kterou má pouze NG.

1. Vytvořit `lib/shared/Poll.ts`: NG implementace jako základ (`TimerHost`, privátní `#`
   fieldy) + doplnit volitelný extend/failsafe režim z awtrix3
   (`extend()`, `isExtended()`, `failsafeMs` v options; default beze změny chování).
2. Přesunout tam i interface `TimerHost` a použít ho i v `Services/Icons.ts`
   (dnes NG definuje timer-host tvar dvakrát).
3. Migrovat `drivers/awtrixng` (drop-in), poté `drivers/awtrixlight` — tam se mění
   konstrukce: místo předání `homey` se předá `{ setInterval: homey.setInterval.bind(homey),
   clearInterval: homey.clearInterval.bind(homey) }`. Chování (interval 30 s,
   failsafe 18 000 000 ms) zachovat beze změny.
4. Smazat obě původní Poll třídy, testy (`awtrixng-poll.test.js`, awtrix3 lifecycle)
   přesměrovat/rozšířit o extend režim.
5. **Aktualizovat AGENTS.md ve stejném PR:** doplnit k pravidlu o odděleni vět u výjimky —
   `lib/shared/` smí obsahovat výhradně protokolově agnostickou infrastrukturu bez znalosti
   AWTRIX 3/NG API; aktuálně pouze `Poll` (+ `TimerHost`). Cokoli dalšího vyžaduje
   explicitní schválení vlastníka.

Akceptační kritérium navíc: `lib/shared/` neimportuje nic z `lib/awtrix3` ani
`lib/awtrixng` a neobsahuje žádný protokolový typ.

## 6. Testovací strategie

- Existující testy (`awtrixng-*.test.js`, ~30 souborů) se **nemažou ani nepřepisují**
  v M1–M4; čisté funkce zůstávají exportované, dokud neproběhne M5.
- V M5 se testy čistých funkcí přesměrují na nové cesty importu, logika testů beze změny.
- Nové testy fasády používají fake transport (vzor: `test/awtrixng-http.test.js`),
  žádný mock Homey.
- Regrese: `npm test` + `npm run lint` po každém kroku; smoke test párování na reálném
  zařízení po M3 a M4.

## 7. Akceptační kritéria

- [ ] `device.ts` neimportuje nic z `lib/awtrixng/Services|Payload|Device` přímo
      (výjimka: typy nastavení, dokud se nepřestěhují).
- [ ] `device.ts` ≤ ~500 řádků, ≤ 8 import bloků.
- [ ] `lib/awtrixng` neimportuje `homey` ani nic z `drivers/`.
- [ ] Všechny existující testy zelené, přibyl test fasády.
- [ ] Chování driveru beze změny (pairing, repair, flow karty, settings sync, poll).

## 8. Rizika a poznámky

- `applySettingsChange` slučuje validate/prepare/write — pozor na dnešní pořadí operací
  (validace builtin apps běží před vytvořením settings patche; zachovat).
- `AwtrixNgIcons` má timer (`timerHost`) — fasáda ho musí přijímat v konstruktoru,
  jinak se rozbije cache invalidation navázaná na Homey `setTimeout`.
- Driver `awtrixlight` (awtrix3) se **nemění**; případné sjednocení obou fasád do
  společného vzoru je téma na potom.
