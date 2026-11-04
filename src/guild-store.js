import { initialState } from './feature-store.js';
import { PermissionFlagsBits } from 'discord.js';

// Starszy serwer zachowuje dokładnie dotychczasowe dane. Nowe serwery dostają
// niezależne ustawienia; dokumenty z własnym guildId pozostają wspólne.
const sharedKeys = new Set(['levels', 'welcome', 'farewell', 'community', 'tickets', 'embeds']);
const localKeys = [...Object.keys(initialState()), 'logging', 'botLogs', 'serverStatistics', 'recruitment']
  .filter(key => !sharedKeys.has(key));

export function guildStore(root, guildId, primaryGuildId) {
  if (guildId === primaryGuildId) return root;
  if (!/^\d{17,20}$/.test(guildId)) throw new Error('Nieprawidłowy serwer Discord.');
  function view(state) {
    const defaults = initialState(), local = state.serverModules?.[guildId] ?? {};
    const result = { ...state };
    for (const key of localKeys) {
      if (Object.hasOwn(local, key)) result[key] = local[key];
      else if (Object.hasOwn(defaults, key)) result[key] = defaults[key];
      else delete result[key];
    }
    return result;
  }
  return {
    snapshot: () => structuredClone(view(root.snapshot())),
    refresh: async () => { await root.refresh?.(); return structuredClone(view(root.snapshot())); },
    update: change => root.update(async state => {
      const scoped = view(state);
      const result = await change(scoped);
      state.serverModules ??= {};
      const local = state.serverModules[guildId] ??= {};
      for (const key of localKeys) {
        if (Object.hasOwn(scoped, key)) local[key] = scoped[key];
        else delete local[key];
      }
      for (const key of sharedKeys) if (Object.hasOwn(scoped, key)) state[key] = scoped[key];
      return result;
    }),
  };
}

export function guildConfig(cfg, guildId) {
  if (guildId === cfg.guildId) return cfg;
  return { ...cfg, guildId, staffRoleId: null, logChannelId: null, applicationChannelId: null, acceptedRoleId: null, botStatusChannelId: null };
}

export function botInvite(clientId, guildId = '') {
  const permissions = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'AddReactions', 'ManageChannels', 'ManageRoles', 'ManageMessages', 'ManageGuild', 'KickMembers', 'BanMembers', 'ModerateMembers', 'MoveMembers', 'Connect', 'SendMessagesInThreads', 'ManageThreads']
    .reduce((bits, key) => bits | PermissionFlagsBits[key], 0n);
  const query = new URLSearchParams({ client_id: clientId, scope: 'bot applications.commands', integration_type: '0', permissions: String(permissions) });
  if (guildId) query.set('guild_id', guildId);
  return `https://discord.com/oauth2/authorize?${query}`;
}
