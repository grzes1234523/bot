import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerStatus } from '../src/worker-status.js';

const GUILD_ID = '12345678901234567';
const CLIENT_ID = '23456789012345678';
const KEY = `runtime:bot:${GUILD_ID}:${CLIENT_ID}`;

function fixture() {
  let time = 1_700_000_000_000;
  let enabled = true;
  const documents = new Map();
  const updates = [];
  let queue = Promise.resolve();
  const storage = {
    async databaseEnabled() { return enabled; },
    async refreshDocument(key) { return structuredClone(documents.get(key) ?? null); },
    updateDocument(key, initialValue, change) {
      const task = queue.then(async () => {
        const state = structuredClone(documents.get(key) ?? initialValue);
        const result = await change(state);
        documents.set(key, structuredClone(state));
        updates.push(key);
        return { state, result };
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  const worker = (options = {}) => new WorkerStatus({ guildId: GUILD_ID, clientId: CLIENT_ID, now: () => time, storage, ...options });
  return { worker, storage, documents, updates, setEnabled: value => { enabled = value; }, advance: ms => { time += ms; }, iso: () => new Date(time).toISOString() };
}

test('samodzielny panel odczytuje stan online innego procesu ze wspólnego dokumentu', async () => {
  const f = fixture();
  const writer = f.worker();
  const panel = f.worker();
  assert.deepEqual(await panel.read(), { botReady: null, botStatus: 'unknown', botLastSeen: null });
  assert.equal(await writer.publish({ ready: true, botId: CLIENT_ID }), true);
  const record = f.documents.get(KEY);
  assert.equal(record.guildId, GUILD_ID);
  assert.equal(record.clientId, CLIENT_ID);
  assert.equal(record.botId, CLIENT_ID);
  assert.match(record.instanceId, /^[\da-f-]{36}$/);
  assert.deepEqual(await panel.read(), { botReady: true, botStatus: 'online', botLastSeen: f.iso() });
  assert.deepEqual(f.updates, [KEY]);
});

test('heartbeat ma 45 sekund ważności i znów działa po odświeżeniu', async () => {
  const f = fixture();
  const writer = f.worker();
  const panel = f.worker();
  await writer.publish({ ready: true, botId: CLIENT_ID });
  const previous = f.iso();
  f.advance(44_999);
  assert.equal((await panel.read()).botStatus, 'online');
  f.advance(1);
  assert.deepEqual(await panel.read(), { botReady: false, botStatus: 'stale', botLastSeen: previous });
  await writer.publish({ ready: true, botId: CLIENT_ID });
  assert.deepEqual(await panel.read(), { botReady: true, botStatus: 'online', botLastSeen: f.iso() });
});

test('rozłączenie i planowane zatrzymanie zapisują offline', async () => {
  const f = fixture();
  const writer = f.worker();
  await writer.publish({ ready: false });
  assert.equal((await f.worker().read()).botStatus, 'offline');
  await writer.publish({ ready: true, botId: CLIENT_ID });
  f.advance(1000);
  assert.equal(await writer.stop(), true);
  assert.deepEqual(await f.worker().read(), { botReady: false, botStatus: 'offline', botLastSeen: f.iso() });
  assert.equal(await writer.publish({ ready: true, botId: CLIENT_ID }), false);
});

test('zatrzymanie nieuruchomionego workera nie tworzy ani nie zmienia dokumentu', async () => {
  const f = fixture();
  const writer = f.worker();
  assert.equal(await writer.stop(), false);
  assert.equal(f.documents.size, 0);
  assert.deepEqual(f.updates, []);
});

test('stary proces nie oznacza nowej instancji offline po restarcie', async () => {
  const f = fixture();
  const old = f.worker();
  await old.publish({ ready: true, botId: CLIENT_ID });
  const oldId = f.documents.get(KEY).instanceId;
  const restarted = f.worker();
  f.advance(500);
  await restarted.publish({ ready: true, botId: CLIENT_ID });
  const current = structuredClone(f.documents.get(KEY));
  assert.notEqual(current.instanceId, oldId);
  assert.equal(await old.stop(), false);
  assert.deepEqual(f.documents.get(KEY), current);
  assert.equal((await f.worker().read()).botStatus, 'online');
  assert.equal(await restarted.stop(), true);
  assert.equal((await f.worker().read()).botStatus, 'offline');
});

test('oczekujące własne zapisy nie przywracają online po stop', async () => {
  const f = fixture();
  const writer = f.worker();
  await writer.publish({ ready: true, botId: CLIENT_ID });
  const pending = writer.publish({ ready: true, botId: CLIENT_ID });
  const stopped = writer.stop();
  await Promise.all([pending, stopped]);
  assert.equal((await f.worker().read()).botReady, false);
});

test('spóźniony heartbeat starego procesu nie przejmuje stanu nowej instancji', async () => {
  const f = fixture();
  const old = f.worker();
  const current = f.worker();
  await old.publish({ ready: true, botId: CLIENT_ID });
  f.advance(1000);
  assert.equal(await current.publish({ ready: true, botId: CLIENT_ID }), true);
  const currentRecord = structuredClone(f.documents.get(KEY));
  f.advance(1000);
  assert.equal(await old.publish({ ready: true, botId: CLIENT_ID }), false);
  assert.equal(await old.publish({ ready: false, botId: CLIENT_ID }), false);
  assert.deepEqual(f.documents.get(KEY), currentRecord);
  assert.equal(await old.stop(), false);
  assert.deepEqual(f.documents.get(KEY), currentRecord);
  assert.equal((await f.worker().read()).botStatus, 'online');
  assert.equal(await current.publish({ ready: true, botId: CLIENT_ID }), true);
  assert.equal(f.documents.get(KEY).lastSeen, f.iso());
});

test('różne serwery i aplikacje nie współdzielą klucza statusu', async () => {
  const f = fixture();
  await f.worker().publish({ ready: true, botId: CLIENT_ID });
  assert.equal((await f.worker({ guildId: 'different-guild' }).read()).botStatus, 'unknown');
  assert.equal((await f.worker({ clientId: 'different-client' }).read()).botStatus, 'unknown');
  await f.worker({ clientId: 'different-client' }).publish({ ready: false, botId: 'different-client' });
  assert.equal(f.documents.size, 2);
  assert.equal((await f.worker().read()).botStatus, 'online');
});

test('tożsamość zalogowanego bota musi odpowiadać CLIENT_ID', async () => {
  const f = fixture();
  await f.worker().publish({ ready: true, botId: 'different-bot' });
  assert.deepEqual(await f.worker().read(), { botReady: null, botStatus: 'configuration_mismatch', botLastSeen: f.iso() });
  await f.worker().publish({ ready: true });
  assert.equal((await f.worker().read()).botStatus, 'configuration_mismatch');
});

test('stan błędnie przypisany do serwera lub aplikacji nie jest wiarygodny', async () => {
  const f = fixture();
  await f.worker().publish({ ready: true, botId: CLIENT_ID });
  f.documents.get(KEY).guildId = 'another-guild';
  assert.equal((await f.worker().read()).botStatus, 'configuration_mismatch');
  f.documents.get(KEY).guildId = GUILD_ID;
  f.documents.get(KEY).clientId = 'another-client';
  assert.equal((await f.worker().read()).botStatus, 'configuration_mismatch');
});

test('nie uznaje heartbeatów z przyszłości ani uszkodzonych danych za online', async () => {
  const f = fixture();
  await f.worker().publish({ ready: true, botId: CLIENT_ID });
  const record = f.documents.get(KEY);
  record.lastSeen = new Date(Date.parse(f.iso()) + 5001).toISOString();
  assert.deepEqual(await f.worker().read(), { botReady: null, botStatus: 'unknown', botLastSeen: null });
  record.lastSeen = 'not-a-date';
  assert.equal((await f.worker().read()).botStatus, 'unknown');
  record.lastSeen = f.iso();
  record.ready = 'true';
  assert.equal((await f.worker().read()).botStatus, 'unknown');
  record.ready = true;
  delete record.instanceId;
  assert.equal((await f.worker().read()).botStatus, 'unknown');
});

test('brak bazy daje unknown i nie wykonuje operacji na dokumentach', async () => {
  const f = fixture();
  f.setEnabled(false);
  const writer = f.worker();
  assert.equal(await writer.publish({ ready: true, botId: CLIENT_ID }), false);
  assert.deepEqual(await writer.read(), { botReady: null, botStatus: 'unknown', botLastSeen: null });
  assert.equal(await writer.stop(), false);
  assert.equal(f.documents.size, 0);
});

test('odczyt awarii bazy jest bezpieczny, a zapis zgłasza błąd wywołującemu', async () => {
  const f = fixture();
  const secretError = new Error('postgres://user:private-password@host/db');
  f.storage.refreshDocument = async () => { throw secretError; };
  assert.deepEqual(await f.worker().read(), { botReady: null, botStatus: 'unavailable', botLastSeen: null });
  f.storage.updateDocument = async () => { throw secretError; };
  await assert.rejects(f.worker().publish({ ready: true, botId: CLIENT_ID }), error => error === secretError);
  f.storage.databaseEnabled = async () => { throw secretError; };
  assert.deepEqual(await f.worker().read(), { botReady: null, botStatus: 'unavailable', botLastSeen: null });
});

test('niepowodzenie zapisu nie blokuje następnych prób tej samej instancji', async () => {
  const f = fixture();
  const writer = f.worker();
  const update = f.storage.updateDocument;
  f.storage.updateDocument = async () => { throw new Error('unavailable'); };
  await assert.rejects(writer.publish({ ready: true, botId: CLIENT_ID }), /unavailable/);
  f.storage.updateDocument = update;
  assert.equal(await writer.publish({ ready: true, botId: CLIENT_ID }), true);
  assert.equal((await f.worker().read()).botStatus, 'online');
});

test('ping i czas startu są odczytywane tylko z poprawnego sygnału', async () => {
  const f = fixture();
  const writer = f.worker();
  await writer.publish({ ready: true, botId: CLIENT_ID, ping: 42.4, startedAt: '2026-11-13T10:00:00.000Z' });
  assert.deepEqual(await writer.read(), { botReady: true, botStatus: 'online', botLastSeen: f.iso(), botPing: 42, botStartedAt: '2026-11-13T10:00:00.000Z' });
  await writer.publish({ ready: true, botId: CLIENT_ID, ping: -1, startedAt: 'nie-data' });
  const kept = await writer.read();
  assert.equal(kept.botPing, 42);
  assert.equal(kept.botStartedAt, '2026-11-13T10:00:00.000Z');
});

test('wymaga tożsamości konfiguracji oraz logicznej gotowości', async () => {
  assert.throws(() => new WorkerStatus({ guildId: '', clientId: CLIENT_ID }), /GUILD_ID/);
  const f = fixture();
  await assert.rejects(f.worker().publish({ ready: 'false', botId: CLIENT_ID }), /logiczną/);
  assert.equal(f.documents.size, 0);
});
