import path from 'node:path';
import { ApplicationStore } from './store.js';

export function createGuildApplicationStores({ primaryStore, primaryGuildId, dataDirectory }) {
  const stores = new Map([[primaryGuildId, Promise.resolve(primaryStore)]]);
  const loaded = new Map([[primaryGuildId, primaryStore]]);
  return {
    cached: guildId => loaded.get(guildId),
    get(guildId) {
      if (!/^\d{17,20}$/.test(guildId)) throw new Error('Nieprawidłowy serwer Discord.');
      if (!stores.has(guildId)) {
        const store = new ApplicationStore(path.join(dataDirectory, 'servers', guildId, 'applications.json'), { documentKey: `applications:${guildId}` });
        stores.set(guildId, store.init().then(() => { loaded.set(guildId, store); return store; }).catch(error => { stores.delete(guildId); throw error; }));
      }
      return stores.get(guildId);
    },
    refresh: () => Promise.all([...loaded.values()].map(store => store.refresh())),
  };
}
