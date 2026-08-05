# Následný backlog po dokončení `docs/plan.md`

> **Stav: ODLOŽENO / NENÍ PŘIPRAVENO K IMPLEMENTACI.**
>
> Tento dokument vznikl rozhodnutím R11 dne 2026-08-05. Obsahuje nízkoprioritní
> refaktory a optimalizace, které nejsou nutné pro release 2.1.0. Nespouštěj je jako
> jeden balíček a nepovažuj jejich stručný popis za autoritu pro změnu runtime chování.
> Před implementací každého bodu proveď nový audit, doplň přesné soubory, testy,
> akceptační kritéria a případná uživatelská rozhodnutí.

Analytické zdroje: [`claude-remediation-plan.md`](claude-remediation-plan.md) etapa 5,
[`claude.md`](claude.md), [`code-audit-2026-08-05.md`](code-audit-2026-08-05.md) a
finální hlavní plán [`plan.md`](plan.md).

## Závazná pravidla

- AWTRIX 3 a AWTRIX NG zůstávají oddělené drivery. Žádný společný transport, klient,
  normalizer ani import mezi `lib/awtrix3` a `lib/awtrixng`.
- Nepodporované vlastnosti nesmějí být potichu zahozené ani emulované.
- NG API chyby vždy zachovají HTTP status, code, message a field.
- `allSettled()` nesmí skončit pouhým logem, pokud operace podle svého kontraktu má
  selhání propagovat. Případná agregace musí vyhodit `AggregateError` s původními
  error objekty.
- Výjimka pro bundled ikony je záměrná a zdokumentovaná v R9 hlavního plánu: jejich
  upload je nekritický, ale každá chyba se musí strukturovaně diagnostikovat.
- TTL ikon se nesjednocuje: AWTRIX 3 zůstává 120 s kvůli HTML provideru, NG 5 s díky
  specializovanému API.
- Každý níže uvedený kandidát musí dostat vlastní plán a vlastní commit nebo sérii
  přesně vymezených commitů.

## Kandidáti následné fáze

### F1p · NG guardy objektů

Přesunout NG-only duplicity `isRecord`/`isPlainObject` do
`lib/awtrixng/Support/Guards.ts`. `drivers/shared-flow-actions.ts` si ponechá vlastní
kopii, protože shared driver vrstva nesmí importovat implementační helper z NG.

Před provedením zmapovat všechny call-sites a ověřit, že se nezmění zacházení s arrays,
class instances a objekty s nestandardním prototypem.

### F2p · Lokální úklid klienta AWTRIX 3

Prověřit sjednocení `clientGet`/`clientGetDirect` pouze uvnitř AWTRIX 3 API a drobné
duplicity S4/S5/S12. Zachovat odlišné URL cesty, response mapování a současné veřejné
signatury. Nesdílet nic s NG klientem.

### F3p · Normalizery a falsy hodnoty

Prověřit tabulkovou implementaci `toText` a `basicOptions`. Nejdřív napsat behaviorální
charakterizační testy pro všechny falsy hodnoty, zejména `blinkText: 0` a současný
výsledek neplatné barvy. Každá zamýšlená změna výsledku je samostatné uživatelské
rozhodnutí; refaktor nesmí chování opravit náhodou.

### F4p · Nahradit source-parsing testy

S využitím harnessu z B1 nahradit testy, které parsují zdrojový text, skutečnými
behaviorálními testy. Teprve po jejich stabilizaci znovu posoudit odstranění waypointu
`refreshAvailability`. Neodstraňovat metodu jen proto, že po refaktoru nemá přímý
produkční call-site; nejdřív ověřit testovací a integrační kontrakt.

### F5p · Směr závislosti AWTRIX 3 lifecycle typů

Prověřit přesun `DeviceFailer`/`DevicePoll` do `lib/awtrix3/`, aby knihovní API
neimportovalo typy z driveru. Jde o otočení závislosti pouze uvnitř AWTRIX 3, nikoliv
o vytváření společného driver interface. Před změnou výslovně zdokumentovat důvod,
protože se mění umístění sdíleného kontraktu AWTRIX 3 vrstvy.

### F6p · Menší optimalizace a migrace

Rozdělit minimálně na tyto nezávislé kandidáty:

1. `migrate()` převést na deklarativní kroky se stejným pořadím a idempotencí.
2. `configureClient` upravit tak, aby při nezměněném endpointu/credentials zbytečně
   nezahazoval NG icon cache; ověřit, že se starý klient nepoužije po skutečné změně.
3. `setCapabilityValues`: nejdřív určit kontrakt. Pokud má selhání odmítnout operaci,
   lze čekat přes `allSettled()` pouze kvůli sesbírání výsledků a následně vyhodit
   `AggregateError` s původními příčinami. Varianta „allSettled + log + resolve" je
   zakázaná.
4. `BarLineValues` zpřesnit na `number[]` až po testech všech vstupních cest.
5. Statický seznam `transitionEffect` testovat proti `getCapabilities()` jako
   integrační invariant; nemaž ani neemuluj nepodporované hodnoty.
6. Bundled NG ikony případně uploadovat s omezenou paralelností. Zachovat R9:
   dokončit všechny soubory, cache invalidovat po úspěchu a selhání vrátit do
   strukturované diagnostiky s fileName + původním `AwtrixNgApiError`.

### F7p · Upgrade lint toolchainu

Upgrade `eslint` a `@typescript-eslint` na verze podporující používaný TypeScript 5.9
provést v samostatné větvi. Nejdřív určit přesné kompatibilní verze z oficiální
dokumentace, aktualizovat lockfile a oddělit nové lint nálezy od samotného upgradu.
Node runtime se neřeší: Homey minimum 12.9.0 používá Node 22 a současný tsconfig je
v tomto ohledu správně.

### F8p · CI workflow

Navrhnout CI pro build, testy, lint, `homey app build`, kontrolu čistého generovaného
`app.json` a `homey app validate --level publish`. Před implementací ověřit:

- které Homey CLI operace jsou bez přihlášení použitelné v CI,
- podporovanou Node 22 image,
- zda `npm audit --omit=dev` má být blokující nebo pouze reportovací krok,
- jak zabránit tomu, aby síťová nedostupnost registry maskovala skutečný stav testů.

## Podmínka návratu do hlavního plánu

Žádný kandidát se nepřenáší zpět do `docs/plan.md`. Po release 2.1.0 se pro vybrané
body vytvoří nový prováděcí plán s aktuálním baseline, pořadím závislostí a novým
uživatelským schválením změn chování.
