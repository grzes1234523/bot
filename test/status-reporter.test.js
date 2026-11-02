import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Collection, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { BotStatusReporter, sanitizeDiagnostic } from '../src/status-reporter.js';

const GUILD_ID = '12345678901234567';
const BOT_ID = '23456789012345678';
const STAFF_ID = '34567890123456789';

function setEnv(t, key, value) {
  const previous = process.env[key];
  if (value == null) delete process.env[key]; else process.env[key] = value;
  t.after(() => { if (previous == null) delete process.env[key]; else process.env[key] = previous; });
}

function fixture(t, { ready = true, manageChannels = true, canSend = true, sendError } = {}) {
  setEnv(t, 'BOT_STATUS_CHANNEL_ID', null);
  let time = 1_700_000_000_000;
  const sent = [];
  const created = [];
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  const channels = new Collection();
  const me = {
    id: BOT_ID,
    permissions: new PermissionsBitField(manageChannels ? [PermissionFlagsBits.ManageChannels] : []),
  };
  const makeChannel = ({ id = '45678901234567890', name = 'status-bota', privateChannel = true, guildId = GUILD_ID, type = ChannelType.GuildText } = {}) => ({
    id, name, guildId, type,
    permissionOverwrites: { cache: new Collection([
      [GUILD_ID, { id: GUILD_ID, allow: new PermissionsBitField(), deny: new PermissionsBitField(privateChannel ? [PermissionFlagsBits.ViewChannel] : []) }],
      [BOT_ID, { id: BOT_ID, allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel]), deny: new PermissionsBitField() }],
    ]) },
    permissionsFor: () => new PermissionsBitField(canSend ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] : []),
    async send(payload) { sent.push(payload); if (sendError) throw sendError; return { id: 'message' }; },
  });
  const guild = {
    id: GUILD_ID,
    roles: { everyone: { id: GUILD_ID } },
    members: { me },
    channels: {
      async fetch(id) { return id ? channels.get(id) : channels; },
      async create(options) {
        created.push(options);
        const channel = makeChannel();
        channels.set(channel.id, channel);
        return channel;
      },
    },
  };
  const client = { isReady: () => ready, user: { id: BOT_ID, tag: 'StrefaBot#1234' }, guilds: { cache: new Collection([[GUILD_ID, guild]]), fetch: async () => guild } };
  const cfg = { guildId: GUILD_ID, clientId: BOT_ID, staffRoleId: STAFF_ID, token: 'local-test-token-value' };
  const reporter = new BotStatusReporter({ client, cfg, now: () => time });
  return { reporter, client, cfg, guild, channels, makeChannel, sent, created, warnings, advance: ms => { time += ms; } };
}

test('tworzy prywatny kanał i wysyła BOT ONLINE bez pingów', async t => {
  const f = fixture(t);
  assert.equal(await f.reporter.online(), true);
  assert.equal(f.created.length, 1);
  const options = f.created[0];
  assert.equal(options.name, 'status-bota');
  assert.equal(options.type, ChannelType.GuildText);
  const everyone = options.permissionOverwrites.find(item => item.id === GUILD_ID);
  assert.ok(everyone.deny.includes(PermissionFlagsBits.ViewChannel));
  const bot = options.permissionOverwrites.find(item => item.id === BOT_ID);
  assert.ok(bot.allow.includes(PermissionFlagsBits.SendMessages));
  const staff = options.permissionOverwrites.find(item => item.id === STAFF_ID);
  assert.ok(staff.allow.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(staff.deny.includes(PermissionFlagsBits.SendMessages));
  assert.equal(f.sent[0].embeds[0].toJSON().title, '🟢 BOT ONLINE');
  assert.match(f.sent[0].embeds[0].toJSON().description, /StrefaBot#1234/);
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [] });
});

test('używa ponownie prywatnego kanału po restarcie zamiast tworzyć kolejny', async t => {
  const f = fixture(t);
  const existing = f.makeChannel();
  f.channels.set(existing.id, existing);
  await f.reporter.online();
  await f.reporter.info('Połączenie przywrócone', 'Bot ponownie odpowiada.');
  await f.reporter.offline();
  assert.equal(f.created.length, 0);
  assert.equal(f.sent.length, 3);
  assert.match(f.sent[2].embeds[0].toJSON().title, /BOT OFFLINE/);
});

test('nie przejmuje publicznego kanału o tej samej nazwie i nie zmienia uprawnień', async t => {
  const f = fixture(t);
  const existing = f.makeChannel({ privateChannel: false });
  f.channels.set(existing.id, existing);
  assert.equal(await f.reporter.online(), false);
  assert.equal(f.created.length, 0);
  assert.equal(f.sent.length, 0);
  assert.match(f.warnings.join(' '), /publiczny lub nieznany dostęp/);
});

test('wybrany kanał musi należeć do skonfigurowanego serwera i być tekstowy', async t => {
  const f = fixture(t);
  setEnv(t, 'BOT_STATUS_CHANNEL_ID', 'configured-channel');
  f.channels.set('configured-channel', f.makeChannel({ guildId: 'other-guild' }));
  assert.equal(await f.reporter.online(), false);
  assert.equal(f.sent.length, 0);
  f.channels.set('configured-channel', f.makeChannel({ type: ChannelType.GuildVoice }));
  assert.equal(await f.reporter.online(), false);
  assert.equal(f.sent.length, 0);
  f.channels.set('configured-channel', f.makeChannel({ privateChannel: false }));
  assert.equal(await f.reporter.online(), true);
  assert.equal(f.created.length, 0);
});

test('brak Zarządzania kanałami albo dostępu do wysyłania nie zatrzymuje bota', async t => {
  const f = fixture(t, { manageChannels: false });
  assert.equal(await f.reporter.online(), false);
  assert.match(f.warnings.join(' '), /Zarządzanie kanałami/);
  assert.equal(f.created.length, 0);
  const g = fixture(t, { canSend: false });
  const channel = g.makeChannel();
  g.channels.set(channel.id, channel);
  assert.equal(await g.reporter.online(), false);
  assert.equal(g.sent.length, 0);
  assert.match(g.warnings.join(' '), /Na kanale statusu bot potrzebuje/);
});

test('raporty błędów ukrywają sekrety, dane URL, SQL i nie dodają stacka', async t => {
  setEnv(t, 'CLIENT_SECRET', 'my-oauth-private-secret');
  setEnv(t, 'DATABASE_URL', 'postgres://private-user:private-password@database.internal/bot');
  const f = fixture(t);
  const error = Object.assign(new Error(`${f.cfg.token} my-oauth-private-secret ${process.env.DATABASE_URL} token=abc12345 SELECT * FROM private_table`), { code: 'EXAMPLE' });
  error.stack = 'PRIVATE STACK DATA';
  assert.equal(await f.reporter.reportError('Operacja @everyone', error), true);
  const data = JSON.stringify(f.sent[0].embeds[0].toJSON());
  for (const secret of [f.cfg.token, process.env.CLIENT_SECRET, process.env.DATABASE_URL, 'abc12345', 'private_table', 'PRIVATE STACK DATA']) assert.ok(!data.includes(secret), secret);
  assert.match(data, /EXAMPLE/);
  assert.match(data, /UKRYTO/);
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [] });
  const scrubbed = sanitizeDiagnostic('postgres://alice:password123@host/db Bearer abcdefghijklmnop mfa.abcdefghijklmnopqrstuvwxyz');
  assert.ok(!scrubbed.includes('password123'));
  assert.ok(!scrubbed.includes('abcdefghijklmnop'));
});

test('scala powtórzenia i ogranicza liczbę błędów do pięciu na minutę', async t => {
  const f = fixture(t);
  assert.equal(await f.reporter.reportError('Komenda', new Error('pierwszy')), true);
  assert.equal(await f.reporter.reportError('Komenda', new Error('pierwszy')), false);
  for (let i = 0; i < 4; i++) assert.equal(await f.reporter.reportError('Komenda', new Error(`inny ${i}`)), true);
  assert.equal(await f.reporter.reportError('Komenda', new Error('szósty')), false);
  assert.equal(f.sent.length, 5);
  f.advance(60_001);
  assert.equal(await f.reporter.reportError('Komenda', new Error('pierwszy')), true);
  assert.equal(f.sent.length, 6);
});

test('nieudane wysłanie nie wywołuje rekurencyjnych raportów', async t => {
  const f = fixture(t, { sendError: new Error('Discord unavailable') });
  assert.equal(await f.reporter.reportError('Komenda', new Error('test')), false);
  assert.equal(f.sent.length, 1);
  assert.equal(f.warnings.length, 1);
  assert.equal(await f.reporter.reportError('Komenda', new Error('test')), false);
  assert.equal(f.sent.length, 1);
});

test('bez zalogowania do Discorda status nie wykonuje żadnego żądania', async t => {
  const f = fixture(t, { ready: false });
  assert.equal(await f.reporter.online(), false);
  assert.equal(await f.reporter.reportError('Logowanie', new Error('odrzucone')), false);
  assert.equal(await f.reporter.offline(), false);
  assert.equal(f.sent.length, 0);
  assert.equal(f.created.length, 0);
});

test('zawieszone Discord API nie blokuje planowanego wyłączenia dłużej niż 3 sekundy', async t => {
  const f = fixture(t);
  f.guild.channels.fetch = () => new Promise(() => {});
  // Keep the test runner alive; reporter timeouts themselves are unref'd.
  const keepAlive = setTimeout(() => {}, 4500);
  t.after(() => clearTimeout(keepAlive));
  const started = performance.now();
  assert.equal(await f.reporter.offline(), false);
  assert.ok(performance.now() - started < 4000);
  assert.equal(f.sent.length, 0);
});


test('ukrywa również nieznane sekrety w JSON i kluczach ze standardowym prefiksem', () => {
  const text = sanitizeDiagnostic('{"client_secret":"unknown-oauth-value","access_token":"unknown-access-value"} DISCORD_TOKEN=unknown-bot-value select * from private_form_answers');
  for (const secret of ['unknown-oauth-value', 'unknown-access-value', 'unknown-bot-value', 'private_form_answers']) assert.ok(!text.includes(secret), secret);
});
