# Stavové Flow AWTRIX NG

Implementace z 5. října 2026, soukromá TC002 větev, testovací verze **2.3.3**. AWTRIX 3 a jeho Flow se nemění. Primárním kontraktem jsou aktuální [device docs](https://ang.blueforcer.de/tc002/reference/device/) a [HTTP/audio docs](https://ang.blueforcer.de/tc002/reference/http/), nikoli veřejné zdrojáky firmwaru.

## Nové spouštěče

| Karta | Kdy se spustí | Tokeny |
|---|---|---|
| **Aktivní aplikace se změnila** | Změní se `currentApp` z `/api/v1/device`. | `application`, `previous`: text. |
| **Přehrávání zvuku se změnilo** | Změní se `playing` nebo poslední `name` ve skupině `alert` či `app`. | `group`, `name`, `previous_name`: text; `playing`, `previous_playing`: boolean. |
| **Přehrávání rádia se změnilo** | Změní se přehrávání, stanice nebo metadata skladby. | `station`, `title`, `previous_station`: text; `playing`, `previous_playing`: boolean. |
| **Byla zjištěna nová chyba přehrávání** | Nový neprázdný `error` v podporované skupině `alert`, `app` nebo `radio`. | `group`, `error`: text. |

Názvy aplikací jsou přesně podle firmwaru, včetně prefixu `homey-` u našich pushed apps. Prázdná aplikace znamená prázdnou rotaci. Notifikace `currentApp` nemění a během přechodu firmware stále hlásí odcházející aplikaci. Název zvuku je poslední přehrávaná hodnota, takže může zůstat vyplněný i po zastavení. Pro běh zvuku rozhoduje boolean `playing`.

Rádio má samostatnou kartu; obecná karta zvuku sleduje pouze `alert` a `app`. Error karta zahrne rádio jen tehdy, pokud je skutečně podporované. Hlásí chybu uloženou firmwarem, nikoli výpadek HTTP transportu. Chyba transportu se zachováním statusu/kódu/zprávy/pole jde do diagnostiky a resetuje výchozí stav pozorování.

## Pozorování a životní cyklus

- Homey kontroluje každých **5 sekund**, zda má konkrétní zařízení uloženou alespoň jednu z těchto Flow karet, přes SDK `FlowCardTriggerDevice.getArgumentValues(device)`.
- Bez karet se žádný nový HTTP požadavek hodinám neposílá. Původní minutová synchronizace nastavení/capabilities zůstává samostatná.
- Se samotnou kartou aplikace se čte pouze stav zařízení. Audio vyžaduje také capabilities a `/api/v1/audio`. Všechny požadavky této funkce jsou pouze GET. Audio/radio karty mají Homey filtry a facade podporu znovu ověří z aktuálních capabilities; nedostupná funkce se nepředstírá.
- Každé pozorování ověří `uid`. Změna identity nevytvoří událost z cizích hodin.
- První úspěšné načtení vytvoří výchozí stav bez událostí. Totéž platí po změně sady používaných karet, výpadku, změně připojení, restartu Homey nebo zjištěném restartu hardwaru.
- Restart hardwaru lze rozpoznat podle poklesu `uptimeSeconds`. Dokumentace uvádí, že restart samotného AWTRIX procesu počítadlo neresetuje; takový restart bez pozorovaného výpadku není tímto signálem zjistitelný. Pokud starší odpověď uptime neobsahuje, chování se neopírá o vymyšlenou nulu.
- Snapshoty jsou kopie vybraných polí. Počítadla zdraví rádia, stanice uložené v seznamu a jiné vedlejší údaje události nespouštějí.
- Trvající stejná chyba se ohlásí jednou. Vyčištění chyby nevytváří error událost, ale dovolí později znovu ohlásit stejnou chybu. Chyba přítomná při prvním načtení se záměrně nehlásí jako nová.
- Poll nepřekrývá vlastní požadavky. Po změně připojení/smazání zařízení se výsledek rozpracovaného požadavku zahodí. Timer se při smazání zastaví ještě před úklidem callbacku.
- Snapshot se uloží před vyvoláním karet. Selhání doručení Flow se zaznamená, nezpůsobí opakované doručování stejného stavu a nebrání ostatním kartám.

**Polling není proud událostí.** Krátký zvuk nebo několik změn aplikace mezi dvěma načteními může zcela minout. Přehrání téhož zvuku, které mezi načteními skončí a znovu začne, se stejným `name` a `playing` nerozliší. Bez MQTT/callbacku s historií nelze z HTTP snapshotů tyto události rekonstruovat. Karty a jejich nápovědy toto omezení uvádějí; nejde o garantované oznámení každého začátku/konce. Pro test krátkého zvuku použijte delší/loop přehrávání a následné stop.

## Ověření

Automaticky prošlo **524/524 testů**, TypeScript, ESLint a Homey validace na úrovni `publish`. Validace nic nepublikuje.

Syntetické testy pokrývají výchozí stav, opakování stejného snapshotu, prázdnou aplikaci, start/stop, rádio a změnu skladby, vznik/vyčištění/opakování chyby, neplatné odpovědi, capability guardy, zachování HTTP chyby, nulové požadavky bez Flow, znovupřipojení, změnu připojení/smazání při rozpracovaném GET a selhání doručení Flow. Testuje se také manifest: NG/audio/radio filtry a skutečné typy tokenů.

Před vydáním ověřit v nainstalované Homey aplikaci:

1. Vytvořit Flow změny aplikace, počkat na první kontrolu, přepnout aplikaci a ověřit oba názvy; opakovat s prázdnou rotací. Samotná notifikace nemá spustit tuto kartu.
2. Dlouhý nebo loop zvuk: ověřit `alert`/`app`, start a stop. Zopakovat stejný stav bez dalších událostí.
3. Rádio: start, změna stanice, metadata skladby a stop. Sledujte boolean, nikoli vyplněný poslední název stanice.
4. Chybný stream/URL: jedna error událost; po úspěšném přehrání znovu chyba. HTTP odpojení nemá být interpretované jako audio chyba.
5. Odpojit a vrátit hodiny: první nový snapshot žádné události; další změna ano. Totéž po restartu aplikace či přepnutí připojení.
6. Odstranit Flow a ověřit v diagnostice/HTTP měření, že další rychlé GET zaniknou. Ověřit více zařízení bez přesahu událostí.

Žádný test v této práci nečte živé hodiny ani nepoužívá reálná přihlašovací data. Skutečné chování karet a Homey `getArgumentValues` při ukládání/vypínání Flow je nutné ověřit na Homey.
