# Nálezy k opravě po auditu verze 2.2.0

Auditováno na commitu `9a299d1`.

## 1. AWTRIX 3: nečekaný zápis seznamu efektů

- **Priorita:** P1
- **Soubor:** `drivers/awtrixlight/device.ts`
- **Místo:** metoda `refreshEffects()`

### Problém

Volání `setStoreValue()` není `await`ované. Metoda proto může skončit úspěšně před dokončením zápisu. Pokud zápis selže, chyba unikne jako `unhandled rejection` a nebude zahrnuta do `AggregateError` vytvářeného metodou `refreshAll()`.

### Navržená oprava

Použít:

```typescript
await this.setStoreValue('effects', await this.cmdGetEffects());
```

### Akceptační kritéria

- `refreshEffects()` čeká na dokončení zápisu.
- Chyba zápisu se propaguje volajícímu.
- `refreshAll()` zahrne chybu do svého `AggregateError`.
- Nevznikne `unhandled rejection`.

## 2. AWTRIX 3: rediscovery během inicializace běží bez čekání

- **Priorita:** P1
- **Soubor:** `drivers/awtrixlight/device.ts`
- **Místo:** metoda `initializeDevice()`

### Problém

Při nedostupném zařízení se `tryRediscover()` spustí bez `await` nebo explicitního zpracování chyby. Inicializace mezitím pokračuje a spustí polling, zatímco rediscovery může měnit IP adresu, store a dostupnost zařízení.

Odmítnutí Promise může uniknout jako `unhandled rejection`.

### Navržená oprava

Rediscovery explicitně `await`ovat a zpracovat její výsledek nebo chybu před pokračováním inicializace pollingu.

### Akceptační kritéria

- Inicializace neignoruje dokončení rediscovery.
- Chyba rediscovery je zalogována nebo propagována podle zvoleného kontraktu.
- Nevznikne `unhandled rejection`.
- Polling nezačne v nekonzistentním stavu.

## 3. AWTRIX 3: Rediscover listener nečeká na aktualizaci IP capability

- **Priorita:** P2
- **Soubor:** `drivers/awtrixlight/device.ts`
- **Místo:** listener capability `button.rediscover`

### Problém

Volání `setCapabilityValue('ip', ...)` není `await`ované. Listener proto může skončit úspěšně, i když aktualizace capability následně selže. Okolní `try/catch` asynchronní chybu nezachytí.

### Navržená oprava

Použít:

```typescript
await this.setCapabilityValue('ip', this.getStoreValue('address'));
```

### Akceptační kritéria

- Listener čeká na dokončení zápisu capability.
- Selhání zápisu způsobí selhání rediscovery akce.
- Chyba je zachycena existujícím `try/catch`.
- Nevznikne `unhandled rejection`.

## 4. AWTRIX NG: nedostatečná validace položek seznamu ikon

- **Priorita:** P2
- **Soubor:** `lib/awtrixng/Services/Icons.ts`
- **Místo:** metody `loadIcons()` a `toAwtrixNgIconAutocompleteItems()`

### Problém

Validuje se pouze to, že `response.files` je pole. Jednotlivé položky nejsou ověřeny před použitím `path.parse(file.name)`.

Například odpověď:

```json
{
  "files": [{}]
}
```

způsobí obyčejný `TypeError` místo strukturovaného `AwtrixNgInvalidResponseError`. Ztratí se tím informace o endpointu a očekávaném formátu odpovědi.

### Navržená oprava

Před mapováním ověřit, že každá položka:

- je objekt,
- obsahuje `name`,
- `name` je neprázdný string,
- případná další používaná pole mají očekávaný typ.

Při neplatné odpovědi vyhodit `AwtrixNgInvalidResponseError` pro endpoint `/api/v1/files`.

### Akceptační kritéria

- Neplatná položka nikdy nedojde do `path.parse()`.
- Chyba zachová endpoint a očekávaný formát.
- Nevznikne obecný `TypeError`.
- Přidat testy pro neplatné `files` položky.

## 5. AWTRIX NG: vymazání adresy obnoví starou adresu ze store

- **Priorita:** P2
- **Soubor:** `drivers/awtrixng/device.ts`
- **Místo:** metoda `getConnectionCandidateFromSettings()`

### Problém

Prázdná adresa v nastavení vždy aktivuje fallback na adresu uloženou ve store. Kód nerozlišuje:

1. starší zařízení, které ještě nemá adresu uloženou v Homey settings,
2. uživatele, který adresu právě úmyslně vymazal.

Při úmyslném vymazání se proto použije stará adresa ze store a následně může být zapsána zpět do nastavení.

### Navržená oprava

Při rozhodování o fallbacku zohlednit `changedKeys`.

Fallback na store povolit pouze tehdy, pokud:

- adresa v settings chybí kvůli migraci staršího zařízení,
- `address` nebyla součástí právě provedené uživatelské změny.

Pokud uživatel nastaví `address` na prázdnou hodnotu, změnu explicitně odmítnout nebo zařízení ponechat jako nenakonfigurované podle zvoleného kontraktu.

### Akceptační kritéria

- Změna jiného lokálního nastavení u staršího zařízení stále použije migrační fallback.
- Úmyslné vymazání adresy neobnoví starou hodnotu.
- Stará adresa není automaticky zapsána zpět do settings.
- Přidat test s `changedKeys` obsahujícím `address` a prázdnou novou adresou.

## 6. AWTRIX NG: připojení se ukládá do store neatomicky

- **Priorita:** P3
- **Soubor:** `drivers/awtrixng/device.ts`
- **Místo:** metoda `commitConnection()`

### Problém

Hodnoty `baseUrl`, `address` a `port` se zapisují postupně:

```typescript
await this.setStoreValue('baseUrl', connection.baseUrl);
await this.setStoreValue('address', connection.address);
await this.setStoreValue('port', connection.port);
```

Pokud druhý nebo třetí zápis selže, store zůstane v částečně aktualizovaném a nekonzistentním stavu. Například může obsahovat nové `baseUrl`, ale starou adresu a port.

### Navržená oprava

Preferované možnosti:

1. ukládat celé připojení atomicky pod jedním klíčem,
2. při selhání obnovit původní hodnoty,
3. zavést bezpečný commit postup s explicitním rollbackem.

Klient se smí aktivovat až po úspěšném dokončení celé operace.

### Akceptační kritéria

- Selhání libovolného zápisu nezanechá smíšené staré a nové hodnoty.
- Klient se při neúspěšném commitu neaktivuje.
- Homey settings a store zůstanou konzistentní.
- Přidat testy selhání každého jednotlivého kroku zápisu.

## Doporučené pořadí oprav

1. Nečekaný zápis efektů AWTRIX 3.
2. Rediscovery během inicializace AWTRIX 3.
3. Rediscover capability listener AWTRIX 3.
4. Validace položek seznamu AWTRIX NG ikon.
5. Rozlišení migrace a úmyslného vymazání NG adresy.
6. Atomické uložení NG připojení.
