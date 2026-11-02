import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readConfig } from './config.js';
import { commands } from './commands.js';
import { proCommands } from './pro-system.js';

export async function deployCommands(config = readConfig()) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = Routes.applicationGuildCommands(config.clientId, config.guildId);
  // POST aktualizuje komendy o tych samych nazwach; NIE kasuje pozostałych komend aplikacji.
  for (const command of commands) {
    await rest.post(route, { body: command.toJSON() });
    console.log(`✅ Zarejestrowano /${command.name}`);
  }
  const globalRoute = Routes.applicationCommands(config.clientId);
  for (const command of proCommands) {
    await rest.post(globalRoute, { body: command.toJSON() });
    console.log(`✅ Zarejestrowano globalnie /${command.name}`);
  }
  console.log('Komendy serwera oraz wieloserwerowe komendy ticketów i embedów zarejestrowane.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  deployCommands().catch(error => {
    console.error('Błąd rejestracji komend:', error);
    process.exitCode = 1;
  });
}
