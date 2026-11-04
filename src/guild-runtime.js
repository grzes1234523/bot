import { guildStore, guildConfig } from './guild-store.js';
import { createFeatureHandlers } from './features.js';
import { createLevelSystem } from './levels.js';
import { createWelcomeSystem, createFarewellSystem } from './welcome.js';
import { createCommunitySystem } from './community.js';
import { createRecruitmentHandlers } from './recruitment.js';

export function createGuildRuntimes({ client, cfg, featureStore, applicationStore, applicationStores, reportFailure = () => {} }) {
  const runtimes = new Map();
  const get = guildId => {
    if (!guildId || !client.guilds.cache.has(guildId)) return null;
    if (!runtimes.has(guildId)) {
      const scoped = guildStore(featureStore, guildId, cfg.guildId);
      const scopedConfig = new Proxy(guildConfig(cfg, guildId), { get(target, key) {
        if (key === 'primaryGuildId') return cfg.guildId;
        if (key === 'serverName') return client.guilds.cache.get(guildId)?.name || target.serverName;
        if (['applicationChannelId', 'acceptedRoleId', 'staffRoleId', 'logChannelId', 'cooldownHours'].includes(key)) {
          const settings = scoped.snapshot().recruitment;
          return settings && Object.hasOwn(settings, key) ? settings[key] : target[key];
        }
        return target[key];
      } });
      const applications = applicationStores ? new Proxy({}, { get: (_, method) => (...args) => {
        const store = applicationStores.cached(guildId);
        if (!store) throw new Error('Baza rekrutacji serwera jest jeszcze ładowana.');
        return store[method](...args);
      } }) : applicationStore;
      runtimes.set(guildId, {
        features: createFeatureHandlers({ client, cfg: scopedConfig, featureStore: scoped, applicationStore: applications }),
        recruitment: createRecruitmentHandlers({ client, cfg: scopedConfig, store: applications, featureStore: scoped, reportFailure }),
        levels: createLevelSystem({ client, featureStore: scoped, guildId }),
        welcome: createWelcomeSystem({ featureStore: scoped, guildId }),
        farewell: createFarewellSystem({ featureStore: scoped, guildId }),
        community: createCommunitySystem({ client, featureStore: scoped, guildId }),
      });
    }
    return runtimes.get(guildId);
  };
  function proxy(module) {
    return new Proxy({}, { get: (_, method) => (...args) => {
      if (method === 'tick') return Promise.all([...client.guilds.cache.keys()].map(id => get(id)[module].tick()));
      const id = args[0]?.guildId ?? args[0]?.guild?.id ?? args[1]?.guild?.id ?? args[0]?.id;
      return get(id)?.[module]?.[method]?.(...args) ?? Promise.resolve();
    } });
  }
  return { get, remove: id => runtimes.delete(id), features: proxy('features'), levels: proxy('levels'), welcome: proxy('welcome'), farewell: proxy('farewell'), community: proxy('community') };
}
