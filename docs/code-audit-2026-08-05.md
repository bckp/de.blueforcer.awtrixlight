# Technický audit kódu – 2026-08-05

## Cíl a rozsah

Audit je přípravou pro další fázi vývoje. Zaměřuje se na:

- zbytečný nebo nedokončený kód,
- asynchronní operace, které mohou skončit dříve, než očekává Homey,
- zbytečně sekvenční I/O a HTTP operace,
- duplicity a příliš široké veřejné API,
- mezery v testech a nekonzistence projektu.

Při hodnocení platí tyto hranice:

- AWTRIX 3 musí zůstat funkční.
- AWTRIX NG zůstává samostatný driver.
- NG chyby se nesmí zahazovat; musí se zachovat HTTP status, kód, zpráva a pole, pokud jsou dostupné.
- Velké typové definice NG API nejsou samy o sobě mrtvý kód. Slouží také jako explicitní kontrakt s dokumentovaným API.
- Deprecated Flow karty nelze odstranit jen podle počtu runtime použití; mohou existovat v uživatelských Flows.

## Ověřený stav

V době auditu byl Git pracovní strom čistý. Byly spuštěny tyto kontroly:

| Kontrola | Výsledek |
|---|---|
| `npm run lint` | prošlo |
| `npx tsc --noEmit` | prošlo |
| `npm test` | 206/206 testů prošlo |
| `homey app validate` | publish validace prošla |

Homey validace nekontroluje všechny níže uvedené vazby. Například neohlásila chybějící `xlarge.png` ani Flow kartu bez registrovaného listeneru.

## Doporučené pořadí další práce

1. Doplnit lifecycle a API testy pro AWTRIX 3, potom opravit jeho asynchronní a chybový kontrakt.
2. Rozhodnout osud nedokončené `applicationIcon` karty a `List/Apps.ts` jako jeden kompatibilitní celek.
3. Zabránit souběhu pollingu u obou driverů a zrychlit NG discovery.
4. Teprve potom provést bezpečné mechanické čištění závislostí, konfigurace a metadat.
5. Menší paralelizace a deduplikace dělat až s měřením nebo testem konkrétního chování.

## Nálezy s vysokou prioritou

### A1. AWTRIX 3 počítadlo chyb neměří po sobě jdoucí selhání a má posun o jednu chybu

**Důkaz:** `lib/awtrix3/Api/Api.ts:162-193`, `drivers/awtrixlight/device.ts:473-486`.

Při úspěšné odpovědi se `failsReset()` volá jen tehdy, když je zařízení už unavailable. Pokud je zařízení available, metoda se vrátí dříve. Jednotlivé chyby se proto mohou sčítat přes libovolný počet úspěšných requestů.

Současně se limit testuje před inkrementací. Při `failThreshold = 3` dojde k označení unavailable až při čtvrté chybě.

**Dopad:** zařízení může po delší době přejít do extended pollingu kvůli nesouvisejícím, ne po sobě jdoucím výpadkům. Pojmenovaný threshold navíc neodpovídá skutečnému počtu selhání.

**Doporučení:** nejprve přidat unit test stavového automatu `success/failure`, explicitně rozhodnout, zda threshold znamená `>= 3` po sobě jdoucí chyby, a teprve potom upravit pořadí resetu a inkrementace.

### A2. AWTRIX 3 zahazuje výsledek neúspěšných write operací

**Důkaz:** `lib/awtrix3/Api/Api.ts:135-146`, `drivers/awtrixlight/device.ts:177-180` a `drivers/awtrixlight/device.ts:386-427`.

AWTRIX 3 API vrstva vrací `boolean`, ale device command wrappery mají `Promise<void>` a výsledek zahodí. Flow listener proto může skončit úspěšně, i když HTTP operace vrátila chybu. Totéž platí pro `onSettings`: `setSettings()` se neawaituje a HTTP neúspěch je reprezentován jako `false`, nikoli rejected Promise, takže `.catch(this.error)` jej nezachytí.

**Dopad:** falešně úspěšné Flow akce a potvrzené nastavení, které se na zařízení nemuselo uložit.

**Doporučení:** zachovat stávající `Promise<void>` command rozhraní, ale při `false` vyhodit popsanou AWTRIX 3 chybu. Tím není nutné měnit shared driver interface. Změnu pokrýt testy Flow akcí, settings a dostupnosti, protože jde o pozorovatelnou změnu legacy chování.

### A3. AWTRIX 3 inicializace a refresh obsahují neočekávané fire-and-forget operace

**Důkaz:** `drivers/awtrixlight/device.ts:33-73`, `57-65`, `76-110`, `136-151`, `221-240`, `284-310`.

Konkrétně:

- `onInit()` neawaituje `initializeDevice()`.
- Poll callback neawaituje `refreshCapabilities()` ani `tryRediscover()`.
- `refreshAll()` spustí tři Promise bez awaitu a sama nevrací Promise.
- `initializeDevice()` ukončí critical režim a spustí poll dříve, než skončí `refreshAll()` a `connected()`.
- `refreshSettings()` neawaituje `setSettings()`.
- `onAdded()` nečeká na nastavení capability ani na upload ikon.

**Dopad:** Homey může považovat inicializaci, settings nebo onAdded hook za dokončený před skutečným dokončením práce. Chyby mohou přijít mimo lifecycle Promise a jednotlivé refresh cykly se mohou překrývat.

**Doporučení:** udělat lifecycle Promise explicitní. Nezávislé refresh operace lze spojit přes `Promise.all`, ale jen pokud test potvrdí zamýšlené chování dostupnosti a fail counteru. Upload ikon má mít omezenou konkurenci a souhrnně propagovat chybu.

### A4. AWTRIX 3 debug log může zveřejnit Basic Auth hlavičku

**Důkaz:** `lib/awtrix3/Api/Client.ts:136-148` vytváří `Authorization`; `lib/awtrix3/Api/Client.ts:175-184` loguje hlavičky beze změny.

NG transport ji naopak explicitně rediguje. U AWTRIX 3 se citlivá hodnota může objevit v debug logu při zapnutém `DEBUG=1`.

**Doporučení:** použít stejný princip redakce jako NG, bez sdílení samotných transportů. Doplnit test, že request obdrží skutečnou hlavičku, ale logger pouze `<redacted>`.

### A5. `applicationIcon` je manifestová Flow karta bez runtime listeneru a souvisí s neimplementovanou službou

**Důkaz:** `.homeycompose/flow/actions/applicationIcon.json:1-50` deklaruje kartu, ale jediné registrace AWTRIX 3 karet jsou v `drivers/awtrixlight/driver.ts:45-76`. `applicationIcon` se neregistruje v driveru ani v `app.ts`. `lib/awtrix3/List/Apps.ts:14-38` současně obsahuje jen metody vracející `[]`, `false` a `null` a není nikde importován.

Historie ukazuje, že karta i skeleton vznikly společně jako WIP. Karta je deprecated, ale mohla být publikována a objevit se v existujících uživatelských Flows.

**Dopad:** deklarovaná funkce nemá implementaci; skeleton navíc porušuje preferenci explicitních capability checks tím, že tiše vrací no-op hodnoty.

**Doporučení:** rozhodnout jako jeden celek:

1. buď kartu skutečně implementovat pro AWTRIX 3 a nahradit skeleton,
2. nebo zdokumentovat, že nikdy nebyla funkční, prověřit migrační dopad a odstranit kartu i skeleton.

Samotné smazání podle „neobsahuje importy“ není bezpečné kompatibilitní rozhodnutí.

### A6. Lifecycle driverů není testován jako runtime chování

206 testů dává velmi dobré pokrytí NG transformací, endpoint kontraktů a shared dispatchingu. Chybí ale runtime testy `AwtrixLightDevice`, `AwtrixNgDevice` a obou pairing driverů s fake Homey SDK. Několik existujících testů pouze čte zdrojový text a hledá v něm řetězce.

**Dopad:** všechny nálezy A1–A5 mohou projít současnou sadou testů.

**Doporučení:** před refaktorem vytvořit malý fake Homey harness pro lifecycle, timer host, capability writes, Flow registry a API klienta. Source-shape testy ponechat pouze tam, kde opravdu kontrolují Homey entrypoint nebo compose invariant.

## Nálezy se střední prioritou

### B1. AWTRIX NG discovery probuje zařízení sekvenčně

**Důkaz:** `drivers/awtrixng/driver.ts:449-465`. Každý discovery výsledek čeká na předchozí probe. HTTP timeout je 10 sekund.

**Dopad:** nejhorší doba otevření pairing seznamu je přibližně `počet kandidátů × timeout`. Jeden offline kandidát zdrží všechny následující.

**Doporučení:** nejprve odfiltrovat kandidáty synchronně a validní kandidáty probovat paralelně s malým limitem konkurence. Každý výsledek musí zachovat stávající explicitní stav `detected/auth-required/offline/rejected` a detaily NG chyby.

### B2. Poll implementace nejsou single-flight

**Důkaz:** `lib/awtrixng/Device/Poll.ts:22-30` předává async callback přímo do `setInterval`. AWTRIX 3 Poll používá stejný model. Interval nečeká na dokončení předchozího callbacku.

**Dopad:** pokud síť nebo Homey SDK operace přesáhne interval, vzniknou souběžné refresh cykly. U NG navíc rejection ze `setAvailable`, `setUnavailable` nebo capability write nemá explicitní scheduled-task error handler.

**Doporučené varianty:**

- rekurzivní `setTimeout` naplánovaný až po dokončení callbacku, nebo
- `running` guard s jasně logovaným skipem.

U NG se chyba nesmí catchnout a zahodit. Scheduled-task handler ji má zalogovat včetně detailů a podle explicitního pravidla promítnout do availability.

### B3. NG init a capability writes jsou zbytečně sekvenční

**Důkaz:** `drivers/awtrixng/device.ts:87-90` provádí tři nezávislé GET synchronizace za sebou. `drivers/awtrixng/device.ts:222-225` zapisuje capability hodnoty jednu po druhé.

**Dopad:** inicializace platí součet latencí `settings + display + apps`; každý poll platí sekvenční Homey SDK writes.

**Doporučení:** změřit init a poll na reálném Homey. Pokud operace nemají pořadovou závislost, použít `Promise.all`. U initu je nutné předem rozhodnout chybovou sémantiku: paralelizace spustí všechny tři requesty i tehdy, když jeden selže. `Promise.allSettled` by bylo přijatelné jen se souhrnnou propagací, ne s ignorováním NG chyb.

### B4. Upload bundled ikon blokuje event loop a je plně sekvenční

**Důkaz:** `drivers/awtrixng/device.ts:246-259` používá `readdirSync`, `statSync`, `readFileSync` a uploaduje soubory po jednom. AWTRIX 3 `onAdded()` kombinuje async `readdir`, sync `readFileSync` a nečeká na uploady.

**Dopad:** nízký za běžného provozu, protože jde o onAdded. Při pomalém zařízení ale pairing/add lifecycle trvá součet uploadů; AWTRIX 3 jej naopak ukončí ještě před dokončením.

**Doporučení:** sjednotit lifecycle sémantiku, použít Promise FS API a omezenou konkurenci. Neuploadovat „best effort“ bez explicitního výsledku.

### B5. NG pairing driver opakuje konstrukci klienta a mapování probe výsledků

**Důkaz:** `drivers/awtrixng/driver.ts:288-328`, `339-397` a `487-526`.

Tři cesty znovu skládají transport/client a dvě cesty mají prakticky stejné větvení `detected/auth-required/rejected/offline`.

**Dopad:** při rozšíření chybového kontraktu hrozí, že jedna pairing cesta přestane zachovávat stejné detaily jako ostatní.

**Doporučení:** vytáhnout malou factory klienta a čistý mapper probe výsledku. Nesjednocovat discovery, credentials a manual pairing do jednoho implicitního workflow; jejich vstupy a UX zůstávají explicitní.

### B6. Icon cache dovoluje duplicitní souběžné GET requesty

**Důkaz:** `lib/awtrixng/Services/Icons.ts:94-109`. Pokud dvě autocomplete volání přijdou před dokončením prvního `loadIcons()`, obě vidí prázdný seznam a provedou GET.

**Doporučení:** cacheovat také in-flight Promise a po rejection jej vyčistit. Stejný vzor lze následně použít pro AWTRIX 3 Icons. Chybu neukládat jako prázdný seznam.

## Bezpečné kandidáty na čištění

### C1. Nepoužité přímé závislosti

`mime-types` ani `@types/mime-types` nejsou importovány v runtime, testech ani nástrojovém kódu (`package.json:16,28`).

**Doporučení:** odstranit oba přímé záznamy a regenerovat lockfile. `mime-types` může zůstat tranzitivní závislostí `form-data`, takže nelze bez měření slibovat zmenšení balíčku; přínos je hlavně přesnější manifest.

### C2. Produkčně nepoužité wrappery a helpery

Ověřené kandidáty:

- `Api.isAvaible()` – pouze definice, navíc překlep v názvu.
- `AwtrixLightDevice.cmdReboot()` – pouze definice; `onSettings` volá `api.reboot()` přímo.
- `AwtrixLightDevice.cmdSetSettings()` – pouze definice; `onSettings` volá `api.setSettings()` přímo.
- `AwtrixNgDevice.refreshAvailability()` – pouze definice; poll volá `refreshDeviceState()` přímo.
- `toAwtrixNgRtttlPayload()` – v produkci se nepoužívá, protože payload skládá `AwtrixNgClient.playRtttl()`; helper používají jen testy.
- `createAwtrixNgAppsOrderPayloadFromBuiltinSettingsChange()` – v produkci se nepoužívá; apply helper provádí guard samostatně.

**Doporučení:** před odstraněním zkontrolovat, zda nejsou zamýšleným externím/testovacím API. Potom buď zapojit jednu kanonickou cestu, nebo odstranit funkci i testy, které testují pouze nepoužívaný helper.

`fromAwtrixNgHomeyPushedAppName()` je dnes také test-only, ale je logickým protějškem zapisovací transformace a může být potřeba pro budoucí listing. Je proto nižší priorita a není doporučeno jej mazat bez rozhodnutí o budoucím app managementu.

### C3. Nevyužitá TypeScript konfigurace

`tsconfig.json:4-10` povoluje JS a definuje aliasy `drivers/*` a `lib/*`, ale runtime TypeScript používá relativní importy a testy jsou z kompilace vyloučeny.

**Doporučení:** odstranit `allowJs`, `baseUrl` a `paths`, pokud se neplánuje migrace na aliasy. Alternativně aliasy skutečně standardizovat, ale jen pokud Homey build i runtime resoluce budou mít odpovídající konfiguraci. Samotná čístečná migrace nepřináší hodnotu.

### C4. Prázdné AWTRIX 3 pairing handlery a vypnutá větev

`drivers/awtrixlight/driver.ts:35,103-136` obsahuje konstantně vypnuté manual add a handlery `list_devices_selection`, `get_device`, `add_device`, které jen logují vstup a nic nevracejí.

**Doporučení:** ověřit proti skutečnému Homey pairing runtime, zda jsou pro použitý `list_devices -> add_devices` template vůbec volány. Pokud ne, odstranit je. Pokud se má manual pairing vrátit, implementovat jej jako explicitní větev podobně jako NG, ne konstantou a prázdnými callbacks.

## Projektové nekonzistence

### D1. Verze jsou rozjeté ve třech zdrojích

- `.homeycompose/app.json`: `2.0.1`
- `package.json`: `2.0.0`
- root záznam `package-lock.json`: `1.0.2`

Homey manifest je distribuční zdroj pravdy, ale nekonzistence komplikuje release automatizaci a diagnostiku.

**Doporučení:** zvolit jeden release příkaz, který synchronizuje Homey manifest, package metadata a lockfile, a přidat levný CI test konzistence.

### D2. Manifest odkazuje na dva chybějící `xlarge` obrázky

Chybí:

- `assets/images/xlarge.png`, na který odkazuje `.homeycompose/app.json:25`,
- `drivers/awtrixlight/assets/images/xlarge.png`, na který odkazuje `drivers/awtrixlight/driver.compose.json:73`.

NG driver svůj `xlarge.png` má. `homey app validate` tuto nekonzistenci neodhalil a oba soubory chyběly i ve vygenerované `.homeybuild`.

**Dopad:** není potvrzeno zařízením ani Homey Storem; jde o explicitně označený předpoklad. Odkaz na neexistující asset může způsobit chybějící obrázek v některém klientu nebo release kroku.

**Doporučení:** buď dodat správné assety, nebo odstranit nepodporovanou velikost z manifestu podle aktuálních Homey požadavků. Přidat test existence všech lokálních cest z manifestu.

### D3. README popisuje neaktuální Flow model

`README.md:13` tvrdí, že NG používá samostatné `awtrixng*` Flow karty. Aktuální implementace používá pro podporovaný subset shared karty a explicitní device-type dispatch; jen některé funkce jsou NG-only.

**Doporučení:** sladit README s `docs/awtrix-ng/06-user-maintainer-guide.md`. Jde o dokumentační opravu, nikoli důvod měnit fungující shared Flow architekturu.

## Duplicity, které nyní neodstraňovat

### Oddělené AWTRIX 3 a AWTRIX NG transporty a payloady

Je správné, že nejsou sloučeny podle podobných endpoint names. NG má jiné endpointy, error envelope a whole-payload validaci. Sdílet lze malé technické utility, ne API sémantiku.

### Shared Flow dispatcher

`drivers/shared-flow-actions.ts` je dlouhý, ale explicitně rozděluje AWTRIX 3 a AWTRIX NG a vyhazuje chybu pro nepodporovaný device type. To odpovídá projektovým pravidlům. Převod na dynamické duck typing/no-op metody by byl regresí.

Smysl má jen lokální deduplikace opakovaných guardů nebo typů, pokud zůstane explicitní capability check a nezmění se shared interface bez zdokumentovaného důvodu.

### API typy a dokumentované, zatím runtime-nepoužité NG endpointy

`getVersion()`, `getCapabilities()` a `reboot()` dnes volají jen kontraktové testy. Nejsou ale automaticky zbytečné: jsou malou a explicitní součástí dokumentovaného NG klienta. Jejich odstranění má být rozhodnutí o rozsahu API klienta, ne slepý výsledek dead-code nástroje.

### Duplicitní driver assets

Oba drivery obsahují shodnou sadu přibližně 52 KiB bundled ikon a shodné small/large obrázky. Runtime cesty jsou však driver-specific. Zdrojovou duplicitu lze odstranit jen pomocí spolehlivého build/copy kroku, který vytvoří oba výsledné adresáře. Kvůli malé velikosti není vhodné zavádět build složitost bez dalšího důvodu.

## Navržené balíčky práce pro další fázi

### Balíček 1: AWTRIX 3 reliability baseline

- fake Homey lifecycle testy,
- test fail counteru včetně resetu a threshold boundary,
- propagace write chyb přes stávající `Promise<void>` command API,
- await lifecycle operací,
- redakce credentials v debug logu.

### Balíček 2: Flow a nedokončené funkce

- inventura manifest karta ↔ runtime listener,
- rozhodnutí `applicationIcon` + `List/Apps.ts`,
- ověření deprecated karet proti kompatibilitní politice,
- test, že každá deklarovaná karta má právě jednu runtime registraci, pokud není explicitně označená jako manifest-only.

### Balíček 3: Polling a pairing performance

- single-flight Poll pro oba drivery,
- bounded parallel NG discovery,
- měření a případná paralelizace NG init/capability writes,
- in-flight icon cache.

### Balíček 4: Mechanická údržba

- odstranit ověřené nepoužité závislosti a wrappery,
- synchronizovat verze a lockfile,
- opravit manifest assets,
- zjednodušit `tsconfig`,
- aktualizovat README,
- přidat CI kontroly pro verze, asset paths a Flow registrace.

## Shrnutí

Největší přínos nepřinese mikrooptimalizace transformerů, ale zpřesnění asynchronního a chybového kontraktu AWTRIX 3, doplnění lifecycle testů a odstranění nedokončeného Flow/App skeletonu na základě explicitního kompatibilitního rozhodnutí. U AWTRIX NG je architektura chyb a payloadů podstatně přísnější; největší rezervou je latence sekvenčního discovery/init a absence single-flight pollingu.
