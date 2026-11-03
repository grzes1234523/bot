import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Collection } from 'discord.js';
import { createLevelChannel } from '../src/level-channel.js';

function fixture() {
  const categoryId = '123456789012345678';
  const state = { levels: { guilds: { guild: { settings: { messageXp: 23 }, users: { user: { xp: 100 } } } } } };
  const featureStore = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const category = { id: categoryId, type: ChannelType.GuildCategory, permissionsFor: () => ({ has: () => true }) };
  const channels = new Collection([[categoryId, category]]);
  const calls = [];
  const guild = { id: 'guild', members: { me: {} }, channels: {
    fetch: async id => id ? channels.get(id) : channels,
    create: async options => { calls.push(options); const channel = { id: '123456789012345679', type: ChannelType.GuildText, name: options.name, parentId: options.parent, permissionsFor: category.permissionsFor, delete: async () => calls.push('rollback') }; channels.set(channel.id, channel); return channel; },
  } };
  return { categoryId, state, featureStore, category, calls, guild };
}
test('tworzy kanał w kategorii i zachowuje XP oraz pozostałe ustawienia', async () => {
  const f = fixture(); const result = await createLevelChannel(f);
  assert.equal(result.created, true);
  assert.equal(f.calls[0].parent, f.categoryId);
  assert.equal(f.calls[0].permissionOverwrites, undefined, 'dziedziczy uprawnienia kategorii');
  assert.equal(f.state.levels.guilds.guild.settings.announcementChannelId, result.channelId);
  assert.equal(f.state.levels.guilds.guild.settings.messageXp, 23);
  assert.equal(f.state.levels.guilds.guild.users.user.xp, 100);
  assert.equal((await createLevelChannel(f)).created, false);
  assert.equal(f.calls.length, 1);
});
test('odrzuca zły identyfikator, inny typ kanału i brak uprawnień', async () => {
  const f = fixture();
  await assert.rejects(createLevelChannel({ ...f, categoryId: '' }), /kategorię/);
  f.category.type = ChannelType.GuildText;
  await assert.rejects(createLevelChannel(f), /kategorią/);
  f.category.type = ChannelType.GuildCategory;
  f.category.permissionsFor = () => ({ has: () => false });
  await assert.rejects(createLevelChannel(f), /uprawnień/);
  assert.equal(f.calls.length, 0);
});
test('cofa nowy kanał po błędzie zapisu konfiguracji', async () => {
  const f = fixture(); f.featureStore.update = async () => { throw new Error('Database unavailable'); };
  await assert.rejects(createLevelChannel(f), /Database unavailable/);
  assert.equal(f.calls.at(-1), 'rollback');
});
