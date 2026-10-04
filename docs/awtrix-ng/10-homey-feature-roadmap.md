# Homey NG — schválené funkce a odložená práce

Rozhodnutí majitele, 5. října 2026. Každá implementovaná funkce má samostatný lokální commit a automatické testy. Soukromá TC002 větev se nepublikuje na veřejný Git server. Při zablokování jedné funkce se její rozpracování uloží do oddělené lokální větve a pokračuje se další funkcí.

## Teď

- **Jas:** standardní Homey ovladač `dim`, Flow karta s procenty a synchronizace skutečné hodnoty z hodin. Rozsah 0–100 % se převádí na 0–255; nula je platná. Ruční nastavení vypne automatický jas tam, kde řídí panel, a nemění napájení displeje. TC002 nedostává neúčinnou senzorovou volbu. Starší firmware bez senzorového flagu se při aktivním automatickém režimu přepne na ruční jas. Homey nastavení se aktualizuje z odpovědi hodin.
- **Nastavení obrazu:** sytost, gamma, barevná korekce a tint do nastavení NG zařízení.
- **Scripty:** nastavování jejich deklarovaných voleb, čtení a změna uložených dat a čtení sdílených hodnot. Spuštění nainstalovaného scriptu je již v 2.3.1. Změna nastavení/dat restartuje script; také odpověď HTTP 200 s `error` musí být nahlášena jako selhání běhu scriptu, nikoli ignorována.
- **Notifikace:** zrušení konkrétní notifikace podle názvu, i ve frontě; aktivní notifikace má nadále samostatnou kartu.

## TODO — společně navrhnout a důkladně otestovat

- [ ] **Ciferníky TC002:** nabídka podporovaných tváří podle capabilities, barvy, formát času/data a animace. Jde o dlouhodobé nastavení, proto není prioritou pro první test.
- [ ] **Stavové Flow:** změna aktivní aplikace, stav audio/radia a chyba přehrávání. Vyřešit polling, první načtení versus změnu, odpojování a deduplikaci událostí.
- [ ] **Layouty a nadpis + text:** kompletní revize současného návrhu. Ověřit 32 × 8 a 52 × 16, fonty/ascent/descent, hranice regionů a rozpočty, clipping ikon, nezávislé scrollery, dobu zobrazení, dlouhé/krátké/prázdné texty a skutečný výstup na zařízení. Současný prototyp nepovažovat za hotový finální návrh.

## Záměrně neimplementovat

**Moodlight:** majitel funkci výslovně odmítl kvůli obavám z přehřívání zařízení. Nepřidávat ovladač, Flow ani zapisovací endpoint moodlightu. Čtení stavu displeje může jeho existující stav obsahovat.

## Podklady

- [TC002 settings](https://ang.blueforcer.de/tc002/reference/settings/) a [ESP32 settings](https://ang.blueforcer.de/esp32/reference/settings/): rozsahy obrazu a chování ručního jasu při automatickém řízení.
- [TC002 HTTP API](https://ang.blueforcer.de/tc002/reference/http/): nastavení/data scriptů, sdílené hodnoty a pojmenované notifikace.

Automatické ověření nenahrazuje test na fyzickém zařízení a v nainstalované Homey aplikaci. Nové funkce v této práci nejsou na živé hodiny zapisovány.
