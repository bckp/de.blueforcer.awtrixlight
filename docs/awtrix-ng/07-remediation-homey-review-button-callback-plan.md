# AWTRIX NG: plán button callbacku

## Cíl a hranice změn

Tento dokument popisuje odloženou implementaci příjmu `buttonCallback` událostí a odpovídajících
AWTRIX NG Flow triggerů.

AWTRIX 3 musí po celou dobu zůstat funkční. Změny API modelu, klienta a callbacku proto patří pouze
do `lib/awtrixng` a `drivers/awtrixng`. Sdílené Flow karty lze měnit pouze tam, kde se nemění jejich
ID, argumenty ani runtime význam. Nepodporované vlastnosti se nesmí zahazovat ani emulovat bez
výslovného rozhodnutí.

Referenčním zdrojem pro implementaci musí být konkrétní commit AWTRIX NG a k němu odpovídající
vendorizovaná dokumentace. Před implementací se znovu ověří aktuálnost snapshotu popsaného v
`docs/vendor/awtrixng-source.md`.

---

## 1. Přidání AWTRIX NG button callbacku a jeho Flows

### 1.1 Doložený wire contract

Callback se konfiguruje přes částečný update `PUT /api/v1/system`:

```json
{
  "buttonCallback": "http://<homey-lan-ip>:<port>/awtrixng/button/<token>"
}
```

AWTRIX NG následně na každou hranu tlačítka odešle:

```http
POST /awtrixng/button/<token>
Content-Type: application/x-www-form-urlencoded

button=<left|middle|right>&state=<1|0>&uid=<mac-bez-dvojtecek>
```

Jeden stisk znamená dva requesty: `state=1` při stisku a `state=0` při uvolnění. Prostřední tlačítko
se ve webhooku jmenuje `middle`, nikoliv `select`. `swapButtons` ani `rotate` fyzické názvy callbacku
nemění. Firmware podporuje pouze prosté `http://`, neposílá auth header, neprovádí retry ani redirect
a request běží synchronně s timeoutem 300 ms pro connect i odpověď.

### 1.2 Povinný technický spike: lokální HTTP listener na Homey

Před implementací Flow triggerů je nutné ověřit na reálném Homey Pro:

- zda SDK 3 aplikace smí otevřít stabilní TCP/HTTP port dostupný z LAN,
- zda port přežije restart aplikace a lze bezpečně řešit jeho konflikt,
- jak zjistit správnou Homey LAN IPv4 adresu při více síťových rozhraních,
- zda Homey firewall a app sandbox dovolí příchozí spojení ze zařízení,
- zda lze listener korektně ukončit při app shutdown/restartu.

Homey cloud webhook ani běžná HTTPS URL nejsou ekvivalent: firmware HTTPS callback neodešle. Pokud
nelze podporovaný a stabilní LAN listener vystavit, tato fáze se zastaví jako explicitně blokovaná.
Nesmí se potichu nahradit MQTT nebo jinou podobnou funkcí.

Výstup spike musí být malý ověřovací prototyp a záznam:

- použitá Homey a SDK verze,
- bind adresa a port,
- úspěšný press i release request z fyzického AWTRIX NG,
- chování po restartu aplikace a Homey,
- rozhodnutí **go/no-go**.

### 1.3 NG-only System API

Při výsledku **go**:

- Přidat samostatné DTO pro `GET/PUT /api/v1/system`; společné rozhraní AWTRIX 3/NG se nemění.
- Implementovat pouze doložený partial update a zachovat celý NG error envelope.
- Před přepsáním `buttonCallback` načíst současnou hodnotu a zobrazit uživateli, že aktivace Homey
  callbacku nahradí případný existující callback.
- Uložit hodnotu nastavenou naší aplikací. Při vypnutí nebo odebrání zařízení callback vyčistit
  pouze tehdy, pokud zařízení stále obsahuje přesně naši URL; cizí změnu nikdy nepřepsat.
- Přidat device nastavení minimálně pro:
  - `Enable Homey button callback`,
  - read-only diagnostický stav/URL,
  - poslední chybu synchronizace.
- Změna se nesmí tvářit jako úspěšná, pokud `PUT /api/v1/system` selže.

### 1.4 Callback server a bezpečnost

- Listener patří do app-level služby, protože obsluhuje více NG zařízení na jednom portu.
- Při instalaci vytvořit kryptograficky náhodný token v URL. Samotné `uid` není autentizace a lze
  ho podvrhnout.
- Přijímat pouze `POST` a `application/x-www-form-urlencoded`; nastavit malý limit těla.
- Validovat přesně:
  - `button` je `left`, `middle` nebo `right`,
  - `state` je `1` nebo `0`,
  - `uid` má očekávaný normalizovaný MAC formát,
  - token odpovídá instalaci.
- Neznámé zařízení nebo chybný payload nesmí spustit Flow. Vrátit srozumitelné `400`, `404`, `405`
  nebo `413` a bezpečně zalogovat důvod.
- Platný request zařadit do interní fronty a odpovědět okamžitě `204`, aby se displej nezasekl na
  firmware timeoutu. Flow spustit až mimo HTTP request handler.
- Zařízení dohledat podle uloženého normalizovaného `uid`; nikdy pouze podle IP adresy.
- Listener korektně uzavřít při shutdownu a nesmí po restartu vzniknout duplicitní handler.

Navržený interní event:

```ts
interface AwtrixNgButtonEvent {
  uid: string;
  button: "left" | "middle" | "right";
  state: "pressed" | "released";
  receivedAt: number;
}
```

### 1.5 Flow triggery

První verze přidá dvě AWTRIX NG-only device trigger karty:

| Flow card ID | `title.en` | `titleFormatted.en` | Argument |
|---|---|---|---|
| `awtrixngButtonPressed` | `A button was pressed` | `The [[button]] button was pressed` | dropdown `button`: left/middle/right |
| `awtrixngButtonReleased` | `A button was released` | `The [[button]] button was released` | dropdown `button`: left/middle/right |

Karty budou dostupné pouze zařízení driveru `awtrixng`. Stisk a uvolnění se mapují přímo z wire
contractu; nevytvářet v první verzi emulované long-press, double-click ani přemapování podle
`swapButtons`/`rotate`. Běžná funkce tlačítek na zařízení zůstává aktivní. Uživatel může samostatně
zapnout `blockNavigation`, pokud mají tlačítka ovládat pouze automatizaci.

Implementační kroky:

- Přidat trigger compose soubory a registrovat karty při inicializaci AWTRIX NG driveru/aplikace.
- Směrovat event podle `uid` na konkrétní Homey device.
- Předat `button` také jako token pro inspekci a budoucí rozšiřitelnost.
- Použít state/filter objekt Flow triggeru tak, aby karta zvolená pro `left` nespouštěla event
  `right`.
- Nevystavovat raw callback jako sdílenou AWTRIX 3 kartu.

### 1.6 Lifecycle a síťové změny

- Po restartu aplikace ověřit listener a následně rekoncilovat callback pouze u zařízení, která jej
  mají explicitně povolený.
- Při změně Homey IP nebo portu nejprve spustit nový listener, potom přepsat callbacky zařízení.
- Pokud zařízení není dostupné, ponechat jej unavailable/retry podle současného NG error modelu;
  chybu nezahazovat.
- Neprovádět periodický `PUT` bez změny. Reconciliation musí nejprve číst a porovnat hodnotu.
- Dokumentovat, že callback vyžaduje vzájemnou LAN dostupnost a nebude fungovat přes oddělenou VLAN
  bez povoleného routingu/firewallu.

### 1.7 Testy a akceptace

**Automatické testy**

- System API client: URL, metoda, JSON tělo a zachování error detailů.
- Form parser: všechny tři button hodnoty, press/release a odmítnutí chybných hodnot.
- Security: chybný token, neznámé UID, jiná metoda, content type a příliš velké tělo.
- Routing dvou AWTRIX zařízení na dvě rozdílné Homey device instance.
- Přesně jeden trigger pro jednu platnou hranu; žádný trigger po shutdownu.
- Aktivace, deaktivace a ochrana cizí `buttonCallback` URL.
- Stávající Flow card title test musí platit také pro nové trigger karty.

**Manuální testy na zařízení**

- Left, middle a right: každý stisk vytvoří právě press a release trigger.
- Ověřit současné built-in chování tlačítek a variantu s `blockNavigation`.
- Restart aplikace, restart Homey, restart AWTRIX a změna DHCP adresy Homey.
- Neaktivní listener nesmí zařízení blokovat déle než doložený firmware timeout; po obnovení
  listeneru musí další události fungovat bez ručního restartu AWTRIX.

### 1.8 Definition of done fáze 1

- Existuje doložený a podporovaný způsob lokálního HTTP listeneru na Homey Pro.
- Callback se zapíná a vypíná explicitně a nepřepisuje cizí konfiguraci bez upozornění.
- Press a release Flow triggery fungují pro všechna tři fyzická tlačítka a správné zařízení.
- HTTP handler odpovídá rychle, validuje vstup a neignoruje chyby.
- Dokumentace popisuje LAN, HTTP-only a bezpečnostní omezení.

---

## Doporučené pořadí realizace

1. Provést button callback spike na fyzickém Homey Pro a AWTRIX NG.
2. Pouze při výsledku **go** implementovat System API, listener, nastavení a Flow triggery.
3. Spustit build, lint, celou testovací sadu, Homey compose validaci a manuální regresi obou driverů.
