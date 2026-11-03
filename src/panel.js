import 'dotenv/config';
import { readConfig } from './config.js';
import { connectRestClient } from './rest-client.js';
import { WorkerStatus } from './worker-status.js';
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
const client = await connectRestClient(cfg);
const workerStatus = new WorkerStatus(cfg);
const server = startPanelServer({
  client, getApplications: () => applications.list(), featureStore, discordMode: 'rest',
  getWorkerStatus: () => workerStatus.read(),
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
