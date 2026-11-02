import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { readConfig } from './config.js';
import { startPanelServer } from './panel-server.js';
import { ApplicationStore } from './store.js';
import { FeatureStore } from './feature-store.js';
import { closeDatabase } from './database.js';
import path from 'node:path';

const cfg = readConfig();
const dataDirectory = process.env.STREFA_BOT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const applications = new ApplicationStore(path.join(dataDirectory, 'applications.json'));
const featureStore = new FeatureStore(path.join(dataDirectory, 'features.json'));
await Promise.all([applications.init(), featureStore.init()]);

// Panel WWW korzysta z Discord REST, ale nie otwiera drugiego połączenia Gateway.
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.rest.setToken(cfg.token);
const guild = await client.guilds.fetch(cfg.guildId);
await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
client.isReady = () => true;
const server = startPanelServer({ client, getApplications: () => applications.list(), featureStore });
let shutdownPromise;

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await new Promise(resolve => server.close(resolve));
    client.destroy();
    await closeDatabase().catch(() => {});
  })();
  return shutdownPromise;
}
process.once('SIGINT', () => { void shutdown().catch(error => console.error('Błąd zamykania panelu:', error)); });
process.once('SIGTERM', () => { void shutdown().catch(error => console.error('Błąd zamykania panelu:', error)); });
process.on('unhandledRejection', error => console.error('Nieobsłużona obietnica panelu:', error));
