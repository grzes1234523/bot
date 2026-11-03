import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { createProSystem } from '../src/pro-system.js';

function fixture() {
  const ticket = { id: 'ABC123', guildId: 'guild', channelId: 'channel', ownerId: 'owner', ownerName: 'Owner', status: 'open', createdAt: new Date(Date.now() - 7200000).toISOString() };
  let state = { tickets: { items: [ticket], guildSettings: {}, auditLogs: [] }, embeds: { scheduled: [] } };
  const calls = [];
  const store = {
    snapshot: () => structuredClone(state),
    update: async fn => { const next = structuredClone(state); const result = fn(next); state = next; return result; },
  };
  const channel = {
    id: 'channel', isTextBased: () => true,
    messages: { fetch: async () => new Collection() },
    delete: async () => { assert.ok(state.tickets.items[0].transcriptHtml); assert.equal(state.tickets.items[0].status, 'closed'); calls.push('delete'); },
  };
  const guild = { id: 'guild', name: 'Test', channels: { fetch: async () => channel }, members: { fetch: async () => null } };
  const client = { guilds: { cache: new Map([['guild', guild]]) } };
  const interaction = {
    customId: 'strefa:ticket-pro:close:ABC123', channel, channelId: 'channel', guild, guildId: 'guild', user: { id: 'owner', tag: 'Owner' },
    fields: { getTextInputValue: () => 'Gotowe' },
    inGuild: () => true,
    deferReply: async () => calls.push('defer'),
    editReply: async payload => { calls.push(payload.content); },
    reply: async payload => { calls.push(payload.content); },
  };
  const system = () => createProSystem({ client, featureStore: store, cfg: { guildId: 'guild' } });
  return { store, channel, interaction, system, calls };
}

test('zamknięcie zapisuje transkrypt i historię przed usunięciem kanału', async () => {
  const f = fixture();
  await f.system().modal(f.interaction);
  const ticket = f.store.snapshot().tickets.items[0];
  assert.equal(ticket.status, 'closed');
  assert.ok(ticket.channelDeletedAt);
  assert.equal(ticket.closeReason, 'Gotowe');
  assert.equal(f.calls[0], 'defer');
  assert.equal(f.calls.filter(x => x === 'delete').length, 1);
  assert.match(f.calls.at(-1), /kanał usunięto/);
});

test('błąd transkryptu nie usuwa kanału ani nie zamyka zgłoszenia', async () => {
  const f = fixture();
  f.channel.messages.fetch = async () => { throw new Error('Missing Access'); };
  await assert.rejects(f.system().modal(f.interaction), /Missing Access/);
  assert.equal(f.store.snapshot().tickets.items[0].status, 'open');
  assert.ok(!f.calls.includes('delete'));
});

test('brak uprawnień do zamknięcia nie usuwa kanału', async () => {
  const f = fixture();
  f.interaction.user.id = 'stranger';
  await f.system().modal(f.interaction);
  assert.ok(!f.calls.includes('delete'));
  assert.equal(f.store.snapshot().tickets.items[0].status, 'open');
});

test('nieudane usunięcie jest ponawiane po restarcie, bez usuwania innych zamkniętych ticketów', async () => {
  const f = fixture();
  f.channel.delete = async () => { throw new Error('Missing Permissions'); };
  await f.system().modal(f.interaction);
  assert.equal(f.store.snapshot().tickets.items[0].status, 'closed');
  assert.ok(!f.store.snapshot().tickets.items[0].channelDeletedAt);
  await f.store.update(state => state.tickets.items.push({ id: 'OLD', status: 'closed', guildId: 'guild', channelId: 'old' }));
  f.channel.delete = async () => f.calls.push('delete');
  await f.system().maintenance();
  assert.ok(f.store.snapshot().tickets.items[0].channelDeletedAt);
  assert.equal(f.calls.filter(x => x === 'delete').length, 1);
  assert.ok(!f.store.snapshot().tickets.items[1].channelDeletedAt);
});

test('automatyczne zamknięcie również usuwa kanał po zapisaniu transkryptu', async () => {
  const f = fixture();
  await f.store.update(state => { state.tickets.guildSettings.guild = { autoCloseAfterHours: 1 }; });
  await f.system().maintenance();
  assert.ok(f.store.snapshot().tickets.items[0].channelDeletedAt);
  assert.equal(f.calls.filter(x => x === 'delete').length, 1);
});
