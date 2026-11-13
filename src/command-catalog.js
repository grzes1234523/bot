import { commands } from './commands.js';
import { changelogCommands } from './changelog.js';
import { proCommands } from './pro-system.js';

const CATEGORIES = [
  [/^(rekrutacja)/, 'Rekrutacja'],
  [/^(statystyki)/, 'Statystyki'],
  [/^(ekonomia)/, 'Ekonomia'],
  [/^(auto-kanaly|kanal-wsparcia)/, 'Auto kanały'],
  [/^(moderacja|moderowane|wyczysc)/, 'Moderacja'],
  [/^(auto-mod)/, 'Auto Mod'],
  [/^(ticket)/, 'Tickets'],
  [/^(weryfikacja)/, 'Weryfikacja'],
  [/^(logi)/, 'Logi'],
  [/^(powitanie|pozegnanie)/, 'Powitania'],
  [/^(zabawa)/, 'Zabawy'],
  [/^(pomysl)/, 'Pomysły'],
  [/^(level|poziom|ranking)/, 'Poziomy'],
  [/^(embed)/, 'Embedy'],
  [/^(serwer|przebuduj|kategoria|kanal-dodaj|rola)/, 'Serwer'],
  [/^(aktualizacja)/, 'Aktualizacje'],
];

export function commandCategory(name) {
  const value = String(name ?? '');
  return CATEGORIES.find(([pattern]) => pattern.test(value))?.[1] ?? 'Ogólne';
}

function commandRows(command) {
  const json = typeof command.toJSON === 'function' ? command.toJSON() : command;
  const category = commandCategory(json.name);
  const rows = [];
  for (const option of json.options ?? []) {
    if (option.type === 1) rows.push({ name: `${json.name} ${option.name}`, description: option.description || json.description || '', category, usage: `/${json.name} ${option.name}` });
    if (option.type === 2) {
      for (const sub of option.options ?? []) {
        if (sub.type === 1) rows.push({ name: `${json.name} ${option.name} ${sub.name}`, description: sub.description || option.description || json.description || '', category, usage: `/${json.name} ${option.name} ${sub.name}` });
      }
    }
  }
  if (!rows.length) rows.push({ name: json.name, description: json.description || '', category, usage: `/${json.name}` });
  return rows;
}

let cached;
export function commandCatalog() {
  if (cached) return cached;
  const seen = new Set();
  cached = [...commands, ...changelogCommands, ...proCommands].flatMap(commandRows).filter(row => {
    if (seen.has(row.usage)) return false;
    seen.add(row.usage);
    return true;
  });
  return cached;
}
