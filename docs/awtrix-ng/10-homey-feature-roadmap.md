# Homey NG — schválené funkce a odložená práce

Rozhodnutí majitele, 5. října 2026. Každá implementovaná funkce má samostatný lokální commit a automatické testy. Soukromá TC002 větev se nepublikuje na veřejný Git server. Při zablokování jedné funkce se její rozpracování uloží do oddělené lokální větve a pokračuje se další funkcí.

## Hotovo v soukromé testovací verzi 2.3.2

- **Jas:** standardní Homey ovladač `dim`, Flow karta s procenty a synchronizace skutečné hodnoty z hodin. Rozsah 0–100 % se převádí na 0–255; nula je platná. Ruční nastavení vypne automatický jas tam, kde řídí panel, a nemění napájení displeje. TC002 nedostává neúčinnou senzorovou volbu. Starší firmware bez senzorového flagu se při aktivním automatickém režimu přepne na ruční jas. Homey nastavení se aktualizuje z odpovědi hodin.
- **Nastavení obrazu:** sytost 0–100, kladná gamma, barevná korekce a tint v nastavení NG zařízení. Barvy přijímají `#RRGGBB`; prázdné pole korekci vypne. Černá `#000000` je platná barva. Podpora se ověřuje z aktuálního nastavení zařízení před prvním zápisem; chybějící pole není předstíraná podporovaná funkce.
- **Scripty:** nastavování jejich deklarovaných voleb, čtení a změna uložených dat a čtení sdílených hodnot. Spuštění nainstalovaného scriptu je již v 2.3.1. Změna nastavení/dat restartuje script; také odpověď HTTP 200 s `error` musí být nahlášena jako selhání běhu scriptu, nikoli ignorována.
- **Notifikace:** zrušení konkrétní notifikace podle názvu, i ve frontě; aktivní notifikace má nadále samostatnou kartu.

## Použití nových Flow karet

| Karta | Vstup / výstup |
|---|---|
| Nastavit jas | Procenta 0–100; synchronizace standardního Homey ovladače. |
| Nastavit volbu skriptu | Vybrat nainstalovaný skript a deklarovanou volbu. Text/výběr přímo, číslo jako číslo, boolean `true`/`false`, barva `#RRGGBB` nebo celé číslo 0–16777215. |
| Načíst volbu skriptu | Aktuální volba → textový token **Hodnota** v Advanced Flow. |
| Změnit uložená data skriptu | Neprázdný JSON objekt, např. `{"counter":0,"old":null}`. Mění jen uvedené klíče, `null` klíč odstraňuje. Deklarované volby patří do samostatné karty. |
| Načíst uloženou hodnotu skriptu | Vybrat skript a existující klíč → token **Hodnota**. |
| Načíst sdílenou hodnotu skriptu | Vybrat `owner.key` → token **Hodnota**. Pouze čtení, bez emulace sdíleného úložiště v Homey. |
| Zrušit pojmenovanou notifikaci | Přesný název z jejího JSON `name`. `active` patří do původní karty pro aktivní notifikaci. Nenalezená notifikace hlásí nativní 404, bez náhradního zrušení aktivní. |

Token vrací řetězec přímo; čísla, booleany, `null`, pole a objekty mají podobu JSON. Nula, `false` a prázdný text se zachovají. Chybějící klíč způsobí chybu, nevytváří náhradní hodnotu.

Konfigurace používá čerstvé schéma při každém spuštění Flow. Homey odmítá čísla mimo deklarované hranice před zápisem, přestože firmware je podle dokumentace umí oříznout. To je vědomá přísnější validace; žádná hodnota se v aplikaci tiše neupravuje. `maxlen` textu vyhodnocujeme v bajtech UTF-8: živý test TC002 1.2.0 dne 6. října 2026 ukázal, že `Žluť🐱` (5 znaků, 10 bajtů) při `maxlen: 8` firmware odmítá, zatímco `Ž🐱` (6 bajtů) přijímá. Původní předpoklad limitu v Unicode znacích byl tímto opraven; veřejná dokumentace jednotku `maxlen` výslovně neurčuje.

Konfigurovat lze také vypnuté, chybující nebo headless skripty; jsou užitečné pro obnovu či nastavení. Karta pro **zobrazení** dál vyžaduje zobrazitelný funkční skript. Moduly/built-in aplikace mají jiný význam a zatím se těmito kartami nespravují. Zdrojáky, OAuth ani instalace skriptů nejsou součástí těchto funkcí; instalace zůstává Hubu/webu hodin.

## Ověření a další test na zařízení

Automaticky: **518/518 testů**, TypeScript a ESLint bez chyb, Homey validace `publish` úspěšná. Funkce mají čtyři samostatné lokální commity bez podpisu. Žádná funkce nezůstala blokovaná ani odložená do rozpracované větve.

Před vydáním do Store ručně ověřit:

1. Migraci již spárovaného NG zařízení: objeví se ovladač jasu; polling odráží jas změněný ve webu. Jas 0/50/100 %, automatický jas TC001 a TC002 bez LDR.
2. Uložení a opětovné načtení sytosti/gammy/korekce/tintu; vizuálně ověřit černou a vypnutí prázdným polem. U staršího firmwaru ověřit explicitní odmítnutí nepodporovaného pole.
3. Skript s deklaracemi bool/text/number/slider/select/color: autocomplete, zápis, restart a tokeny v Advanced Flow. Ověřit nulu, `false`, emoji a chybu init/setup. Změna nastavení/dat může být uložená i při chybě restartu; Flow to výslovně hlásí.
4. Částečné změny dat, odstranění přes `null`, zaniklý klíč nebo sdílená hodnota po restartu. Vypnuté scripting, zaneprázdněný script a změněné schéma musí vrátit chybu.
5. Pošlete pojmenovanou čekající notifikaci za jinou aktivní. Zrušte čekající podle jména a ověřte zachování aktivní; opakování musí ohlásit 404. Původní aktivní karta zůstává funkční.
6. Běžné Flow, notifikace, ikony a ovládání původního AWTRIX 3 i staršího NG.

## TODO — společně navrhnout a důkladně otestovat

- [ ] **Ciferníky TC002:** nabídka podporovaných tváří podle capabilities, barvy, formát času/data a animace. Jde o dlouhodobé nastavení, proto není prioritou pro první test.
- [x] **Stavové Flow:** implementované čtyři spouštěče, jejich skutečné doručení přes Homey ověřeno 6. října. Polling, výchozí stav, odpojování a deduplikace jsou popsané v [11-state-flows.md](11-state-flows.md); zbývající restartové a síťové zkoušky v [živém QA](13-live-qa-2026-10-06.md).
- [ ] **Layouty a nadpis + text:** revize implementovaná, základní živé 52 × 16 QA prošlo včetně prázdných řádků, nezávislého scrollu, 8/16px GIFů, doby a životnosti aplikace. Dokončit zbývající šířkové/fontové a migrační případy a živý RAW na 32 × 8 dle [protokolu](13-live-qa-2026-10-06.md).

Upřesnění majitele bylo implementované v soukromé **2.3.4**: zachovaná RAW podpora, přejmenované karty nadpis + text se stejnými ID, **color = barva nadpisu**, **JSON options** s explicitním odmítnutím kreslicích polí. Krátké řádky jsou statické, dlouhé rolují nezávisle. Kompatibilita původních argumentů a nové varianty jsou v testech i základním živém QA; migrace dříve uložených Flow ještě zbývá. Podrobnosti a příklady jsou v [12-header-cards.md](12-header-cards.md).

## Záměrně neimplementovat

**Moodlight:** majitel funkci výslovně odmítl kvůli obavám z přehřívání zařízení. Nepřidávat ovladač, Flow ani zapisovací endpoint moodlightu. Čtení stavu displeje může jeho existující stav obsahovat.

## Podklady

- [TC002 settings](https://ang.blueforcer.de/tc002/reference/settings/) a [ESP32 settings](https://ang.blueforcer.de/esp32/reference/settings/): rozsahy obrazu a chování ručního jasu při automatickém řízení.
- [TC002 HTTP API](https://ang.blueforcer.de/tc002/reference/http/): nastavení/data scriptů, sdílené hodnoty a pojmenované notifikace.

Původní implementační ověření bylo syntetické. Následné živé testy 6. října 2026, jejich úklid, oprava UTF-8 maxlen a aktuálních **532/532** testů jsou popsány v [QA protokolu](13-live-qa-2026-10-06.md). Framebuffer nenahrazuje kontrolu fyzických LED a zvuku.
