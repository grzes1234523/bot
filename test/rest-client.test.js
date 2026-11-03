import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, ClientUser, GatewayIntentBits, PermissionFlagsBits, Routes } from 'discord.js';
import { connectRestClient } from '../src/rest-client.js';

const botId = '123456789012345678';
const guildId = '123456789012345679';
const channelId = '123456789012345680';
const token = 'offline-test-token-never-sent';
const self = { id: botId, username: 'StrefaBot', discriminator: '0000', bot: true, avatar: null };

function fixture(t, { identity = self, failAt, failure } = {}) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  t.after(() => client.destroy());
  const calls = [];
  const permissions = (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks).toString();
  t.mock.method(client.rest, 'get', async route => {
    calls.push(route);
    if (route === failAt) throw failure;
    if (route === Routes.user('@me')) return structuredClone(identity);
    if (route === Routes.guild(guildId)) return {
      id: guildId, name: 'Testowy serwer', owner_id: '123456789012345681',
      features: [], emojis: [], roles: [],
    };
    if (route === Routes.guildChannels(guildId)) return [{
      id: channelId, guild_id: guildId, name: 'rekrutacja', type: 0, permission_overwrites: [],
    }];
    if (route === Routes.guildRoles(guildId)) return [{
      id: guildId, name: '@everyone', color: 0, hoist: false, managed: false,
      position: 0, permissions, mentionable: false,
    }];
    if (route === Routes.guildMember(guildId, botId)) return {
      user: structuredClone(self), roles: [], joined_at: '2026-01-01T00:00:00Z',
      deaf: false, mute: false, flags: 0,
    };
    throw new Error(`Nieoczekiwane wywołanie REST w teście: ${route}`);
  });
  t.mock.method(client, 'login', () => { throw new Error('Panel REST nie może otwierać Gateway'); });
  return { client, calls };
}

test('panel REST inicjalizuje prawdziwe ClientUser i guild.members.me bez Gateway', async t => {
  const { client, calls } = fixture(t);
  assert.equal(client.user, null);
  const connected = await connectRestClient({ token, clientId: botId, guildId, client });
  assert.equal(connected, client);
  assert.ok(client.user instanceof ClientUser);
  assert.equal(client.user.id, botId);
  assert.equal(client.users.cache.get(botId), client.user);
  assert.equal(client.isReady(), false, 'REST nie podszywa się pod gotowy Gateway');
  assert.equal(client.login.mock.callCount(), 0);
  assert.equal(calls[0], Routes.user('@me'));
  const guild = client.guilds.cache.get(guildId);
  const me = guild.members.me;
  assert.equal(me.id, botId);
  assert.equal((await guild.members.fetchMe()).id, botId);
  assert.ok(guild.channels.cache.get(channelId).permissionsFor(me).has(PermissionFlagsBits.SendMessages));
  assert.ok(calls.includes(Routes.guildMember(guildId, botId)));
});

test('odrzucony token kończy bootstrap, niszczy klienta i nie ujawnia tokenu', async t => {
  const failure = Object.assign(new Error(`Unauthorized: token=${token}`), { status: 401, code: 0 });
  const { client, calls } = fixture(t, { failAt: Routes.user('@me'), failure });
  const destroy = t.mock.method(client, 'destroy');
  await assert.rejects(connectRestClient({ token, clientId: botId, guildId, client }), error => {
    assert.equal(error.name, 'DiscordRestBootstrapError');
    assert.equal(error.status, 401);
    assert.equal(error.code, 0);
    assert.match(error.message, /Unauthorized/);
    assert.ok(!error.message.includes(token));
    assert.equal(error.cause, undefined, 'oryginalny błąd z sekretem nie trafia do logów jako cause');
    return true;
  });
  assert.equal(destroy.mock.callCount(), 1);
  assert.equal(client.user, null);
  assert.equal(client.users.cache.size, 0);
  assert.deepEqual(calls, [Routes.user('@me')]);
});

test('panel odrzuca token innej aplikacji zamiast łączyć dwa różne boty', async t => {
  const { client, calls } = fixture(t, { identity: { ...self, id: '123456789012345682' } });
  await assert.rejects(connectRestClient({ token, clientId: botId, guildId, client }), /innej aplikacji niż CLIENT_ID/);
  assert.deepEqual(calls, [Routes.user('@me')]);
  assert.equal(client.user, null);
});

test('panel odrzuca konto niebędące botem przed pobraniem danych serwera', async t => {
  const { client, calls } = fixture(t, { identity: { ...self, bot: false } });
  await assert.rejects(connectRestClient({ token, clientId: botId, guildId, client }), /musi być tokenem bota/);
  assert.deepEqual(calls, [Routes.user('@me')]);
  assert.equal(client.user, null);
});

test('brak dostępu do serwera czyści częściowo zainicjalizowaną tożsamość', async t => {
  const { client } = fixture(t, {
    failAt: Routes.guild(guildId),
    failure: Object.assign(new Error('Missing Access'), { status: 403, code: 50001 }),
  });
  await assert.rejects(connectRestClient({ token, clientId: botId, guildId, client }), error => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 50001);
    assert.match(error.message, /Missing Access/);
    return true;
  });
  assert.equal(client.user, null);
  assert.equal(client.users.cache.size, 0);
});
