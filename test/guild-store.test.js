import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Collection, PermissionFlagsBits } from 'discord.js';
import { FeatureStore, initialState } from '../src/feature-store.js';
import { guildStore, guildConfig, botInvite } from '../src/guild-store.js';
import { createGuildRuntimes } from '../src/guild-runtime.js';
import { createGuildApplicationStores } from '../src/guild-applications.js';
import { ApplicationStore } from '../src/store.js';

const main = '123456789012345670', second = '123456789012345671';
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strefa-guilds-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = new FeatureStore(path.join(directory, 'features.json')); await root.init();
  const primaryStore = new ApplicationStore(path.join(directory, 'applications.json')); await primaryStore.init();
  const apps = createGuildApplicationStores({ primaryStore, primaryGuildId: main, dataDirectory: directory });
  const client = { guilds: { cache: new Collection([[main, { id: main, name: 'Strefa' }], [second, { id: second, name: 'Nowy' }]]) } };
  const cfg = { guildId: main, clientId: '123456789012345678', staffRoleId: 'stara-rola', logChannelId: 'stare-logi', acceptedRoleId: 'przyjety', applicationChannelId: 'podania', cooldownHours: 24 };
  const runtimes = createGuildRuntimes({ client, cfg, featureStore: root, applicationStore: primaryStore, applicationStores: apps });
  return { root, apps, primaryStore, runtimes, cfg, client, directory };
}
test('nowy serwer ma czyste ustawienia; zapisy i restart zachowują dane głównego', async t => {
  const { root, directory } = await fixture(t);
  await root.update(state => { state.economy.u = { balance: 999 }; state.verification.roleId = 'stara'; });
  const scoped = guildStore(root, second, main);
  assert.deepEqual(scoped.snapshot().economy, {}); assert.equal(scoped.snapshot().verification.roleId, null);
  await scoped.update(state => { state.economy.u = { balance: 20 }; state.verification.roleId = 'nowa'; state.logging = { enabled: false }; });
  assert.equal(root.snapshot().economy.u.balance, 999); assert.equal(root.snapshot().verification.roleId, 'stara');
  const reopened = new FeatureStore(path.join(directory, 'features.json')); await reopened.init();
  const restarted = guildStore(reopened, second, main);
  assert.equal(restarted.snapshot().economy.u.balance, 20); assert.equal(restarted.snapshot().logging.enabled, false);
  await restarted.update(state => { state.levels.guilds[second] = { users: { u: { xp: 15 } } }; });
  assert.equal(reopened.snapshot().levels.guilds[second].users.u.xp, 15);
  assert.equal(guildStore(root, main, main), root);
});
test('runtime kieruje tę samą komendę użytkownika do salda właściwego serwera', async t => {
  const f = await fixture(t); const replies = [];
  const interaction = id => ({ guildId: id, commandName: 'ekonomia-daily', user: { id: 'u' }, reply: async payload => replies.push(payload.content) });
  await f.runtimes.features.command(interaction(main)); await f.runtimes.features.command(interaction(second));
  assert.equal(f.root.snapshot().economy.u.balance, 200);
  assert.equal(guildStore(f.root, second, main).snapshot().economy.u.balance, 200);
  await f.runtimes.features.command(interaction(second));
  assert.match(replies[2], /Następna|nagrod|Dzienn/i);
  assert.equal(f.root.snapshot().economy.u.balance, 200);
});
test('bazy rekrutacji są oddzielne, również po ponownym otwarciu', async t => {
  const f = await fixture(t); const a = await f.apps.get(main), b = await f.apps.get(second);
  assert.equal(await f.apps.get(second), b);
  await a.create({ id: 'SAME', userId: 'u', status: 'pending' }, 0);
  await b.create({ id: 'SAME', userId: 'u', status: 'pending' }, 0);
  await b.update('SAME', app => { app.status = 'rejected'; });
  assert.equal(a.get('SAME').status, 'pending'); assert.equal(b.get('SAME').status, 'rejected');
  assert.equal(f.apps.cached(second), b);
  const reopened = createGuildApplicationStores({ primaryStore: a, primaryGuildId: main, dataDirectory: f.directory });
  assert.equal((await reopened.get(second)).get('SAME').status, 'rejected');
});
test('formularze rekrutacji tego samego użytkownika nie przechodzą pomiędzy serwerami', async t => {
  const f = await fixture(t); await f.apps.get(second);
  const modals = [], replies = [];
  const interaction = guildId => ({ guildId, guild: { id: guildId }, customId: 'recruitment:apply', user: { id: 'u' }, showModal: async modal => modals.push(modal.toJSON()), reply: async payload => replies.push(payload.content) });
  await f.runtimes.get(main).recruitment.button(interaction(main));
  const token = modals[0].custom_id.split(':').at(-1);
  await f.runtimes.get(second).recruitment.button({ ...interaction(second), customId: `recruitment:form-next:2:${token}` });
  assert.equal(modals.length, 1); assert.match(replies[0], /wygasł/);
});
test('zaproszenie zawiera scope komend, uprawnienia modułów i wybrany serwer bez Administratora', () => {
  const link = new URL(botInvite('123456789012345678', second));
  assert.equal(link.searchParams.get('guild_id'), second); assert.equal(link.searchParams.get('scope'), 'bot applications.commands');
  const bits = BigInt(link.searchParams.get('permissions'));
  assert.equal(bits & PermissionFlagsBits.Administrator, 0n); assert.ok(bits & PermissionFlagsBits.ManageMessages);
  assert.equal(guildConfig({ guildId: main, staffRoleId: 'admin', logChannelId: 'log' }, second).staffRoleId, null);
});

test('konfiguracja rekrutacji zapisuje kanał i rolę wyłącznie wybranego serwera', async t => {
  const f = await fixture(t); await f.apps.get(second);
  const replies = [], role = { id: 'role-new', guild: { id: second }, editable: true };
  const channel = { id: 'applications-new', guildId: second, permissionsFor: () => ({ has: () => true }) };
  const i = { commandName: 'rekrutacja-ustaw', guildId: second, guild: { id: second, members: { me: {} } }, memberPermissions: { has: () => true }, options: { getRole: name => name === 'rola' ? role : null, getChannel: name => name === 'kanal' ? channel : null }, deferReply: async () => { i.deferred = true; }, editReply: async payload => replies.push(payload.content), reply: async payload => replies.push(payload.content) };
  await f.runtimes.get(second).recruitment.command(i);
  assert.equal(guildStore(f.root, second, main).snapshot().recruitment.applicationChannelId, channel.id);
  assert.equal(f.root.snapshot().recruitment, undefined); assert.equal(f.cfg.applicationChannelId, 'podania');
  role.guild.id = main;
  await f.runtimes.get(second).recruitment.command(i);
  assert.match(replies.at(-1), /Wybierz rolę/);
});
