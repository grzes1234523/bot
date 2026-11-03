import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { configureWelcome, createWelcomeSystem, welcomeCommands, welcomeDefaults, welcomeText, configureFarewell, createFarewellSystem, farewellCommands, validateMemberImage, MEMBER_IMAGE_MAX_BYTES } from '../src/welcome.js';

function fixture() {
  const state = { welcome: { guilds: {} }, levels: { xp: 99 } };
  const featureStore = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const sent = [];
  const category = { id: 'category', type: ChannelType.GuildCategory };
  const channel = { id: 'channel', parentId: category.id, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }), send: async payload => sent.push(payload) };
  const guild = { id: 'guild', name: 'Serwer', memberCount: 25, members: { me: {} }, channels: { fetch: async id => id === category.id ? category : id === channel.id ? channel : null } };
  const member = { id: 'member', guild, user: { username: 'Ala', bot: false } };
  const body = { ...welcomeDefaults, enabled: true, categoryId: category.id, channelId: channel.id };
  return { state, featureStore, sent, category, channel, guild, member, body };
}
test('konfiguracja zachowuje kategorię, kanał i inne moduły', async () => {
  const f = fixture(); await configureWelcome(f);
  assert.equal(f.state.welcome.guilds.guild.categoryId, 'category');
  assert.equal(f.state.welcome.guilds.guild.channelId, 'channel');
  assert.equal(f.state.levels.xp, 99);
  assert.deepEqual(welcomeCommands.map(c => c.toJSON().name), ['powitanie-ustaw', 'powitanie-wylacz']);
});
test('odrzuca kanał spoza kategorii i brak uprawnień', async () => {
  const f = fixture(); f.channel.parentId = 'inna';
  await assert.rejects(configureWelcome(f), /kategorii/);
  f.channel.parentId = 'category'; f.channel.permissionsFor = () => ({ has: () => false });
  await assert.rejects(configureWelcome(f), /uprawnień/);
  assert.deepEqual(f.state.welcome.guilds, {});
});
test('powitanie po restarcie korzysta z zapisanych ustawień i ogranicza wzmianki', async () => {
  const f = fixture(); await configureWelcome(f);
  const system = createWelcomeSystem({ featureStore: f.featureStore, guildId: 'guild' });
  await system.memberJoined(f.member);
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].embeds[0].toJSON().description, /<@member>.*Serwer/);
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [], users: ['member'] });
});
test('wyłączone powitania, boty i inny serwer nie wysyłają wiadomości', async () => {
  const f = fixture(); const system = createWelcomeSystem({ featureStore: f.featureStore, guildId: 'guild' });
  await system.memberJoined(f.member);
  await configureWelcome(f);
  await system.memberJoined({ ...f.member, user: { ...f.member.user, bot: true } });
  await system.memberJoined({ ...f.member, guild: { ...f.guild, id: 'other' } });
  assert.equal(f.sent.length, 0);
});
test('zmienne są zastępowane jednokrotnie, treść ma limit', async () => {
  const f = fixture(); f.member.user.username = '{user}';
  assert.equal(welcomeText('{username} {count}', f.member), '{user} 25');
  await assert.rejects(configureWelcome({ ...f, body: { ...f.body, message: 'x'.repeat(2001) } }), /2000/);
  await assert.rejects(configureWelcome({ ...f, body: { ...f.body, channelId: null } }), /kanał/);
});

test('pożegnania mają niezależny kanał i nie nadpisują powitań', async () => {
  const f = fixture(); await configureWelcome(f);
  await configureFarewell({ ...f, body: { ...f.body, message: 'Do zobaczenia {user}, zostało {count} osób.' } });
  assert.equal(f.state.welcome.guilds.guild.message, welcomeDefaults.message);
  assert.match(f.state.farewell.guilds.guild.message, /Do zobaczenia/);
  assert.deepEqual(farewellCommands.map(c => c.toJSON().name), ['pozegnanie-ustaw', 'pozegnanie-wylacz']);
});
test('odejście wysyła jedno pożegnanie bez pingowania osoby i ról', async () => {
  const f = fixture();
  await configureFarewell({ ...f, body: { ...f.body, message: '{user} {username} {server} {count}' } });
  await createFarewellSystem({ featureStore: f.featureStore, guildId: 'guild' }).memberLeft(f.member);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].content, undefined);
  assert.equal(f.sent[0].embeds[0].toJSON().description, 'Ala Ala Serwer 25');
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [], users: [] });
});
test('pożegnania pomijają boty, inne serwery i wyłączony moduł', async () => {
  const f = fixture(); const system = createFarewellSystem({ featureStore: f.featureStore, guildId: 'guild' });
  await system.memberLeft(f.member);
  await configureFarewell(f);
  await system.memberLeft({ ...f.member, user: { ...f.member.user, bot: true } });
  await system.memberLeft({ ...f.member, guild: { ...f.guild, id: 'other' } });
  assert.equal(f.sent.length, 0);
});

const png = { mime: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2fWQAAAAASUVORK5CYII=' };
test('zdjęcia są walidowane na podstawie zawartości i rozmiaru', () => {
  assert.equal(validateMemberImage(png).name, 'zdjecie.png');
  assert.equal(validateMemberImage(null), null);
  assert.throws(() => validateMemberImage({ ...png, mime: 'image/jpeg' }), /Format/);
  assert.throws(() => validateMemberImage({ mime: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') }), /Format/);
  assert.throws(() => validateMemberImage({ ...png, data: '%%%=' }), /zdjęcie/);
  assert.throws(() => validateMemberImage({ ...png, data: Buffer.alloc(MEMBER_IMAGE_MAX_BYTES + 1).toString('base64') }), /2 MB/);
});
for (const kind of ['welcome', 'farewell']) {
  test(`zdjęcie ${kind} jest zapisane i wysłane jako załącznik embeda po restarcie`, async () => {
    const f = fixture();
    const configure = kind === 'welcome' ? configureWelcome : configureFarewell;
    await configure({ ...f, body: { ...f.body, image: png } });
    const system = kind === 'welcome' ? createWelcomeSystem({ featureStore: f.featureStore, guildId: 'guild' }) : createFarewellSystem({ featureStore: f.featureStore, guildId: 'guild' });
    await system.memberJoined(f.member);
    assert.equal(f.sent[0].embeds[0].toJSON().image.url, 'attachment://zdjecie.png');
    assert.deepEqual(f.sent[0].files[0].attachment, Buffer.from(png.data, 'base64'));
    await configure(f); // A text-only slash command preserves the saved image.
    assert.equal(f.state[kind].guilds.guild.image.data, png.data);
    await configure({ ...f, body: { ...f.body, image: null } });
    assert.equal(f.state[kind].guilds.guild.image, null);
  });
}
test('zdjęcie wymaga uprawnienia Załączanie plików', async () => {
  const f = fixture();
  f.channel.permissionsFor = () => ({ has: permissions => Array.isArray(permissions) });
  await assert.rejects(configureWelcome({ ...f, body: { ...f.body, image: png } }), /Załączanie plików/);
});
