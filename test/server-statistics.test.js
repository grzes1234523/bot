import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { collectServerStatistics, readServerStatistics, createStatisticsMemberLoader } from '../src/server-statistics.js';
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

test('pełny cache nie pobiera ponownie członków przy kolejnych odświeżeniach',async()=>{
 const guild=guildFixture();let calls=0;guild.members.fetch=async()=>{calls++;};const ensure=createStatisticsMemberLoader();
 assert.equal(await ensure(guild),true);await ensure(guild);assert.equal(calls,0);
});
test('jednoczesne odświeżenia współdzielą jedno pobranie',async()=>{
 const guild=guildFixture();guild.memberCount=4;let calls=0,finish;guild.members.fetch=()=>{calls++;return new Promise(resolve=>{finish=()=>{guild.members.cache.set('new',{user:{bot:false}});resolve();};});};
 const ensure=createStatisticsMemberLoader();const first=ensure(guild);const second=ensure(guild);finish();assert.deepEqual(await Promise.all([first,second]),[true,true]);assert.equal(calls,1);
});
test('limit Gateway zachowuje dane i respektuje Retry after, potem ponawia',async()=>{
 const guild=guildFixture();guild.memberCount=4;let clock=100000,calls=0;
 guild.members.fetch=async()=>{calls++;if(calls===1){const error=new Error('Request with opcode 8 was rate limited. Retry after 60 seconds.');error.name='GatewayRateLimitError';throw error;}guild.members.cache.set('new',{user:{bot:false}});};
 const ensure=createStatisticsMemberLoader({now:()=>clock});assert.equal(await ensure(guild),false);clock+=40000;assert.equal(await ensure(guild),false);assert.equal(calls,1);clock+=22000;assert.equal(await ensure(guild),true);assert.equal(calls,2);
});
test('inne błędy pobierania nie są ukrywane',async()=>{
 const guild=guildFixture();guild.memberCount=4;guild.members.fetch=async()=>{throw new Error('Brak dostępu');};const ensure=createStatisticsMemberLoader();await assert.rejects(ensure(guild),/Brak dostępu/);
});
test('niepełne dane nie nadpisują kanałów ani opublikowanych statystyk',async()=>{
 const guild=guildFixture();guild.memberCount=4;guild.members.fetch=async()=>{const e=new Error('Retry after 29.192 seconds.');e.name='GatewayRateLimitError';throw e;};
 const previous={members:3};const state={autoChannels:{createdIds:[]},serverStatistics:previous,statisticsChannels:{membersChannelId:'test'}};
 const handlers=createFeatureHandlers({client:{},cfg:{guildId:'guild'},featureStore:{snapshot:()=>structuredClone(state),update:async fn=>fn(state)}});
 await handlers.refreshStatisticsChannels(guild);assert.deepEqual(state.serverStatistics,previous);
});
