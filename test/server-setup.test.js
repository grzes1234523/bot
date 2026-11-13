import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ChannelType, Collection, PermissionFlagsBits as P } from 'discord.js';
import { commands } from '../src/commands.js';
import { initialState } from '../src/feature-store.js';
import { createFeatureHandlers } from '../src/features.js';
import { serverStructure } from '../src/server-structure.js';
import { buildChannelOverwrites, createServerSetupSystem, serverSetupCommands, validateStructure } from '../src/server-setup.js';

const roleCount = serverStructure.roles.length;
const categoryCount = serverStructure.categories.length;
const channelCount = serverStructure.categories.reduce((sum, category) => sum + category.channels.length, 0);
const dangerous = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks'];

function storeFor(state) {
  return { snapshot: () => structuredClone(state), update: async change => change(state) };
}
function fixture(options = {}) {
  let seq = 0;
  const channels = new Collection();
  const roles = new Collection();
  const created = [];
  const positioned = [];
  const sleeps = [];
  const deleted = [];
  const guild = {
    id: 'guild',
    features: options.features ?? ['COMMUNITY'],
    members: { fetchMe: async () => ({ permissions: { has: options.botHas ?? (() => true) }, roles: { highest: { position: options.botPosition ?? 80 } } }) },
    roles: {
      everyone: { id: 'guild' },
      fetch: async () => roles,
      create: async payload => {
        const role = { ...payload, id: `role-${++seq}`, name: payload.name, managed: false, position: 1, tags: {}, delete: async () => deleted.push(payload.name) };
        roles.set(role.id, role);
        created.push({ kind: 'role', ...payload });
        return role;
      },
      setPositions: async positions => positioned.push(positions),
    },
    channels: {
      fetch: async () => channels,
      create: async payload => {
        const channel = { id: `channel-${++seq}`, name: payload.name, type: payload.type, parentId: payload.parent ?? null, permissionOverwrites: payload.permissionOverwrites, availableTags: payload.availableTags, delete: async () => deleted.push(payload.name) };
        channels.set(channel.id, channel);
        created.push({ kind: 'channel', ...payload, id: channel.id });
        return channel;
      },
    },
  };
  const state = options.state ?? initialState();
  const replies = [];
  const interaction = {
    guildId: 'guild', guild, user: { id: 'admin' },
    memberPermissions: { has: options.memberHas ?? (() => true) },
    commandName: 'setup-serwera',
    options: { getString: name => (name === 'tryb' ? options.tryb ?? null : null) },
    deferReply: async () => {},
    reply: async payload => replies.push(payload),
    editReply: async payload => replies.push(payload),
  };
  const system = createServerSetupSystem({ client: { user: { id: 'bot' } }, featureStore: storeFor(state), primaryGuildId: 'guild', delayMs: 0, sleep: async ms => { sleeps.push(ms); } });
  return { channels, roles, created, positioned, sleeps, deleted, guild, state, replies, interaction, system };
}
const rolePayload = (fixture, text) => fixture.created.find(item => item.kind === 'role' && item.name.includes(text));
const channelPayload = (fixture, text) => fixture.created.find(item => item.kind === 'channel' && item.name.includes(text));
const allow = (overwrite, bit) => overwrite && (overwrite.allow & bit) === bit;
const deny = (overwrite, bit) => overwrite && (overwrite.deny & bit) === bit;

test('struktura ma unikalne klucze, bezpieczne uprawnienia i kolejność ról', () => {
  assert.equal(validateStructure(), null);
  const keys = [...serverStructure.roles.map(role => role.key), ...serverStructure.categories.flatMap(category => [category.key, ...category.channels.map(channel => channel.key)])];
  assert.equal(new Set(keys).size, keys.length);
  for (const role of serverStructure.roles) {
    if (role.key === 'owner' || role.key === 'admin') assert.deepEqual(role.permissions, ['Administrator']);
    else for (const name of dangerous) assert.equal(role.permissions.includes(name), false, role.name);
  }
  for (const key of ['red', 'blue', 'green', 'purple']) assert.deepEqual(serverStructure.roles.find(role => role.key === key).permissions, []);
  const order = serverStructure.roles.map(role => role.key);
  assert.ok(order.indexOf('recruit') < order.indexOf('bots') && order.indexOf('bots') < order.indexOf('booster') && order.indexOf('booster') < order.indexOf('vip'));
  assert.ok(order.indexOf('legend') < order.indexOf('novice') && order.indexOf('novice') < order.indexOf('red') && order.indexOf('purple') < order.indexOf('member'));
  assert.ok(serverStructure.roles.some(role => role.name.includes('Konkursy')));
  assert.ok(serverStructure.categories.some(category => category.name.includes('SPOŁECZNOŚĆ') && category.channels.some(channel => channel.name.includes('vip-lounge'))));
  assert.ok(serverStructure.categories.find(category => category.key === 'events-hub').channels.some(channel => channel.name.includes('konkursy')));
  assert.ok(serverStructure.categories.find(category => category.key === 'staff').channels.some(channel => channel.key === 'recruit-inbox'));
  const broken = structuredClone(serverStructure);
  broken.roles.find(role => role.key === 'helper').permissions.push('Administrator');
  assert.match(validateStructure(broken), /Administrator/);
});

test('uprawnienia kanałów: weryfikacja, logi, vip, gry i tylko odczyt', () => {
  const roles = serverStructure.roles;
  const roleIds = Object.fromEntries(roles.map((role, index) => [role.key, `r${index}`]));
  const of = (categoryKey, channelKey) => {
    const category = serverStructure.categories.find(item => item.key === categoryKey);
    const channel = channelKey ? category.channels.find(item => item.key === channelKey) : { kind: 'category', visibility: category.visibility, gameRole: category.gameRole };
    return buildChannelOverwrites({ channel, category, roles, roleIds, everyoneId: 'everyone', botId: 'bot' });
  };
  const row = (list, key) => list.find(item => item.id === roleIds[key]);
  const rules = of('start', 'rules');
  assert.ok(deny(row(rules, 'member'), P.SendMessages) && allow(row(rules, 'member'), P.ViewChannel));
  assert.ok(allow(row(rules, 'moderator'), P.SendMessages));
  const verification = of('start', 'verification');
  assert.ok(deny(row(verification, 'member'), P.ViewChannel));
  assert.ok(allow(row(verification, 'unverified'), P.ViewChannel) && allow(row(verification, 'unverified'), P.SendMessages));
  assert.ok(deny(row(verification, 'vip'), P.ViewChannel));
  const logs = of('staff', 'logs');
  assert.ok(deny(row(logs, 'helper'), P.ViewChannel) && deny(row(logs, 'recruit'), P.ViewChannel));
  assert.ok(allow(row(logs, 'moderator'), P.ViewChannel) && allow(row(logs, 'admin'), P.ViewChannel));
  const lounge = of('social', 'vip-lounge');
  assert.ok(deny(row(lounge, 'member'), P.ViewChannel));
  assert.ok(allow(row(lounge, 'vip'), P.ViewChannel) && allow(row(lounge, 'vip'), P.AttachFiles) && allow(row(lounge, 'vip'), P.EmbedLinks));
  assert.ok(allow(row(lounge, 'booster'), P.ViewChannel) && allow(row(lounge, 'booster'), P.AttachFiles));
  const chat = of('general', 'chat');
  assert.ok(deny(row(chat, 'unverified'), P.ViewChannel) && allow(row(chat, 'member'), P.ViewChannel));
  assert.equal(row(chat, 'vip').allow & P.ViewChannel, 0n);
  assert.ok(allow(row(chat, 'vip'), P.AttachFiles) && allow(row(chat, 'booster'), P.EmbedLinks));
  assert.ok(deny(row(chat, 'red'), P.ViewChannel));
  const game = of('game-minecraft', 'minecraft-text');
  assert.ok(deny(row(game, 'member'), P.ViewChannel) && allow(row(game, 'minecraft'), P.ViewChannel));
  const forum = of('games', 'lfg');
  assert.ok(allow(row(forum, 'member'), P.CreatePublicThreads));
});

test('komenda jest tylko dla administratora i rejestruje się jak pozostałe', () => {
  const command = serverSetupCommands[0].toJSON();
  assert.equal(command.name, 'setup-serwera');
  assert.equal(command.dm_permission, false);
  assert.equal(command.default_member_permissions, String(P.Administrator));
  assert.equal(command.options[0].name, 'tryb');
  assert.ok(command.options[0].choices.some(choice => choice.value === 'podglad'));
  assert.equal(commands.filter(item => item.name === 'setup-serwera').length, 1);
  const source = fs.readFileSync(new URL('../src/bot.js', import.meta.url), 'utf8');
  assert.match(source, /serverSetupCommands/);
  assert.match(source, /createServerSetupSystem/);
});

test('tworzy brakujący układ, podpina moduły i drugie wywołanie niczego nie dubluje', async () => {
  const f = fixture({ state: { ...initialState(), economy: { user: { balance: 70 } }, levels: { guilds: { guild: { settings: { messageXp: 23 }, users: { user: { xp: 100 } } } } }, recruitment: { acceptedRoleId: 'zostaw' } } });
  await f.system.command(f.interaction);
  assert.equal(f.created.filter(item => item.kind === 'role').length, roleCount);
  assert.equal(f.created.filter(item => item.kind === 'channel' && item.type === ChannelType.GuildCategory).length, categoryCount);
  assert.equal(f.created.filter(item => item.kind === 'channel' && item.type !== ChannelType.GuildCategory).length, channelCount);
  assert.equal(f.deleted.length, 0);
  assert.deepEqual(rolePayload(f, 'Czerwony').permissions, []);
  assert.ok(rolePayload(f, 'Właściciel').permissions.includes(P.Administrator));
  assert.ok(rolePayload(f, 'Admin').permissions.includes(P.Administrator));
  const moderator = rolePayload(f, 'Moderator');
  assert.ok(moderator.permissions.includes(P.KickMembers));
  for (const bit of [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels]) assert.equal(moderator.permissions.includes(bit), false);
  assert.equal(channelPayload(f, 'szukam-ekipy').type, ChannelType.GuildForum);
  assert.deepEqual(channelPayload(f, 'szukam-ekipy').availableTags.map(tag => tag.name), ['ranked', 'casual', 'PL', 'EN']);
  assert.equal(channelPayload(f, 'Turnieje').type, ChannelType.GuildStageVoice);
  const logsId = [...f.channels.values()].find(channel => channel.name.includes('logi')).id;
  assert.equal(f.state.logChannelId, logsId);
  assert.equal(f.state.autoChannels.joinChannelId, [...f.channels.values()].find(channel => channel.name.includes('Stwórz')).id);
  assert.equal(f.state.levels.guilds.guild.users.user.xp, 100);
  assert.equal(f.state.levels.guilds.guild.settings.messageXp, 23);
  assert.equal(f.state.levels.guilds.guild.settings.rewards.length, 4);
  assert.deepEqual(f.state.levels.guilds.guild.settings.rewards.map(item => item.level).sort((a, b) => a - b), [5, 15, 30, 50]);
  assert.equal(f.state.verification.roleId, [...f.roles.values()].find(role => role.name.includes('Członek')).id);
  assert.equal(f.state.verification.unverifiedRoleId, [...f.roles.values()].find(role => role.name.includes('Niezweryfikowany')).id);
  assert.equal(f.state.community.guilds.guild.settings.ideasChannelId, [...f.channels.values()].find(channel => channel.name.includes('pomysły')).id);
  assert.equal(f.state.welcome.guilds.guild.enabled, true);
  assert.equal(f.state.tickets.guildSettings.guild.supportRoleId, [...f.roles.values()].find(role => role.name.includes('Pomocnik')).id);
  assert.equal(f.state.recruitment.applicationChannelId, [...f.channels.values()].find(channel => channel.name.includes('rekrutacja-zgłoszenia')).id);
  assert.equal(f.state.recruitment.acceptedRoleId, 'zostaw');
  assert.equal(f.state.economy.user.balance, 70);
  assert.equal(f.positioned[0][0].role, [...f.roles.values()].find(role => role.name.includes('Właściciel')).id);
  assert.ok(f.positioned[0][0].position > f.positioned[0].at(-1).position);
  assert.match(f.replies.at(-1).content, /Utworzono: \d+ ról/);
  assert.match(f.replies.at(-1).content, /Niczego nie usunięto/);
  const before = f.created.length;
  f.state.logChannelId = 'custom-log';
  await f.system.command(f.interaction);
  assert.equal(f.created.length, before);
  assert.equal(f.roles.size, roleCount);
  assert.equal(f.channels.size, categoryCount + channelCount);
  assert.equal(f.deleted.length, 0);
  assert.equal(f.state.logChannelId, 'custom-log');
  assert.match(f.replies.at(-1).content, /Utworzono: 0 ról, 0 kategorii, 0 kanałów/);
});

test('podgląd, brak uprawnień i zajęta komenda niczego nie tworzą', async () => {
  const preview = fixture({ tryb: 'podglad', state: { ...initialState(), levels: { guilds: { guild: { settings: {}, users: { user: { xp: 5 } } } } } } });
  await preview.system.command(preview.interaction);
  assert.equal(preview.created.length, 0);
  assert.equal(preview.positioned.length, 0);
  assert.equal(preview.state.levels.guilds.guild.users.user.xp, 5);
  assert.equal(preview.state.logChannelId ?? null, null);
  assert.match(preview.replies.at(-1).content, /Podgląd/);
  assert.match(preview.replies.at(-1).content, /nic nie utworzono/i);
  assert.match(JSON.stringify(preview.replies.at(-1).embeds[0].toJSON()), /Właściciel/);
  assert.match(JSON.stringify(preview.replies.at(-1).embeds[0].toJSON()), /Konkursy/);

  const denied = fixture({ memberHas: () => false });
  await denied.system.command(denied.interaction);
  assert.equal(denied.created.length, 0);
  assert.match(denied.replies[0].content, /Administrator/);

  const unprivileged = fixture({ botHas: () => false });
  await unprivileged.system.command(unprivileged.interaction);
  assert.equal(unprivileged.created.length, 0);
  assert.match(unprivileged.replies[0].content, /Zarządzanie rolami/);
  assert.match(unprivileged.replies[0].content, /Zarządzanie kanałami/);

  const busy = fixture();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = busy.guild.roles.create;
  busy.guild.roles.create = async payload => { await gate; return original(payload); };
  const pending = busy.system.command(busy.interaction);
  const second = [];
  await busy.system.command({ ...busy.interaction, reply: async payload => second.push(payload), editReply: async payload => second.push(payload) });
  assert.match(second[0].content, /trwa już/);
  release();
  await pending;
  assert.equal(busy.deleted.length, 0);
});

test('booster, brak społeczności, limit i błąd uprawnień nie kasują istniejących elementów', async () => {
  const booster = fixture();
  booster.roles.set('native', { id: 'native', name: 'Server Booster', managed: true, position: 90, tags: { premiumSubscriberRole: true } });
  booster.roles.set('vip', { id: 'vip-existing', name: '⭐ VIP', managed: false, position: 2 });
  await booster.system.command(booster.interaction);
  assert.equal(booster.created.some(item => item.kind === 'role' && item.name.includes('Booster')), false);
  assert.equal(booster.created.some(item => item.kind === 'role' && item.name.includes('VIP')), false);
  const lounge = channelPayload(booster, 'vip-lounge');
  assert.ok(lounge.permissionOverwrites.some(item => item.id === 'native' && allow(item, P.AttachFiles)));
  assert.ok(lounge.permissionOverwrites.some(item => item.id === 'vip-existing' && allow(item, P.ViewChannel)));
  assert.match(booster.replies.at(-1).content, /Server Booster/);
  assert.equal(booster.positioned[0].some(item => item.role === 'native'), false);

  const plain = fixture({ features: [] });
  await plain.system.command(plain.interaction);
  assert.equal(plain.created.some(item => item.name?.includes('szukam-ekipy')), false);
  assert.equal(plain.created.some(item => item.name?.includes('Turnieje')), false);
  assert.ok(plain.created.some(item => item.name?.includes('czat')));
  assert.match(plain.replies.at(-1).content, /Społeczności/);

  const full = fixture();
  for (let index = 0; index < 250; index += 1) full.roles.set(`full-${index}`, { id: `full-${index}`, name: `Rola ${index}`, managed: false, position: 1 });
  await full.system.command(full.interaction);
  assert.equal(full.created.length, 0);
  assert.match(full.replies.at(-1).content, /limit 250/);
  assert.match(full.replies.at(-1).content, /Niczego nie utworzono/);

  const failed = fixture();
  failed.guild.channels.create = async () => { const error = new Error('odmowa'); error.code = 50013; throw error; };
  await failed.system.command(failed.interaction);
  assert.equal(failed.deleted.length, 0);
  assert.ok(failed.created.some(item => item.kind === 'role'));
  assert.match(failed.replies.at(-1).content, /uprawnień/);
  assert.match(failed.replies.at(-1).content, /Niczego nie usunięto/);
});

test('limit zapytań jest ponawiany, a brakujące uprawnienie bota nie trafia do roli', async () => {
  const limited = fixture();
  const original = limited.guild.roles.create;
  let attempts = 0;
  limited.guild.roles.create = async payload => {
    attempts += 1;
    if (attempts === 1) { const error = new Error('rate'); error.status = 429; error.retryAfter = 0; throw error; }
    return original(payload);
  };
  await limited.system.command(limited.interaction);
  assert.equal(limited.created.filter(item => item.kind === 'role').length, roleCount);
  assert.ok(limited.sleeps.includes(1000));

  const weak = fixture({ botHas: bit => bit !== P.Administrator && bit !== P.BanMembers });
  await weak.system.command(weak.interaction);
  assert.equal(rolePayload(weak, 'Właściciel').permissions.includes(P.Administrator), false);
  assert.equal(rolePayload(weak, 'Moderator').permissions.includes(P.BanMembers), false);
  assert.ok(rolePayload(weak, 'Moderator').permissions.includes(P.KickMembers));
  assert.match(weak.replies.at(-1).content, /nie dostanie uprawnień/);
});

test('weryfikacja zdejmuje rolę niezweryfikowanego tylko wtedy, gdy jest zapisana', async () => {
  const replies = [];
  const added = [];
  const removed = [];
  const state = { verification: { roleId: 'member', unverifiedRoleId: 'unverified' }, tickets: { items: [], guildSettings: {} }, autoChannels: { createdIds: [] } };
  const roles = new Collection([
    ['member', { id: 'member', managed: false, position: 1 }],
    ['unverified', { id: 'unverified', managed: false, position: 1 }],
  ]);
  const member = { roles: { cache: new Collection([['unverified', roles.get('unverified')]]), add: async role => added.push(role.id), remove: async role => removed.push(role.id) } };
  const handlers = createFeatureHandlers({ client: {}, cfg: { guildId: 'guild' }, featureStore: { snapshot: () => state, update: async change => change(state) } });
  await handlers.button({
    customId: 'strefa:verify:confirm', guildId: 'guild', user: { id: 'user' }, deferred: false, replied: false,
    reply: async payload => replies.push(payload),
    guild: { id: 'guild', roles: { fetch: async id => roles.get(id) }, members: { me: { permissions: { has: () => true }, roles: { highest: { position: 5 } } }, fetch: async () => member } },
  });
  assert.deepEqual(added, ['member']);
  assert.deepEqual(removed, ['unverified']);
  assert.match(replies.at(-1).content, /Zdjęto rolę/);

  state.verification.unverifiedRoleId = null;
  member.roles.cache.set('member', roles.get('member'));
  await handlers.button({
    customId: 'strefa:verify:confirm', guildId: 'guild', user: { id: 'user' }, deferred: false, replied: false,
    reply: async payload => replies.push(payload),
    guild: { id: 'guild', roles: { fetch: async id => roles.get(id) }, members: { me: { permissions: { has: () => true }, roles: { highest: { position: 5 } } }, fetch: async () => member } },
  });
  assert.deepEqual(removed, ['unverified']);
  assert.match(replies.at(-1).content, /Masz już rolę/);
});
