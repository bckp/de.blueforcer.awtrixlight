# AWTRIX NG button callback — manual Homey test

## Pozor: tato kolekce je historický form spike

Requesty `02`–`09` používají starý `application/x-www-form-urlencoded`
payload, který skutečné Homey v srpnu 2026 předalo handleru jako prázdné
`body: {}`. Requesty `10`–`13` byly návrhový JSON pokus s číselným
`state`; ten také neodpovídá skutečnému firmware 1.1.1.
Nepoužívejte tuto kolekci jako release ověření současné funkce.

Pro firmware 1.1.1 nainstalujte testovací build na skutečné lokální Homey,
zapněte opt-in checkbox na NG zařízení a fyzicky stiskněte left, middle a
right. Ověřte přesně jeden Flow run na stisk, žádný další při uvolnění,
izolaci druhého NG zařízení a zachování cizího callbacku. Token ani
výslednou URL nevkládejte do výpisu, screenshotu nebo shell historie.

Tato Bruno kolekce ověřuje nejistý integrační bod, který nelze dokázat unit testem:
zda lokální Homey App Web API přijme skutečný
`Content-Type: application/x-www-form-urlencoded` request odesílaný firmwarem AWTRIX NG.

## Příprava

1. Otevřete v Bruno jako kolekci tuto složku.
2. Vyberte environment `Local`.
3. V environmentu nastavte `awtrix_base_url`, například `http://192.168.1.100`.
4. Pokud má AWTRIX zapnutou API autentizaci, doplňte v Bruno hodnoty secret variables
   `awtrix_username` a `awtrix_password`. Při vypnuté autentizaci je ponechte prázdné.
5. V Homey otevřete nastavení příslušného AWTRIX NG zařízení a zapněte
   `Enable button callbacks`.
6. Vytvořte tři testovací Flows s kartami left, middle a right. Každému dejte snadno
   pozorovatelnou akci, například timeline notification.

## Doporučený postup

1. Spusťte `01 Read callback configuration`. Request načte `/api/v1/system` z AWTRIXu,
   ověří nakonfigurovanou lokální Homey URL a uloží Homey adresu, UID a token pouze do
   dočasných Bruno runtime variables.
2. Spusťte requesty `02` až `05` jednotlivě:

   - `02 Left press`: odpověď `{ "ok": true }`, právě jeden left Flow run.
   - `03 Left release`: odpověď `{ "ok": true }`, žádný Flow run.
   - `04 Middle press`: odpověď `{ "ok": true }`, právě jeden middle Flow run.
   - `05 Right press`: odpověď `{ "ok": true }`, právě jeden right Flow run.

3. Pokud requesty `02` až `05` vrátí `{ "ok": false }`, spusťte ještě před
   vypnutím callbacků JSON sadu `10` až `13`. Ta představuje navrhovaný firmware
   kontrakt `Content-Type: application/json` s číselným `state`:

   - `10 JSON left press`: `{ "ok": true }` a právě jeden left Flow run.
   - `11 JSON left release`: `{ "ok": true }` a žádný Flow run.
   - `12 JSON middle press`: `{ "ok": true }` a právě jeden middle Flow run.
   - `13 JSON right press`: `{ "ok": true }` a právě jeden right Flow run.

   Pokud JSON sada projde, UID, token, zařízení i checkbox jsou v pořádku a zbývající
   nekompatibilita je pouze ve zpracování `application/x-www-form-urlencoded` na Homey.

4. Spusťte negativní requesty `06` až `08`. Všechny musí vrátit `{ "ok": false }`
   a nesmí spustit žádný Flow.
5. Pro poslední test ponechte Bruno otevřené, v Homey checkbox vypněte a spusťte
   `09 Press while disabled`. Dříve platná URL musí vrátit `{ "ok": false }`.

Requesty používají Bruno `body: formUrlEncoded` bez ručně přidaného Content-Type headeru.
Bruno jej pro tento body typ doplní automaticky, takže požadavek odpovídá firmware kontraktu.

## Co zaznamenat

- Verzi Homey firmware a verzi nainstalované aplikace.
- Zda request `02` došel do handleru a vrátil `{ "ok": true }`.
- Zda `03` nevyvolal druhý Flow run.
- Výsledek všech tří tlačítek a negativních testů.
- Přibližný response time platných requestů; handler má odpovědět okamžitě, protože AWTRIX
  používá krátké timeouty.

Callback URL obsahuje per-device secret. Neukládejte ji do issue, screenshotu, logu ani
commitu. Environment soubor obsahuje pouze názvy secret variables, nikoliv jejich hodnoty.
