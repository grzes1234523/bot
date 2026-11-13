/** Jedno źródło wpisów o zmianach bota i strony. Daty pochodzą z historii gita. */
export const changelogReleases = [
  {
    id: '2026.11.13-panel',
    version: '2026.11.13-panel',
    date: '2026-11-13',
    zmienione: [
      'Pulpit serwera pokazuje nazwę i ikonę, liczbę członków, osoby online oraz stan bota.',
      'Sekcja „Ostatnie aktualizacje” korzysta z tej samej historii wersji co karty powyżej.',
    ],
    dodane: [
      'Karty modułów, wyszukiwarka komend, pierwsze kroki i menu na telefonie.',
      'Ikona strony pod adresem /favicon.ico.',
    ],
    usuniete: [],
  },
  {
    id: '2026.11.12-admin',
    version: '2026.11.12-admin',
    date: '2026-11-12',
    zmienione: [
      'Na głównym serwerze wpisy changelogu trafiają do istniejącego kanału o ID z CHANGELOG_CHANNEL_ID (domyślnie 1570530877379977296), a nie do nowo tworzonego informacja-bot.',
      'Ten kanał jest widoczny tylko dla administracji: @everyone nie widzi kanału, a widzą go role z uprawnieniem Administrator, skonfigurowana rola STAFF i bot.',
    ],
    dodane: [
      'Zmienna CHANGELOG_CHANNEL_ID wskazuje kanał informacji na głównym serwerze. Na pozostałych serwerach bot nadal tworzy kanał informacja-bot.',
    ],
    usuniete: [],
  },
  {
    id: '2026.11.12-11',
    version: '2026.11.12-11',
    date: '2026-11-12',
    zmienione: [
      'Po zalogowaniu przez Discord panel otwiera „Twoje centrum dowodzenia” dla wybranego serwera, a nie siatkę kart serwerów.',
      'Serwerem startowym jest skonfigurowany GUILD_ID, jeśli konto może nim zarządzać i bot jest na tym serwerze. W przeciwnym razie używany jest pierwszy serwer, na którym jest bot i konto ma uprawnienie Zarządzanie serwerem.',
    ],
    dodane: [
      'Przycisk „Zmień serwer” w centrum dowodzenia prowadzi do istniejącej strony /wybor-serwera.',
    ],
    usuniete: [],
  },
  {
    id: '2026.11.12-10',
    version: '2026.11.12-10',
    date: '2026-11-12',
    zmienione: [
      'Karta poziomu używa zapisu „Łącznie” z wielkiej litery.',
      'Usługa panelu na Render wdraża się po zielonym sprawdzeniu CI (checksPass), tak jak worker bota.',
      'Po logowaniu Discord i pod adresem /#server-control widać „Twoje centrum dowodzenia”. Adres #server-dashboard pokazuje ten sam widok.',
    ],
    dodane: [
      'Naprawiono składnię skryptu centrum dowodzenia, więc karty serwerów znowu się ładują.',
    ],
    usuniete: [
      'Stary widok „Centrum serwera” nie jest już stroną, na którą trafia zalogowana osoba.',
    ],
  },
  {
    id: '2026.11.11',
    version: '2026.11.11',
    date: '2026-11-11',
    zmienione: [
      'Ładowanie centrum dowodzenia po zalogowaniu i wyborze serwera zostało poprawione.',
    ],
    dodane: [
      'Neonowe „Twoje centrum dowodzenia” jako strona panelu po logowaniu Discord.',
    ],
    usuniete: [],
  },
  {
    id: '2026.11.10',
    version: '2026.11.10',
    date: '2026-11-10',
    zmienione: [
      'Sekcja serwera i kanałów w panelu dostała neonowy motyw Discord.',
    ],
    dodane: [],
    usuniete: [],
  },
  {
    id: '2026.11.09',
    version: '2026.11.09',
    date: '2026-11-09',
    zmienione: [
      'Karta poziomu pokazuje procent XP i kolejny próg.',
    ],
    dodane: [
      'Strona /aktualizacje oraz komenda /aktualizacja.',
      'Wyszukiwarka, filtry i sortowanie na stronie aktualizacji.',
      'Wybór serwera v3 połączony z Discord OAuth2 i panelem.',
      'Demonstracyjny podgląd poziomów XP w panelu.',
    ],
    usuniete: [],
  },
  {
    id: '2026.11.08',
    version: '2026.11.08',
    date: '2026-11-08',
    zmienione: [
      'Menu panelu jest podzielone na grupy zarządzania, zabawy i moderacji.',
      'Logi i Automatyzacje są w menu pod Weryfikacją.',
      'Komendy administracyjne są oddzielone od komend graczy.',
    ],
    dodane: [
      'Trzy trwałe gry na przyciskach oraz ich opisy w panelu Zabawy.',
      'Komenda ticket-admin.',
    ],
    usuniete: [],
  },
  {
    id: '2026.11.05',
    version: '2026.11.05',
    date: '2026-11-05',
    zmienione: [
      'Odświeżanie liczników pobiera pełniejszą listę członków.',
      'Rejestracja komend przerywa się po utracie dostępu do serwera i nie powtarza tej samej próby.',
    ],
    dodane: [
      'Karta poziomu z avatarem, rankingiem i paskiem XP oraz komenda poziom.',
      'Cztery warianty kanałów, kategorii i ról w przebudowie serwera.',
      'Komendy bezpiecznego dodawania kanałów, kategorii i ról.',
      'Prosta komenda przebuduj-serwer oraz przebudowa z potwierdzeniem identyfikatora serwera.',
      'Odświeżanie pełnej listy serwerów Discord i wybór serwera w panelu.',
    ],
    usuniete: [
      'Zbędne przyciski serwerów zostały usunięte z menu panelu.',
    ],
  },
];

const SECTION_KEYS = ['zmienione', 'dodane', 'usuniete'];

export function parseRelease(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Nieprawidłowy wpis changelogu.');
  const id = String(entry.id ?? '').trim();
  const version = String(entry.version ?? '').trim();
  const date = String(entry.date ?? '').trim();
  if (!/^[a-z0-9][a-z0-9.-]{0,40}$/i.test(id)) throw new Error('Brak poprawnego identyfikatora wpisu.');
  if (!version || version.length > 40) throw new Error('Brak wersji wpisu.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Data wpisu musi mieć format RRRR-MM-DD.');
  const sections = {};
  for (const key of SECTION_KEYS) {
    const items = entry[key] ?? [];
    if (!Array.isArray(items) || items.some(item => typeof item !== 'string' || !item.trim() || item.length > 300)) throw new Error(`Sekcja ${key} zawiera nieprawidłowy punkt.`);
    sections[key] = items.map(item => item.trim());
  }
  return { id, version, date, ...sections };
}

export function loadReleases(entries = changelogReleases) {
  const seen = new Set();
  return entries.map(parseRelease).map(release => {
    if (seen.has(release.id)) throw new Error(`Powtórzony identyfikator ${release.id}.`);
    seen.add(release.id);
    return release;
  });
}
