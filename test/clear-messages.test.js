import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { clearMessages, clearMessagesCommand } from '../src/clear-messages.js';
import { featureCommands, isFeatureCommand } from '../src/features.js';

function fixture() {
  const f = { replies: [], logs: [], deleted: [], fetched: 0, moderatorAllowed: true, botAllowed: true };
  const bot = { id: 'bot' }, member = { id: 'mod' };
  f.messages = new Collection([['new', { id: 'new', createdTimestamp: Date.now() - 60000 }], ['old', { id: 'old', createdTimestamp: Date.now() - 15 * 86400000 }]]);
  f.channel = { id: 'text', guildId: 'guild', permissionsFor: who => ({ has: () => who === bot ? f.botAllowed : f.moderatorAllowed }), messages: { fetch: async options => { f.fetched++; assert.equal(options.limit, 50); return f.messages; } }, bulkDelete: async (messages, filterOld) => { assert.equal(filterOld, true); f.deleted.push(...messages.keys()); return messages; } };
  f.interaction = { guildId: 'guild', guild: { members: { me: bot } }, member, user: { id: 'mod' }, channel: f.channel, options: { getInteger: () => 50, getChannel: () => null }, reply: async payload => f.replies.push(payload), editReply: async payload => f.replies.push(payload), deferReply: async payload => { assert.equal(payload.flags, MessageFlags.Ephemeral); f.interaction.deferred = true; } };
  f.run = () => clearMessages(f.interaction, { guildId: 'guild', log: async (...args) => f.logs.push(args) });
  return f;
}

test('komenda jest zarejestrowana z limitem i domyślnym uprawnieniem', () => {
  const json = clearMessagesCommand.toJSON();
  assert.ok(isFeatureCommand('wyczysc')); assert.ok(featureCommands.includes(clearMessagesCommand));
  assert.equal(json.default_member_permissions, String(PermissionFlagsBits.ManageMessages));
  assert.equal(json.options[0].min_value, 1); assert.equal(json.options[0].max_value, 100);
});
test('usuwa nowe wiadomości, pomija stare, raportuje wynik i zapisuje log', async () => {
  const f = fixture(); await f.run(); assert.deepEqual(f.deleted, ['new']);
  assert.match(f.replies[0].content, /Usunięto \*\*1\*\*/); assert.match(f.replies[0].content, /Pominięto \*\*1\*\*/);
  assert.equal(f.logs.length, 1); assert.equal(f.logs[0][4], 'moderation');
});
test('odrzuca brak uprawnień użytkownika lub bota przed pobraniem wiadomości', async () => {
  for (const field of ['moderatorAllowed', 'botAllowed']) { const f = fixture(); f[field] = false; await f.run(); assert.equal(f.fetched, 0); assert.equal(f.deleted.length, 0); assert.equal(f.replies[0].flags, MessageFlags.Ephemeral); }
});
test('odrzuca DM, obcy serwer, kanał i niepoprawny limit', async () => {
  for (const change of [f => { f.interaction.guild = null; }, f => { f.interaction.guildId = 'other'; }, f => { f.channel.guildId = 'other'; }, f => { f.interaction.options.getInteger = () => 101; }]) {
    const f = fixture(); change(f); await f.run(); assert.equal(f.fetched, 0);
  }
});
test('opcjonalny kanał jest sprawdzany i czyszczony zamiast bieżącego', async () => {
  const f = fixture(); f.interaction.channel = null; f.interaction.options.getChannel = () => f.channel; await f.run(); assert.deepEqual(f.deleted, ['new']);
});
test('pusty lub stary zbiór nie wywołuje usuwania ani logu sukcesu', async () => {
  const f = fixture(); f.messages.delete('new'); await f.run(); assert.deepEqual(f.deleted, []); assert.equal(f.logs.length, 0); assert.match(f.replies[0].content, /Usunięto \*\*0\*\*/);
});
test('błąd Discorda daje prywatną odpowiedź bez fałszywego sukcesu', async () => {
  const f = fixture(); f.channel.messages.fetch = async () => { throw new Error('Missing permissions'); }; await f.run(); assert.match(f.replies[0].content, /Nie udało/); assert.equal(f.logs.length, 0);
});
