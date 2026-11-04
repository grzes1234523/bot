import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunitySystem, communityGuild, saveCommunitySettings } from '../src/community.js';
import { millionaireQuestions } from '../src/millionaires-questions.js';
import { millionairePayload, millionaireSummary } from '../src/millionaires.js';

function fixture() {
  const state = { economy: { user: { balance: 77 } } }, calls = [], edits = [], feedback = [];
  communityGuild(state,'guild'); let time = 1000000, sequence = Promise.resolve();
  const featureStore = { snapshot: () => structuredClone(state), update: fn => {
    const promise = sequence.then(() => fn(state)); sequence = promise.catch(() => {}); return promise;
  } };
  const client = { channels: { fetch: async () => ({ messages: { fetch: async () => ({ edit: async payload => edits.push(payload) }) } }) } };
  const i = { guildId: 'guild', channelId: 'channel', guild: { id: 'guild', members: { me: {} } }, user: { id: 'user' }, commandName: 'zabawa', options: { getSubcommand: () => 'milionerzy' }, message: { id: 'message' },
    deferReply: async () => {}, deferUpdate: async () => {}, editReply: async payload => { calls.push(payload); return { id: 'message' }; }, reply: async payload => feedback.push(payload.content), followUp: async payload => feedback.push(payload.content),
  };
  let system;
  const restart = () => system = createCommunitySystem({ client, featureStore, guildId: 'guild', now: () => time }); restart();
  const game = () => state.community.guilds.guild.millionaires.at(-1);
  const start = () => system.command(i);
  const click = async (action, override = {}) => { i.customId = `strefa:community:million:${game().id}:${game().revision}:${action}`; await system.button({ ...i, ...override }); };
  const correct = () => click(String(game().questions[game().step].correct));
  return { state, featureStore, calls, edits, feedback, i, game, start, click, correct, restart, advance: ms => { time += ms; } };
}
test('bank pytań ma unikalne ID i poprawne odpowiedzi dla każdego poziomu trudności', () => {
  assert.equal(new Set(millionaireQuestions.map(q => q.id)).size, millionaireQuestions.length);
  for (const q of millionaireQuestions) { assert.equal(q.options.length, 4); assert.ok(q.options[q.correct]); assert.equal(new Set(q.options).size, 4); }
  for (const difficulty of [0,1,2]) assert.ok(millionaireQuestions.filter(q => q.difficulty === difficulty).length >= 8);
});
test('Milionerzy jako pierwsza zabawa nowego serwera nie blokują późniejszych quizów', async () => {
  const f = fixture(); delete f.state.community; await f.start();
  f.i.options.getSubcommand = () => 'quiz'; const system = f.restart(); await system.command(f.i);
  assert.equal(f.state.community.guilds.guild.quizzes.length, 1);
  assert.equal(f.state.community.guilds.guild.millionaires.length, 1);
});
test('start tworzy 12 różnych pytań i blokuje drugą aktywną grę tej samej osoby', async () => {
  const f = fixture(); await f.start();
  assert.equal(f.game().questions.length, 12); assert.equal(new Set(f.game().questions.map(q => q.id)).size, 12);
  assert.deepEqual(f.game().questions.map(q => q.difficulty), [0,0,0,0,1,1,1,1,2,2,2,2]);
  assert.equal(f.game().messageId, 'message');
  assert.equal(f.calls[0].components[0].toJSON().components.length, 4);
  await f.start(); assert.equal(f.state.community.guilds.guild.millionaires.length, 1); assert.match(f.calls.at(-1).content, /aktywną/);
});
test('12 dobrych odpowiedzi daje milion punktów dokładnie raz i nie zmienia ekonomii', async () => {
  const f = fixture(); await f.start();
  for (let n = 0; n < 12; n++) { await f.correct(); if (n === 1) assert.equal(f.game().guaranteed, 1000); if (n === 6) assert.equal(f.game().guaranteed, 40000); }
  assert.equal(f.game().status, 'won'); assert.equal(f.game().prize, 1000000); assert.equal(f.state.economy.user.balance, 77);
  assert.deepEqual(f.calls.at(-1).components, []); assert.equal(millionaireSummary(f.state,'guild').wins, 1);
  await f.click('quit'); assert.equal(millionaireSummary(f.state,'guild').wins, 1);
});
test('błąd zachowuje próg gwarantowany, a rezygnacja zabiera aktualną wygraną', async () => {
  const f = fixture(); await f.start(); await f.correct(); await f.correct(); await f.correct();
  const q = f.game().questions[f.game().step]; await f.click(String((q.correct + 1) % 4));
  assert.equal(f.game().status, 'lost'); assert.equal(f.game().prize, 1000);
  assert.match(f.calls.at(-1).embeds[0].toJSON().description, /Poprawna odpowiedź/);
  await f.start(); await f.correct(); await f.correct(); await f.correct(); await f.click('quit');
  assert.equal(f.game().status, 'quit'); assert.equal(f.game().prize, 2000);
});
test('50:50 i zmiana pytania działają raz, zachowują poprawną opcję i poziom trudności', async () => {
  const f = fixture(); await f.start(); const oldId = f.game().questions[0].id;
  await f.click('half'); assert.equal(f.game().hidden.length, 2); assert.ok(!f.game().hidden.includes(f.game().questions[0].correct));
  await f.click('half'); assert.match(f.feedback.at(-1), /wykorzystane/);
  const hidden = f.game().hidden[0]; await f.click(String(hidden)); assert.equal(f.game().step, 0);
  await f.click('swap'); assert.notEqual(f.game().questions[0].id, oldId); assert.equal(f.game().questions[0].difficulty, 0);
  assert.equal(f.game().hidden.length, 2); assert.ok(!f.game().hidden.includes(f.game().questions[0].correct));
  await f.click('swap'); assert.match(f.feedback.at(-1), /wykorzystana/);
  await f.correct(); assert.deepEqual(f.game().hidden, []); assert.equal(f.game().usedHalf, true);
});
test('stary przycisk nie może odpowiedzieć na kolejne pytanie, także po restarcie', async () => {
  const f = fixture(); await f.start();
  const old = `strefa:community:million:${f.game().id}:0:${f.game().questions[0].correct}`;
  await f.correct(); f.restart();
  await f.click('quit', { customId: old }); assert.equal(f.game().step, 1); assert.match(f.feedback.at(-1), /nieaktualny/);
  await f.correct(); assert.equal(f.game().step, 2);
});
test('inny gracz, kanał, wiadomość i serwer nie mogą sterować cudzą grą', async () => {
  const f = fixture(); await f.start();
  for (const override of [{ user: { id: 'other' } }, { channelId: 'other' }, { message: { id: 'other' } }, { guildId: 'other' }]) await f.click('quit',override);
  assert.equal(f.game().status, 'active'); assert.equal(f.game().revision, 0);
});
test('upływ czasu kończy grę i usuwa przyciski również po restarcie', async () => {
  const f = fixture(); await f.start(); await f.correct(); await f.correct(); f.advance(300001); f.restart();
  // tick jest wywoływany automatycznie przez bota, bez interakcji użytkownika.
  const system = f.restart(); await system.tick();
  assert.equal(f.game().status, 'expired'); assert.equal(f.game().prize, 1000); assert.deepEqual(f.edits[0].components, []);
  await system.tick(); assert.equal(f.edits.length, 1);
});
test('wygasła odpowiedź oraz wyłączony moduł nie przyznają kolejnego progu', async () => {
  const f = fixture(); await f.start(); f.advance(300001); await f.correct(); assert.equal(f.game().status, 'expired'); assert.equal(f.game().step,0);
  f.state.community.guilds.guild.settings.millionairesEnabled = false; await f.start(); assert.match(f.feedback.at(-1), /wyłączeni/);
});
test('ustawienia starszego panelu zachowują przełącznik Milionerów, a API nie zwraca odpowiedzi', async () => {
  const f = fixture(); f.state.community.guilds.guild.settings.millionairesEnabled = false;
  await saveCommunitySettings({ guild: f.i.guild, featureStore: f.featureStore, body: { gamesEnabled: true, ideasEnabled: true } });
  assert.equal(f.state.community.guilds.guild.settings.millionairesEnabled, false);
  await assert.rejects(saveCommunitySettings({ guild: f.i.guild, featureStore: f.featureStore, body: { gamesEnabled: true, ideasEnabled: true, millionairesEnabled: 'tak' } }), /przełącznik/);
  f.state.community.guilds.guild.settings.millionairesEnabled = true; await f.start();
  assert.deepEqual(Object.keys(millionaireSummary(f.state,'guild')).sort(), ['active','played','wins']);
  assert.ok(millionairePayload(f.game()).embeds[0].toJSON().description.includes('Pytanie 1/12'));
});
