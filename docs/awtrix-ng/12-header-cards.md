# Karty s nadpisem a textem

Soukromá testovací verze **2.3.4**, úprava z 5. října 2026. Karty jsou přednastaveným rozvržením pro TC002 **52 × 16**. Vlastní RAW layout zůstává dostupný i pro **32 × 8**; tento přednastavený obsah se na menší panel nesmršťuje.

## Karty a zachování existujících Flow

- **Zobrazit notifikaci s nadpisem a textem** — ID `awtrixng_notification_header`.
- **Vytvořit nebo aktualizovat aplikaci s nadpisem a textem** — ID `awtrixng_application_header`.

ID a původní argumenty `icon`, `header`, `text`, `name` i Homey Add duration zůstávají. Nové argumenty `color` a `options` jsou volitelné: uložené Flow bez nich dostává původní modrou `#00AAFF` a prázdné JSON volby. Aplikační karta aplikaci vytváří/aktualizuje v rotaci, nepřepíná ji okamžitě na obrazovku. Název se zadává bez `homey-`, stejně jako u běžných pushed app karet.

`color` je **barva nadpisu**, z barevného výběru Homey nebo tagu `#RRGGBB`. Černá `#000000` je platná; neplatná nebo prázdná explicitní barva vyvolá chybu. Bílé tělo a ostatní vzhled tvoří pevný preset. Pro jiný font, barvu těla, pozadí nebo vlastní rozvržení slouží RAW, nikoli skryté přepisování tohoto presetu.

## Rozvržení

| Region | S ikonou | Bez ikony | Vzhled |
|---|---|---|---|
| Ikona | `[0,0,16,16]` | Vynechán | Volitelná ikona, bez automatického zvětšování. |
| Nadpis | `[17,0,35,8]` | `[0,0,52,8]` | `small`, zvolená barva, vodorovně uprostřed. |
| Text | `[17,8,35,8]` | `[0,8,52,8]` | `small`, bílá, vodorovně od začátku. |

Řádky jsou svisle uprostřed svých regionů. Každý má vlastní loop scroll; `whenFits: static` výslovně zajišťuje, že text, který se vejde, neroluje ani při opačném globálním nastavení hodin. Rychlost, směr, počáteční pozice, mezera a pauza dále respektují nastavení hodin. Prázdný řádek je platný a jeho region nezmění geometrii druhého řádku. Symbol `-` z autocomplete odstraní ikonu stejně jako vynechaný argument.

Nevolíme automaticky jiný font a obraz se nepřepočítává na jiné rozlišení. Zachované region IDs `icon`, `header`, `text` umožňují firmwaru aktualizovat rozvržení včetně scrollu. Aktuální capabilities kontrolují fonty, hranice regionů, limity textu/scrollerů/assets i URL ikon; paměť a dekódování ikony zůstávají kontroly firmwaru. Nativní chyby se zachovávají.

## JSON options

JSON options musí být objekt. Prázdné pole a `{}` jsou bez dalších voleb. Povolená pole:

| Obě karty | Jen notifikace | Jen aplikace |
|---|---|---|
| `durationMs`, `repeat` | `name`, `hold`, `stack`, `wakeup`, `sound`, `soundRtttl`, `soundLoop` | `lifetimeMs`, `lifetimeExpiry` |

Každé jiné pole je před HTTP požadavkem výslovně odmítnuto, včetně `layout`, `regions`, `text`, `icon`, `icons`, `color`, `textColor`, `font`, `scroll`, `textAlign`, `textCase`, `backgroundColor`, `effect`, `overlay`, `palette`, grafů a `draw`. Ani totožná nebo `null` hodnota se tiše neignoruje. Notifikace nepřijímá životnost aplikace; aplikace nepřijímá `name`/`hold`/`sound` z options.

Držená pojmenovaná notifikace, kterou lze později zrušit její vlastní kartou:

```json
{"name":"window-open","hold":true,"stack":false,"wakeup":true}
```

Notifikace s hlasovou zprávou, pokud ji hodiny podporují:

```json
{"durationMs":10000,"sound":{"speech":"The window is open."}}
```

Aktualizace aplikace s životností:

```json
{"durationMs":8000,"lifetimeMs":300000,"lifetimeExpiry":"mark"}
```

## Doba a opakování

- Bez Add duration, JSON `durationMs` a JSON `repeat` posíláme `repeat: 1`: každý pohybující se řádek projede jednou. Text, který stojí, používá výchozí dobu hodin.
- Explicitní Add duration pošle dobu v milisekundách bez automatického `repeat`. Původní chování uložených Flow zůstává.
- JSON `durationMs` je celé číslo milisekund, `0` nebo záporná hodnota používá dokumentovanou výchozí dobu hodin. Zároveň se nepřidává automatické `repeat: 1`.
- Add duration a JSON `durationMs` nesmí být zadané zároveň; jde o chybu místo tichého přepsání.
- JSON `repeat` je nezáporné celé číslo. `repeat: 0` zůstává nula a vypne čekání na počet projetí. Pokud uživatel zadá zároveň `repeat` a dobu, obě hodnoty se zachovají podle nativního kontraktu firmwaru: explicitní doba je minimální čas.
- `hold: true` drží notifikaci dle firmwaru, nezávisle na době. Globální scroll `speed: 0` nikdy nedokončí průjezd; použijte explicitní dobu nebo obnovte rychlost, pokud nechcete držet obsah neomezeně.

## Ověření

Automaticky prošlo **528/528 testů**, TypeScript, ESLint a Homey validace `publish`. Testy zahrnují předání nových argumentů i původní uložené Flow bez nich, oba cílové endpointy, výchozí/černou barvu, geometrii, statické krátké řádky, přesné konflikty, nulu v repeat, JSON časování, typy, životnost aplikace, podporu zvuku a chyby před zápisem. Regrese RAW na 32 × 8 a 52 × 16 zůstává v sadě.

**Aktualizace 6. října 2026:** základní živé Homey/TC002 QA prošlo, včetně pixelové kontroly krátkých/prázdných řádků, barvy, nezávislého scrollu, obou velikostí GIF, aplikace s životností a Homey Add duration. Zbývá migrace dříve uložených Flow, barevný výběr v UI, dlouhé oba řádky, přesné šířkové hranice 35/52 px, nulová rychlost scrollu a další kombinace doby/opakování. Podrobnosti a framebufferové náhledy jsou v [QA protokolu](13-live-qa-2026-10-06.md). Fyzické LED nebyly fotografovány; nepodporované znaky/emoji vykresluje firmware dle vlastního fontu.

Primární podklady: [layouts](https://ang.blueforcer.de/guides/layouts/) — geometrie a rozdělení vizuálních/provozních polí; [TC002 payload](https://ang.blueforcer.de/tc002/reference/payload/) — časování, scroll a sound. Dokumentace a živý rendering jsou oddělené zdroje pravdy.
