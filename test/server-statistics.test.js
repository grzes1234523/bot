import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { collectServerStatistics, readServerStatistics } from '../src/server-statistics.js';
import { createFeatureHandlers } from '../src/features.js';

function guildFixture() {
  const cache = new Collection([
    ['human', { user: { bot: false }, presence: { status: 'online' } }],
    ['offline', { user: { bot: false } }],
    ['bot', { user: { bot: true }, presence: { status: 'idle' } }],
  ]);
  return { id: 'guild', memberCount: 3, members: { cache, fetch: async () => cache } };
}
test('liczy pełną listę członków, ludzi, boty i widoczne statusy online', () => {
  const result = collectServerStatistics(guildFixture());
  assert.deepEqual([result.members, result.humans, result.bots, result.online], [3, 2, 1, 2]);
  assert.ok(readServerStatistics(result, 'guild'));
});
test('nie przedstawia niepełnego cache REST jako zera ludzi i jednego bota', () => {
  const guild = guildFixture(); guild.members.cache.delete('human');
  assert.equal(collectServerStatistics(guild), null);
  guild.memberCount = undefined; assert.equal(collectServerStatistics(guild), null);
});
test('odrzuca stare, obce oraz niespójne liczniki', () => {
  const snapshot = collectServerStatistics(guildFixture(), 1000000);
  assert.equal(readServerStatistics(snapshot, 'other', 1000000), null);
  assert.equal(readServerStatistics(snapshot, 'guild', 1200001), null);
  assert.equal(readServerStatistics({ ...snapshot, bots: 5 }, 'guild', 1000000), null);
});
test('publikuje dane dla panelu nawet bez utworzonych kanałów głosowych', async () => {
  const state = { autoChannels: { createdIds: [] } };
  const featureStore = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const handlers = createFeatureHandlers({ client: {}, cfg: { guildId: 'guild' }, featureStore });
  const guild = guildFixture(); await handlers.refreshStatisticsChannels(guild);
  assert.equal(state.serverStatistics.members, 3);
  guild.members.cache.get('human').presence.status = 'offline';
  await handlers.publishStatistics(guild); assert.equal(state.serverStatistics.online, 1);
});
