import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationStore, EligibilityError } from '../src/store.js';
import { KeyedLock } from '../src/lock.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rekrutacja-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'data', 'applications.json');
  const store = new ApplicationStore(filename);
  await store.init();
  return { filename, store };
}
const app = (id, userId = 'user1') => ({ id, userId, status: 'pending', createdAt: new Date().toISOString(), reviewMessageId: null });

test('tworzy plik i zapisuje podanie', async t => {
  const { filename, store } = await fixture(t);
  await store.create(app('ABCDEF01'), 24);
  assert.equal(store.get('ABCDEF01').userId, 'user1');
  assert.equal(JSON.parse(await fs.readFile(filename, 'utf8')).ABCDEF01.status, 'pending');
});

test('blokuje równoległe podwójne podania jednej osoby', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([
    store.create(app('ABCDEF01'), 24),
    store.create(app('ABCDEF02'), 24),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(store.list().length, 1);
});

test('po odrzuceniu respektuje cooldown, a po nim pozwala złożyć kolejne podanie', async t => {
  const { store } = await fixture(t);
  await store.create(app('ABCDEF01'), 24);
  await store.update('ABCDEF01', value => {
    value.status = 'rejected';
    value.decisionAt = new Date().toISOString();
  });
  await assert.rejects(() => store.create(app('ABCDEF02'), 24), e => e instanceof EligibilityError && e.code === 'COOLDOWN');
  await store.create(app('ABCDEF02'), 0);
  assert.equal(store.list().length, 2);
});

test('akceptacja uniemożliwia ponowne zgłoszenie; zachowuje stare podania', async t => {
  const { store, filename } = await fixture(t);
  await store.create(app('ABCDEF01'), 24);
  await store.update('ABCDEF01', value => { value.status = 'accepted'; });
  await assert.rejects(() => store.create(app('ABCDEF02'), 0), e => e.code === 'ACCEPTED');
  const reloaded = new ApplicationStore(filename);
  await reloaded.init();
  assert.equal(reloaded.get('ABCDEF01').status, 'accepted');
});

test('odrzuca uszkodzony JSON bez wymazywania historii', async t => {
  const { filename } = await fixture(t);
  await fs.writeFile(filename, '{uszkodzony', 'utf8');
  const another = new ApplicationStore(filename);
  await assert.rejects(() => another.init(), SyntaxError);
  assert.equal(await fs.readFile(filename, 'utf8'), '{uszkodzony');
});

test('po błędzie mutacji następne zapisy nadal działają', async t => {
  const { store } = await fixture(t);
  await assert.rejects(() => store.update('BRAK', () => {}));
  await store.create(app('ABCDEF01'), 24);
  assert.equal(store.get('ABCDEF01').status, 'pending');
});

test('blokada per ID zapobiega podwójnemu rozpatrzeniu', async () => {
  const lock = new KeyedLock();
  let status = 'pending';
  let accepted = 0;
  await Promise.all([
    lock.run('id1', async () => { if (status !== 'pending') return; await Promise.resolve(); status = 'accepted'; accepted++; }),
    lock.run('id1', async () => { if (status !== 'pending') return; status = 'accepted'; accepted++; }),
  ]);
  assert.equal(accepted, 1);
});
