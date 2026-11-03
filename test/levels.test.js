import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { createLevelSystem, levelDefaults, levelForXp, xpForLevel, validateLevelSettings, levelCommands, levelRanking } from '../src/levels.js';

function fixture() {
  let time = 1000000;
  let state = { levels: { guilds: {} } };
  const store = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const guild = { id: 'guild', afkChannelId: 'afk', voiceStates: { cache: new Collection() }, roles: { cache: new Collection() } };
  const client = { guilds: { cache: new Map([['guild', guild]]) } };
  const member = id => ({ id, user: { id, username: id, bot: false }, displayName: id, guild, roles: { cache: new Collection(), add: async role => roleAdds.push([id, role.id]) } });
  const a = member('a'), b = member('b');
  const channel = { members: new Collection([['a', a], ['b', b]]) };
  for (const member of [a, b]) {
    member.voice = { id: member.id, member, guild, channelId: 'voice', channel, mute: false, deaf: false, suppress: false };
    guild.voiceStates.cache.set(member.id, member.voice);
  }
  const roleAdds = [];
  const system = () => createLevelSystem({ client, featureStore: store, guildId: 'guild', now: () => time });
  const message = () => ({ guildId: 'guild', author: a.user, member: a });
  return { system, store, a, b, guild, roleAdds, message, advance: ms => { time += ms; } };
}

test('progi poziomów i rejestracja komend', () => {
  assert.equal(xpForLevel(2), 400);
  for (const [xp, level] of [[0, 0], [99, 0], [100, 1], [399, 1], [400, 2]]) assert.equal(levelForXp(xp), level);
  assert.deepEqual(levelCommands.map(c => c.toJSON().name), ['level', 'ranking', 'poziomy-ustaw']);
});
test('XP za wiadomości respektuje cooldown także po restarcie i ignoruje boty oraz inne serwery', async () => {
  const f = fixture();
  await f.system().message(f.message());
  await f.system().message(f.message());
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 15);
  f.advance(60000);
  await f.system().message({ ...f.message(), author: { ...f.a.user, bot: true } });
  await f.system().message({ ...f.message(), guildId: 'other' });
  await f.system().message({ ...f.message(), webhookId: 'hook' });
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 15);
  await f.system().message(f.message());
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 30);
});
test('rozmowy przyznają XP po minucie, restart nie nalicza czasu offline', async () => {
  const f = fixture(); const system = f.system();
  await system.tick(); f.advance(60000); await system.tick();
  assert.deepEqual(levelRanking(f.store.snapshot(), 'guild').map(u => u.xp), [5, 5]);
  const restarted = f.system(); f.advance(3600000); await restarted.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 5);
  f.advance(60000); await restarted.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 10);
});
test('samotna osoba, AFK i wyciszenie nie otrzymują głosowego XP', async () => {
  const f = fixture(); const system = f.system();
  await system.tick();
  f.b.voice.mute = true; f.advance(60000); await system.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild').length, 0);
  f.b.voice.mute = false;
  f.a.voice.channelId = 'afk'; f.b.voice.channelId = 'afk';
  f.advance(60000); await system.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild').length, 0);
});
test('wyjście z rozmowy resetuje niepełną minutę i nagrody roli są nadawane po progu', async () => {
  const f = fixture(); const system = f.system();
  await system.tick(); f.advance(30000);
  const old = { ...f.b.voice };
  f.a.voice.channel.members.delete('b');
  f.b.voice = { ...old, channel: null, channelId: null };
  system.voiceState(old, f.b.voice);
  f.advance(30000); await system.tick();
  assert.equal(levelRanking(f.store.snapshot(), 'guild').length, 0);
  const roleId = '123456789012345678';
  await f.store.update(state => { state.levels.guilds.guild = { users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } }, settings: { ...levelDefaults, rewards: [{ level: 1, roleId }] } }; });
  f.guild.roles.cache.set(roleId, { id: roleId, editable: true, managed: false });
  await system.message(f.message());
  assert.deepEqual(f.roleAdds, [['a', roleId]]);
});
test('walidacja panelu odrzuca nadmierne XP, duplikaty ról i błędne typy', () => {
  assert.doesNotThrow(() => validateLevelSettings(levelDefaults));
  assert.throws(() => validateLevelSettings({ ...levelDefaults, messageXp: 1001 }));
  assert.throws(() => validateLevelSettings({ ...levelDefaults, enabled: 'true' }));
  const reward = { level: 2, roleId: '123456789012345678' };
  assert.throws(() => validateLevelSettings({ ...levelDefaults, rewards: [reward, reward] }));
});

test('powiadomienie trafia na wybrany kanał tylko po przekroczeniu poziomu', async () => {
  const f = fixture(); const sent = [];
  const channelId = '123456789012345679';
  f.guild.channels = { fetch: async id => { assert.equal(id, channelId); return { isTextBased: () => true, send: async payload => sent.push(payload) }; } };
  await f.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, announcementChannelId: channelId }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  const system = f.system();
  await system.message(f.message());
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /poziom 1/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: ['a'] });
  f.advance(60000); await system.message(f.message());
  assert.equal(sent.length, 1);
});

test('błąd kanału nie odbiera XP; pusta konfiguracja wyłącza powiadomienia', async () => {
  const f = fixture();
  f.guild.channels = { fetch: async () => { throw new Error('Missing Access'); } };
  await f.store.update(state => { state.levels.guilds.guild = { settings: { ...levelDefaults, announcementChannelId: '123456789012345679' }, users: { a: { xp: 90, messageCount: 0, voiceMinutes: 0 } } }; });
  await f.system().message(f.message());
  assert.equal(levelRanking(f.store.snapshot(), 'guild')[0].xp, 105);
  assert.equal(validateLevelSettings({ ...levelDefaults, announcementChannelId: '' }).announcementChannelId, null);
  assert.throws(() => validateLevelSettings({ ...levelDefaults, announcementChannelId: 'zly-kanal' }));
});
