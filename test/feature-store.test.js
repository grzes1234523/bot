import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FeatureStore } from '../src/feature-store.js';
import { proCommands } from '../src/pro-system.js';

test('uzupełnia nową strukturę ticketów bez utraty istniejących paneli', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strefa-features-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'features.json');
  const panel = { messageId: 'panel-old', channelId: 'channel-old', title: 'Poprzedni panel' };
  await fs.writeFile(file, JSON.stringify({ tickets: { panels: [panel], categoryId: 'category-old' }, economy: { user1: { balance: 42 } } }));
  const store = new FeatureStore(file);
  await store.init();
  assert.deepEqual(store.snapshot().tickets.panels, [panel]);
  assert.equal(store.snapshot().tickets.categoryId, 'category-old');
  assert.deepEqual(store.snapshot().tickets.items, []);
  assert.equal(store.snapshot().economy.user1.balance, 42);
  await store.update(state => { state.tickets.items.push({ id: '000001', status: 'open' }); });
  const reloaded = new FeatureStore(file);
  await reloaded.init();
  assert.deepEqual(reloaded.snapshot().tickets.panels, [panel]);
  assert.equal(reloaded.snapshot().tickets.items[0].id, '000001');
});

test('komendy ticketów i embedów rejestrują zestaw poleceń i podpoleceń', () => {
  const serialized = proCommands.map(command => command.toJSON());
  assert.deepEqual(serialized.map(command => command.name), ['ticket', 'embed']);
  assert.ok(serialized[0].options.some(option => option.name === 'panel'));
  assert.ok(serialized[0].options.some(option => option.name === 'statystyki'));
  assert.ok(serialized[1].options.some(option => option.name === 'kreator'));
});
