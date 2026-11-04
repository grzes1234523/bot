import 'dotenv/config';
import { readConfig } from './config.js';
import { connectRestClient } from './rest-client.js';
import { WorkerStatus } from './worker-status.js';
import { createGuildApplicationStores } from './guild-applications.js';
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
const applicationStores = createGuildApplicationStores({ primaryStore: applications, primaryGuildId: cfg.guildId, dataDirectory });

// Panel WWW korzysta z Discord REST, ale nie otwiera drugiego połączenia Gateway.
const client = await connectRestClient(cfg);
const workerStatus = new WorkerStatus(cfg);
const server = startPanelServer({
  client, getApplications: () => applications.list(), featureStore, discordMode: 'rest',
  getWorkerStatus: (guildId = cfg.guildId) => guildId === cfg.guildId ? workerStatus.read() : new WorkerStatus({ ...cfg, guildId }).read(),
  getGuildApplications: async id => { const store = await applicationStores.get(id); await store.refresh(); return store.list(); },
  refreshData: () => Promise.all([applications.refresh(), featureStore.refresh()]),
});
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
