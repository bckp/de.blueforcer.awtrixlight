# TC002 1.2.0 — příprava testovací aplikace 2.3.1

Kontrola dokumentace: **5. října 2026**. Primárním podkladem je aktuální dokumentace Blueforceru; dostupnost nebo stáří veřejných zdrojáků její kontrakt nepřebíjí. Pro rozlišení API starších zařízení ponecháváme již ověřené starší kontrakty.

Tento soubor popisuje lokální soukromou větev `codex/tc002-development`. Nejde o vydání do Homey Store ani o potvrzení testu s fyzickými hodinami na firmwaru 1.2.0.

## Co vydal Blueforcer

[Release 1.2.0](https://ang.blueforcer.de/tc002/releases/1.2.0/) je datovaný **4. října 2026** a označený jako první finální release pro **TC002, 52 × 16 pixelů**. Dokumentace nově odděluje [TC002](https://ang.blueforcer.de/tc002/), [ESP32 / TC001](https://ang.blueforcer.de/esp32/) a [ESP32-S3](https://ang.blueforcer.de/esp32s3/).

Změny přímo od [TC002 bety 1.1.7](https://ang.blueforcer.de/tc002/releases/tc002-1.1.7/):

- Opravené progresivní JPEG obrázky z internetu.
- Rádio zvládá neobvyklé HTTP hlavičky některých stanic.
- Opravené předběžné browserové HTTP požadavky pro Hub; obnovení zálohy ze setup hotspotu.
- Dva telefony mohou současně ovládat hry jako dva gamepady.
- Berry `import pow` nahrazuje modul `crypto` a metody `mine`, `mine_stop`, `mine_rate`, `mine_best`.
- `sensor.sound_level()` nahrazuje `music.level()`.

Beta 1.1.7 už přidala **textAlign**, OAuth pro scripty, `on_knob(event)` a `rotation.close()`. Změny MQTT a Home Assistantu nejsou součástí této přípravy.

Další novinky prvního finálního vydání (audio, speech, URL obrázky, layouty, BLE/TCP a další scriptové moduly) nejsou všechny změny oproti naší předchozí betě. Audio, mixer, rádio, clip a layouty v lokální Homey větvi již byly implementované. Opravy JPEG/radia jsou změny firmwaru; nevyžadují nový formát našich požadavků.

Hub nyní vybírá variantu scriptu pro velikost panelu a instaluje závislosti i zvuky. Správu instalace ponecháváme Hubu / webovému rozhraní hodin. Homey nově umí vybrat již nainstalovaný script.

## Změny připravené v aplikaci

| Oblast | Stav / chování aplikace 2.3.1 |
|---|---|
| AWTRIX 3 | Samostatný driver zachován; nemění se jeho payloady ani Flow. |
| TC001 / TC002 | Nadále různé panely; TC002 musí hlásit 52 × 16. Layout a audio se řídí capabilities. |
| Zarovnání | JSON přijímá `textAlign: start/center/end`; vyžaduje firmware 1.1.7+. Staré `textCenter` se na novém firmwaru převádí explicitně; na starém zůstává. Kombinace obou polí je chyba. |
| Ikony | `icons` a `iconGap` fungují od 1.1.2; do lokální větve přenesena podstata veřejné opravy, zachovány nové TC002 možnosti. Chybné hodnoty hlásí `invalid-value` a přesné pole. |
| Automatický jas | TC002 ho nepodporuje. Při změně se kontrolují capabilities a nepoužitelná volba je odmítnuta před první změnou hodin. Starší zařízení bez `sensors.light` ponechávají dosavadní chování; chybějící flag není potvrzení senzoru. |
| Scripty | Nová NG Flow karta „Zobrazit nainstalovaný skript“. Načítá pouze stav zařízení a inventář aplikací, nikoli zdrojáky, nastavení nebo OAuth údaje. |
| Výběr scriptu | Nabízí zapnuté scripty bez chyby a s odpovídajícím panelem, včetně `ondemand`. Moduly, skripty na pozadí a neexistující položky se nenabízejí. Před spuštěním se stav znovu ověří. |
| Spuštění | Dokumentované `PUT /api/v1/apps/active` s `{name, fast: true}`, bez prefixu `homey-`. Další/předchozí aplikace ukončí on-demand script podle firmwaru. HTTP chyby se předávají do Flow s původním statusem, kódem, zprávou a polem. |
| Audio | Dosavadní sound objekty/listy, speech, song, URL MP3, clip a rádio zachovány. Stále se kontroluje dostupnost konkrétního zdroje v capabilities. |

### Omezení ověření a předpoklady

- Hranice `textAlign` 1.1.7 vychází z TC002 release notes. Současné ESP32 payload docs už pole uvádějí také, ale neuvádějí jeho první verzi. Aplikace pro něj konzervativně používá stejnou verzi 1.1.7; funkčnost na jiném novém ESP32 buildu zatím není hardwarově ověřena. Na ověřeném starším 1.1.2 zůstává `textCenter`.
- Ověření nového kontraktu běží se syntetickým transportem, včetně odmítnutých požadavků a zachování HTTP chyb. Tento test sám nepotvrzuje rendering, audio nebo chování fyzického knobu.
- Správa / upload / mazání scriptů, změny jejich konfigurace a dat, OAuth, mikrofon, BLE a TCP nejsou nové Homey karty. Script si tyto funkce může sám poskytovat na hodinách. Není to překážka ovládání a notifikací v první testovací verzi.
- Automatický jas zůstává ve statickém Homey nastavení společného NG driveru, s vysvětlením omezení pro TC002; u TC002 jej nelze uložit jako podporovanou funkci.

## Co ještě ověřit na Homey před finálním vydáním

Lokální automatické ověření sestavy 2.3.1: **502/502 testů**, ESLint bez chyb, TypeScript build a Homey validace na úrovni `publish` úspěšné. Validace nic nevydává do Store. Regresní sada zahrnuje také AWTRIX 3 a starší NG kontrakty.

1. Instalovat soukromou testovací aplikaci 2.3.1 na Homey a ověřit nové i již spárované TC002 na 1.2.0. Zkontrolovat přidání markerů audio/layout a obnovení nastavení po změně firmwaru.
2. Notifikace a pushed app: `textAlign` start/center/end, legacy `textCenter`, statický i scrollující text, obyčejná ikona a `icons`, nula v `iconGap`, barevné fragmenty a 52 × 16 layout.
3. MP3 z URL / Soundboard, dokončení a stop, RTTTL/song, speech přes JSON, clip, rádio a zachování stanice po restartu. Jde o reálný zvuk, ne pouze úspěšné HTTP.
4. Nová scriptová Flow karta: autocomplete, start on-demand scriptu, ukončení přes další/předchozí aplikaci, vypnuté scripting a script odstraněný po uložení Flow.
5. Tlačítka a knob callback do Homey; scriptové `on_knob` může událost převzít, viz dokumentace firmwaru. Při testu scripty, které knob přebírají, zkoušet zvlášť.
6. Regrese: TC001 NG na starším dostupném firmwaru a samostatné zařízení AWTRIX 3, běžné Flow a uložené ikony. Ověřit chování existujících built-in přepínačů podle skutečného inventáře (`Time` a `Status` v nových docs).

## Podklady

- [TC002 HTTP API](https://ang.blueforcer.de/tc002/reference/http/) — inventář, `apps/active`, audio, scriptové endpointy.
- [TC002 payload](https://ang.blueforcer.de/tc002/reference/payload/) — `textAlign`, `iconGap`, `icons`, sound.
- [TC002 device/capabilities](https://ang.blueforcer.de/tc002/reference/device/) — panel a chybějící světelný senzor.
- [TC002 settings](https://ang.blueforcer.de/tc002/reference/settings/) — automatický jas lze v API uložit, ale nemá účinek.
- [TC002 limits](https://ang.blueforcer.de/tc002/reference/limits/) a [errors](https://ang.blueforcer.de/tc002/reference/errors/) — limity a chybové kontrakty.

Datum dokumentace neznamená, že byl firmware právě nainstalován nebo že proběhla aktualizace fyzických hodin. Publikování této soukromé větve není součástí přípravy testovací sestavy.
