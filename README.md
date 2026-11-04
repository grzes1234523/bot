# Bot Rekrutacyjny PRO 3.0 — Discord

Bot Discord oparty na discord.js: rekrutacja, statystyki, ekonomia, auto kanały, moderacja, Auto Mod, logi, ticketing i weryfikacja.

## Instalacja

1. Zainstaluj **Node.js 24.17.0 lub nowszy**.
2. Skopiuj `.env.example` do `.env` i wpisz token/ID. Nie wysyłaj pliku `.env` innym osobom.
3. Uruchom w katalogu projektu:

   ```bash
   npm install
   npm run deploy
   npm start
   ```

   `npm run deploy` jest wymagane po dodaniu nowych komend. Zachowuje dotychczasowe komendy serwerowe, a `/ticket` i `/embed` rejestruje globalnie, aby działały na serwerach, do których dodasz bota.
4. Jako administracja wykonaj `/rekrutacja-panel` na wybranym kanale.
5. Po aktualizacji ze starszej wersji opublikuj **nowy panel** `/rekrutacja-panel`, aby gracze zobaczyli tekst o 15 pytaniach. Stare panele z działającym przyciskiem uruchomią również nowy 3-etapowy proces.

**Uprawnienia bota:** `View Channel`, `Send Messages`, `Embed Links`, `Manage Roles` (do nadawania roli), dostęp do kanału podań. Zaproś bota ze scope `bot` oraz `applications.commands`. Rola bota musi znajdować się **wyżej** niż `ACCEPTED_ROLE_ID`.

Jeśli włączysz statystyki statusu członków, w Discord Developer Portal → Bot włącz uprzywilejowane **Server Members Intent** i **Presence Intent**. Kod używa tych intencji; Discord może odmówić połączenia, jeśli nie są dozwolone w ustawieniach aplikacji.

## Moduły dodatkowe

- **Statystyki:** `/statystyki` pokazuje liczbę członków, kanałów, podania i obieg monet.
- **Ekonomia:** `/ekonomia-portfel`, `/ekonomia-daily` (100 StrefaCoins co 24 godziny), `/ekonomia-praca` (15–60 monet co godzinę), `/ekonomia-przelej` i `/ekonomia-ranking`.
- **Auto kanały:** `/auto-kanaly-ustaw` ustawia kanał głosowy „dołącz, aby utworzyć pokój”, kategorię i szablon `{name}`. Puste pokoje utworzone przez bota są usuwane. Bot potrzebuje `Manage Channels` i `Move Members`.
- **Moderacja:** `/moderacja-timeout`, `/moderacja-kick`, `/moderacja-ban`, `/moderacja-ostrzegaj`, `/moderacja-ostrzezenia` oraz `/moderacja-slowmode`.
- **Auto Mod:** `/auto-mod-fraza operacja:Dodaj|Usuń fraza:...` zarządza natywną regułą Discorda blokującą wskazane słowa. `/auto-mod-lista` pokazuje jej stan. Wymagane są uprawnienia do konfiguracji Auto Moderation.
- **Logi:** `/logi-ustaw kanal:#kanał` wybiera kanał logów. Bot zapisuje działania moderacyjne, ticketów, weryfikacji, Auto Mod i zmiany kanałów; treści usuniętych wiadomości nie są kopiowane.
- **Moderowane kanały:** `/moderowane-kanaly` pokazuje slowmode i blokady pisania; slowmode ustawisz przez `/moderacja-slowmode`.
- **Tickets:** `/tickets-panel` publikuje przycisk otwierający prywatny kanał. Zamknięcie archiwizuje kanał i zachowuje historię. Bot potrzebuje `Manage Channels`.
- **Weryfikacja:** `/weryfikacja-panel rola:@rola` publikuje przycisk nadający wybraną rolę. Bot musi mieć `Manage Roles`, a rola musi znajdować się poniżej roli bota.

Komendy administracyjne odpowiadają tylko osobom z `Manage Server`/`Administrator` lub skonfigurowaną rolą `STAFF_ROLE_ID`. Rola dla kandydatów po akceptacji (`ACCEPTED_ROLE_ID`) pozostaje oddzielna od roli przyznawanej podczas weryfikacji.

Salda, ostrzeżenia i konfiguracja modułów zapisują się w `features.json` obok bazy podań. Zmienna `STREFA_BOT_DATA_DIR` pozwala wskazać lokalny katalog danych; na Windows warto użyć lokalnego folderu poza OneDrive, aby uniknąć blokad synchronizacji.

## Formularz: 15 pytań, 3 etapy

W jednym standardowym modalu Discord można użyć maksymalnie pięciu pól; dlatego formularz ma trzy kolejne okienka. Po zapisaniu etapu bot wyśle **prywatny przycisk** „Otwórz etap 2/3”, potem „Otwórz etap 3/3”. Dopiero po wysłaniu 3. etapu kompletne podanie trafia do administracji.

**Etap 1: podstawy** — stanowisko, wiek, doświadczenie, czas dostępności, motywacja.

**Etap 2: wiedza i sytuacje** — stosowanie regulaminu, reakcja na łamanie zasad, konflikt między graczami, nadużycia władzy, narzędzia/komendy moderacyjne.

**Etap 3: współpraca** — praca zespołowa, mocne strony, obszary do poprawy, pomysły na rozwój serwera, dodatkowe informacje (opcjonalne).

Przerwa między etapami może wynosić do **30 minut od ostatniej aktywności**; formularz jest przechowywany w pamięci bota do wysłania. **Restart bota przerywa niedokończone formularze** (kandydat może zacząć ponownie). Odpowiedzi wysłane w pełnym podaniu trafiają do `data/applications.json` i jako 3 embedy na kanał administracji.

## Komendy

| Komenda | Uprawnienia | Funkcja |
| --- | --- | --- |
| `/rekrutacja-panel` | staff | Publikuje publiczny panel rekrutacyjny |
| `/rekrutacja-akceptuj id:... [uwagi]` | staff | Akceptuje, nadaje rolę o ID `ACCEPTED_ROLE_ID`, wysyła DM |
| `/rekrutacja-odrzuc id:... powod:...` | staff | Odrzuca podanie z uzasadnieniem |
| `/rekrutacja-zamknij id:... [powod]` | staff | Kończy rekrutację bez akceptacji |
| `/rekrutacja-lista [status]` | staff | Wyświetla podania |
| `/rekrutacja-statystyki` | staff | Statystyki zgłoszeń |
| `/rekrutacja-status [id]` | każdy | Ostatnie własne podanie lub wskazane ID (cudze tylko staff) |
| `/rekrutacja-moje` | każdy | Historia własnych podań |
| `/rekrutacja-pomoc` | każdy | Instrukcja |
| **`/rekrutacja-usun id:... [wiadomosc]`** | **Administrator / Manage Server** | Usuwa **jedno zakończone** podanie po potwierdzeniu |
| **`/rekrutacja-wyczysc [status] [wiadomosci]`** | **Administrator / Manage Server** | Usuwa wszystkie zakończone lub wybrany status po potwierdzeniu |

### Usuwanie ukończonych rekrutacji

`/rekrutacja-wyczysc` domyślnie obejmuje **zaakceptowane, odrzucone i zamknięte** zgłoszenia. Opcja `status` pozwala usunąć wyłącznie jedną grupę. `pending` (oczekujące) **nigdy nie są usuwane** tą komendą.

Przykłady:

- `/rekrutacja-wyczysc` — wszystkie zakończone.
- `/rekrutacja-wyczysc status:Odrzucone` — tylko odrzucone.
- `/rekrutacja-usun id:ABC12345` — jedno rozpatrzone zgłoszenie.

Bot pokaże liczbę podań i przyciski **Potwierdź usunięcie / Anuluj**. Potwierdzenie wygasa po **2 minutach** i działa tylko dla osoby, która wywołała komendę. Po zatwierdzeniu:

1. Tworzona jest **kopia całej bazy sprzed usunięcia** w `data/backups/applications-before-delete-*.json`.
2. Z bazy aktywnej usuwane są wyłącznie zakończone podania.
3. Domyślnie bot próbuje skasować ich wiadomości na kanale podań. Parametr `wiadomosci:false` / `wiadomosc:false` pozwala je zachować.
4. Bot wysyła informację do kanału logów, jeśli skonfigurowano `LOG_CHANNEL_ID`.

**Ważne:** przyznanych wcześniej ról nie odbiera. Kopie bezpieczeństwa nadal zawierają dane usuniętych podań; można je usunąć osobno po upewnieniu się, że nie są już potrzebne. Również logi lub DM wysłane wcześniej nie są usuwane. Po usunięciu zaakceptowanego podania system traci informację o tej akceptacji, więc ta osoba może znów składać podanie. Przed wdrożeniem sprawdź własną politykę retencji danych.

Jeżeli wiadomość nie zostanie usunięta (np. z powodu uprawnień), bot poda liczbę nieudanych operacji; wiadomość może wymagać ręcznego usunięcia.

## `ACCEPTED_ROLE_ID` — ID, a nie nazwa

Ustaw w `.env`:

```env
ACCEPTED_ROLE_ID=123456789012345678
```

W Discordzie włącz tryb deweloperski, kliknij PPM rolę i skopiuj jej ID. Upewnij się, że rola bota jest wyżej w hierarchii.

## Aktualizacja z wersji 2.0

1. **Zatrzymaj poprzednią instancję bota.** Uruchamiaj tylko jeden proces na jednym pliku danych.
2. Wykonaj własną kopię `data/applications.json`.
3. Rozpakuj nową wersję, zachowaj dotychczasowe `.env` (z `ACCEPTED_ROLE_ID`) i `data/applications.json`.
4. Uruchom `npm install`, **`npm run deploy`**, `npm start`.
5. Uruchom `/rekrutacja-panel` do opublikowania nowego panelu; stare, już złożone podania i przyciski pozostają obsługiwane.

## Testy

```bash
npm run check
```

Sprawdzane są m.in. blokady przed podwójnym podaniem, stara baza JSON, formularz 15 pytań, sesje wieloetapowe, tworzenie kopii, brak możliwości usunięcia pending i równoczesne czyszczenie. Testy jednostkowe nie zastępują prawdziwego sprawdzenia bota na serwerze Discord.

## Pterodactyl / VPS

- Uruchom proces `node src/bot.js`.
- Na stałym wolumenie dyskowym trzymaj `data/` i kopie w `data/backups/`.
- Token zapisuj w prywatnym `.env` / zmiennych środowiskowych panelu.
- Zarejestruj slash commands **`npm run deploy`** po zmianie projektu.

## Nowy system ticketów PRO

Zarejestruj komendy przez `npm run deploy`, a potem użyj `/ticket panel`. Panel możesz opublikować na kanale tekstowym, nadać mu tytuł i opis oraz wskazać kategorię kanałów i rolę obsługi. `/ticket panel-edytuj` aktualizuje istniejącą wiadomość, a `/ticket panel-usun` ją wyłącza. Konfiguracja, przyciski, formularze i zadania automatyczne są zapisane w magazynie, więc działają po restarcie.

Po kliknięciu użytkownik wybiera kategorię (jeśli skonfigurowano więcej niż jedną) i wypełnia formularz. `/ticket kategoria` tworzy, edytuje lub usuwa kategorię, jej pytania (do pięciu), rolę obsługi i kategorię kanałów Discord; `/ticket kategorie` wyświetla konfigurację. `/ticket administrator` ustawia dodatkowe role uprawnione do obsługi ticketów. `/ticket konfiguracja` ustawia kanał logów, domyślną rolę obsługi, limit zgłoszeń na osobę, przypomnienie o bezczynności, alarm o braku opiekuna oraz opcjonalne automatyczne zamknięcie. Autozamykanie jest domyślnie wyłączone i pozostaje wyłączone, gdy nie ustawisz dodatniej liczby godzin.

Bot sprawdza limit otwartych zgłoszeń i czarną listę, tworzy prywatny kanał, zapisuje odpowiedzi i publikuje panel obsługi. Obsługa może przejąć lub przekazać zgłoszenie, dodać/usunąć uczestnika, zmienić nazwę, zamknąć, otworzyć ponownie i pobrać transkrypt HTML (do 1000 ostatnich wiadomości). Autor może ocenić zamknięte zgłoszenie od 1 do 5. Log działań jest utrzymywany w konfiguracji funkcji i wysyłany na wybrany kanał.

`/ticket raport okres:dzien` i `okres:miesiac` tworzy raport z liczby ticketów, statusów, ocen i aktywności opiekunów. `/ticket eksport` pobiera CSV historii. `/ticket historia` wyświetla zgłoszenia własne lub wskazanej osoby. Przypomnienia i alarmy wymagają działającego procesu bota; harmonogram jest sprawdzany co minutę. Automatyczne zamykanie można włączyć przez `/ticket konfiguracja auto_zamknij_h:...` i wyłączyć wartością `0`.

Najważniejsze komendy:

- `/ticket panel` — tworzy panel zgłoszeń.
- `/ticket panel-edytuj`, `/ticket panel-usun` — edytuje lub wyłącza istniejący panel.
- `/ticket kategoria`, `/ticket kategorie`, `/ticket administrator` — konfiguruje kategorie, pytania, role i obsługę.
- `/ticket konfiguracja` — ustawia limit, role, kanał logów, przypomnienia, alarmy i opcjonalne autozamykanie.
- `/ticket statystyki`, `/ticket raport`, `/ticket eksport`, `/ticket lista`, `/ticket historia` — zestawienia, raporty, CSV i historia.
- `/ticket przejmij`, `/ticket przekaz`, `/ticket dodaj`, `/ticket usun-uzytkownika` — przypisanie i uczestnicy.
- `/ticket zamknij`, `/ticket otworz-ponownie`, `/ticket transcript`, `/ticket ocena`, `/ticket usun` — obsługa zgłoszenia.
- `/ticket blacklist` — blokuje lub odblokowuje osobę.

Bot wymaga uprawnienia Zarządzanie kanałami, a kanały ticketów muszą mieścić się w limitach Discorda. Transkrypt obejmuje maksymalnie 1000 ostatnich wiadomości z kanału i jest zapisywany w rekordzie ticketu; załączniki są odnośnikami do Discord CDN.

## Kreator embedów

`/embed kreator kanal:#kanał` otwiera formularz z podglądem; formularze rozszerzone pozwalają edytować autora, URL, ikonę, miniaturę, stopkę, treść wiadomości i znacznik czasu. `/embed edytuj` zachowuje poprzednie wersje, `/embed cofnij` przywraca wybraną, `/embed pole` dodaje pole inline lub zwykłe, a `/embed import` i `/embed eksport` obsługują JSON. W wiadomości można opublikować wiele embedów (do limitu Discorda). `/embed szablon` zapisuje, używa lub usuwa własne szablony. `/embed akcja` dodaje przycisk do nadania/odebrania roli, otwarcia ticketu lub przekazania formularza na kanał; `/embed menu-role` ustawia wybór ról z dozwolonej listy. Zmienne obejmują m.in. `{server_name}`, `{member_count}`, `{user_name}`, `{user_mention}`, `{channel_name}` i `{bot_name}`.

`/embed zaplanuj` planuje publikację na określony czas, opcjonalnie codzienną, tygodniową lub miesięczną. `/embed harmonogram` pokazuje zadania, `anuluj` je wyłącza, a `ponow` ręcznie ponawia zakończoną błędem próbę. Po restarcie niezakończone zadania wracają z magazynu. Przerwane zadanie jest oznaczane jako nieudane; przed ponowieniem sprawdź kanał, by nie opublikować duplikatu.

## PostgreSQL i zachowanie danych

Jeśli ustawisz `DATABASE_URL`, bot i osobny panel WWW używają wspólnej tabeli `strefa_documents`. Migracja `001_json_documents.sql` zachowuje istniejące dokumenty JSONB. Migracja `002_ticket_embed_relations.sql` tworzy dodatkowe tabele ticketów, uczestników, zdarzeń, ocen, logów i obiektów embedów, a bezpieczne zasilenie tych tabel odbywa się z zachowanych dokumentów. Dokumenty JSON pozostają źródłem konfiguracji i są synchronizowane transakcyjnie z relacyjnymi projekcjami. Migracje są oznaczane w `strefa_schema_migrations`; nie ma operacji resetu, `DROP`, `TRUNCATE` ani kasowania rekordów. Przy pierwszym uruchomieniu istniejący `applications.json` lub `features.json` może zainicjować pusty rekord. Bez `DATABASE_URL` bot zachowuje dotychczasowy atomowy zapis JSON.

Lokalnie można przetestować migrację, ustawiając w `.env` `DATABASE_URL` i uruchamiając:

```bash
npm run db:migrate
npm run check
```

Następnie uruchom ponownie `npm start`. Przy bazie PostgreSQL bot odświeża wspólną konfigurację co 5 sekund. Rekordy całej konfiguracji modułów i podań są przechowywane jako JSONB, więc migracja nie zmienia dotychczasowego kształtu danych.

## GitHub Actions i Render

Workflow `.github/workflows/ci.yml` uruchamia `npm ci`, sprawdzenie składni, testy oraz kontrolę plików dla pushy i pull requestów do `main`. Repozytorium wskazane w rozmowie (`TEST2213121221/desktop-tutorial`) zawiera przykładową stronę GitHub Pages, a nie ten bot; nie zostało zmienione. Utwórz prywatne repozytorium bota i dopiero wtedy ustaw jego adres jako `origin` — nie należy publikować sekretów ani lokalnych danych.

`render.yaml` przygotowuje:

1. PostgreSQL w regionie Frankfurt.
2. Background Worker dla Gateway Discorda (jedna instancja).
3. Osobny Web Service dla panelu WWW, który komunikuje się z Discordem przez REST. Obie usługi mają ten sam magazyn PostgreSQL, sprawdzanie zdrowia panelu i wdrażanie po zaliczeniu kontroli CI.
4. Automatyczne wdrożenie dopiero po przejściu kontroli CI.

### Status procesu i diagnostyka

Panel WWW (`npm run panel`) korzysta z REST i nie uruchamia drugiego połączenia Gateway. Przy starcie pobiera tożsamość bota, sprawdza jej zgodność z `CLIENT_ID` oraz wczytuje członkostwo i uprawnienia na serwerze. Zapobiega to błędom `client.user === null` przy odczycie kanałów i uprawnień.

Worker zapisuje swój stan co 15 sekund w osobnym dokumencie `runtime:bot:<GUILD_ID>:<CLIENT_ID>` we wspólnej bazie PostgreSQL. Panel odczytuje go przez `/health` i `/api/session`; `botReady: true` z `botStatus: online` oznacza aktualne połączenie workera z serwerem. `offline` oznacza zapisane rozłączenie, a `stale` brak sygnału przez co najmniej 45 sekund. `unknown` oznacza brak sygnału lub wspólnej bazy; `unavailable` awarię odczytu; `configuration_mismatch` niezgodną tożsamość. Pole `botLastSeen` zawiera czas ostatniego sygnału. Samo `discordReady: true` potwierdza dostęp REST panelu, a nie stan workera. Odczyt stanu ma limit 2 sekund i nie blokuje zdrowia całego panelu przy awarii bazy.

**Obie usługi muszą używać tej samej bazy `DATABASE_URL`, tego samego `CLIENT_ID` i `GUILD_ID` oraz tokenu tej samej aplikacji.** `render.yaml` łączy je z jedną bazą przez `fromDatabase`. Status nie wymaga otwarcia portu workera ani dodatkowego sekretu. Interfejs odświeża status i listę podań co 10 sekund, a panel pobiera aktualne dane przed autoryzowanymi operacjami. Istniejące dane i migracje pozostają zachowane; dokument stanu nie zawiera tokenów i nie zmienia danych rekrutacji.

Po błędzie logowania worker zamyka HTTP, klienta Discord i bazę, a następnie kończy się kodem 1, zamiast pozostawać pozornie aktywnym procesem. Planowane zamknięcie zapisuje `offline`; zakończona instancja nie może oznaczyć nowego procesu jako wyłączony. Zapisy stanu nie blokują inicjalizacji ani zamykania dłużej niż 2 sekundy. Jeżeli odświeżenie danych w bazie nie odpowie w tym czasie, chronione API zwraca kontrolowane 503 zamiast zawieszać żądanie.

Po zalogowaniu bot tworzy prywatny kanał `status-bota` i wysyła **BOT ONLINE**. Kanał jest przeznaczony dla Administratorów, bota i opcjonalnej roli `STAFF_ROLE_ID`. Bot potrzebuje uprawnienia **Zarządzanie kanałami**, aby go utworzyć. Istniejący prywatny kanał o tej nazwie zostanie wykorzystany ponownie. Można też ustawić `BOT_STATUS_CHANNEL_ID` na ID własnego kanału tekstowego na tym samym serwerze; wtedy obowiązują uprawnienia wybranego kanału.

Na kanał trafiają wykryte błędy obsługi i połączenia oraz komunikat o planowanym wyłączeniu. Raporty pomijają sekrety i pełne stosy błędów, a powtarzające się błędy są ograniczane. Brak dostępu do kanału nie zatrzymuje rekrutacji. Przy błędzie tokenu, braku połączenia z Discordem albo nagłym zatrzymaniu hostingu bot nie może wysłać wiadomości — szczegóły należy wtedy sprawdzić w logach workera. Ostatnia wiadomość **BOT ONLINE** potwierdza udany start w podanej godzinie, a nie bieżący monitoring po nagłym wyłączeniu.

W Render utwórz Blueprint z `render.yaml`, wypełnij wymagane wartości sekretów (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `APPLICATION_CHANNEL_ID`, `ACCEPTED_ROLE_ID`, `CLIENT_SECRET`) dla obu usług, a potem sprawdź logi migracji i uruchomienia. W Discord Developer Portal dodaj OAuth2 Redirect URI:

```text
https://strefa-bot-panel.onrender.com/auth/discord/callback
```

Po skonfigurowaniu środowiska uruchom komendy Discord z lokalnego komputera (`npm run deploy`) z tym samym `.env`. Panel WWW będzie dostępny pod adresem usługi Web Service. Render Worker i PostgreSQL wymagają płatnych planów; Blueprint celowo nie używa darmowego hostingu ani sztucznych pingów.

### Migracja dotychczasowych danych

Przed pierwszym uruchomieniem usług na produkcji trzeba przenieść istniejące `applications.json` i `features.json` do środowiska z `DATABASE_URL`, zanim pierwszy proces utworzy puste rekordy. Na razie aplikacja nie ma polecenia importu już działającej bazy: najbezpieczniej wykonać eksport/backup i jednorazowo uruchomić bot z istniejącymi plikami JSON oraz docelowym `DATABASE_URL`, a dopiero potem podłączyć usługi Render. Nigdy nie uruchamiaj importu na istniejącej bazie bez kopii zapasowej.

## Zakres i weryfikacja

`npm run check` sprawdza składnię oraz testy automatyczne modułów, formularzy, migracji, plików wdrożeniowych, ticketów, embedów, planowania i dotychczasowej rekrutacji. Testy jednostkowe nie zastępują testu Discord API na serwerze ani sprawdzenia połączenia z prawdziwą bazą PostgreSQL. Wdrożenie Render, rejestracja komend Discord, OAuth2 i produkcyjna migracja danych nie zostały wykonane. Wymagają podłączenia właściwego repozytorium, sekretów, docelowej bazy i konfiguracji Discord Developer Portal.

Bot obsługuje wiele serwerów. `GUILD_ID` wskazuje główny serwer z dotychczasowymi danymi; kolejne mają oddzielną ekonomię, moderację, logi, weryfikację, auto kanały, statystyki i rekrutację. Rozszerzony system ticketów i zapisanych embedów rozróżnia serwery. Kreator embedów obsługuje teraz tytuł, opis, kolor, stopkę, obraz, podgląd, publikację, edycję istniejącej wiadomości, listę i usuwanie; szablony, przyciski użytkownika, import/export, harmonogram i cofanie wersji nie są jeszcze dostępne. W ticketach działają formularz 3 pól, limity, blacklist, przypisanie, transfer, uczestnicy, zamykanie/wznawianie, transkrypt do 1000 wiadomości, oceny, historia i podstawowe statystyki; edytor wielu kategorii/formularzy, przypomnienia, automatyczne zamykanie, CSV i raporty dzienne nie są jeszcze dostępne.

## Panel rekrutacji na Windows

Projekt udostępnia panel pod `http://localhost:3000` i odczytuje statystyki z tej samej bazy podań co bot.

1. W Discord Developer Portal → aplikacja bota → OAuth2 dodaj redirect URI: `http://localhost:3000/auth/discord/callback`.
2. W lokalnym `.env` wstaw `CLIENT_SECRET` z OAuth2 aplikacji. Nie używaj tu tokena bota i nie publikuj pliku `.env`.
3. Uruchom bot ponownie (`start-windows.bat` albo `npm start`), następnie otwórz `http://localhost:3000` i zaloguj się kontem z uprawnieniem Administrator lub Zarządzanie serwerem.

Panel pokazuje liczniki i listę ostatnich podań bez odpowiedzi kandydatów; decyzje nadal obsługują komendy bota. `localhost` działa tylko na komputerze, na którym działa bot. Publiczny link wymaga oddzielnego hostingu albo tunelu HTTPS.


## Usuwanie wiadomości

`/wyczysc liczba:50` usuwa ostatnie wiadomości na bieżącym kanale; opcjonalne `kanal` pozwala wybrać inny kanał tekstowy. Zakres to 1–100 wiadomości. Bot pomija wiadomości starsze niż 14 dni, pokazuje faktyczną liczbę usuniętych i zapisuje zbiorczy log moderacyjny. Użytkownik i bot muszą mieć na wybranym kanale uprawnienia Wyświetlanie kanału, Czytanie historii i Zarządzanie wiadomościami. Odpowiedź komendy jest prywatna. Komenda rejestruje się po uruchomieniu bota.

## Poziomy aktywności

Moduł Poziomy przyznaje domyślnie 15 XP za wiadomość (raz na 60 sekund) i 5 XP za pełną minutę rozmowy. Rozmowa wymaga co najmniej dwóch aktywnych osób; boty, AFK, wyciszenie i ogłuszenie są pomijane. Poziom wyznacza próg `100 × poziom²`. Czas offline nie jest doliczany.

Komendy `/level [uzytkownik]`, `/ranking` i administracyjna `/poziomy-ustaw wlaczone` rejestrują się przy uruchomieniu bota. Panel `#module-poziomy` pozwala włączać źródła XP, zmieniać tempo oraz definiować maksymalnie 20 ról nagród. Bot wymaga Zarządzania rolami i wyższej roli niż nagroda. Role otrzymuje się przy następnej nagrodzie XP; wyłączenie modułu zachowuje postęp. Dane są przechowywane we wspólnym dokumencie features PostgreSQL, oddzielnie dla serwera.


## Kilka serwerów Discord

- Link `/invite` w panelu oraz komenda `/zapros` pozwalają dodać bota do kolejnego serwera. Zaproszenie prosi o uprawnienia używane przez moduły, bez uprawnienia Administrator.
- Przy dołączeniu i po restarcie bot rejestruje komendy serwera. Każdy serwer ma własną instancję obsługi XP, formularzy, powitań i logów. Tickety i embedy nadal identyfikują dane przez `guildId`.
- Nowe moduły serwerów zapisują się w `features.serverModules[ID]`. Główny serwer korzysta ze starych pól bez kopiowania ani kasowania danych. Poziomy, powitania i pomysły zachowują dotychczasowe mapy `guilds`.
- Podania głównego serwera pozostają w dokumencie `applications`; inne serwery zapisują je w `applications:ID` i osobnych plikach `data/servers/ID/applications.json` przy pracy bez PostgreSQL. Nie należy udostępniać katalogu danych przez WWW.
- Na nowym serwerze użyj `/rekrutacja-ustaw kanal:... rola:...` (opcjonalnie `obsluga` i `logi`), następnie `/rekrutacja-panel`. Formularze i potwierdzenia usuwania są oddzielne dla każdego serwera.
- Po logowaniu w panelu wybierz serwer w menu po lewej. Lista zawiera tylko serwery z uprawnieniem Zarządzanie serwerem. Przy serwerach bez bota widoczna jest opcja dodania go. Po zmianie ról lub dołączeniu do nowego serwera zaloguj się ponownie, aby odświeżyć listę OAuth.
- Każda operacja sprawdza aktualne uprawnienia na wybranym serwerze. Zmiana serwera w innej karcie wymaga odświeżenia starszej karty przed zapisem. Bot musi mieć własną rolę wyżej niż role, które nadaje lub moderuje.
- W Discord Developer Portal aplikacja musi obsługiwać Guild Install. Jeżeli inne osoby mają zapraszać bota, właściciel aplikacji musi włączyć Public Bot. GUILD_ID i pozostałe dotychczasowe zmienne pozostają zgodne ze starszą konfiguracją.
