import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationStore } from '../src/store.js';
import { FormSessions } from '../src/form-sessions.js';
import { QUESTION_STAGES, ALL_QUESTIONS, validateStepAnswers } from '../src/questions.js';

const application = (id, status, userId = id) => ({
  id, userId, status, createdAt: new Date().toISOString(), reviewMessageId: null,
});

async function makeStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rekrutacja-upgrade-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data', 'applications.json');
  const store = new ApplicationStore(file);
  await store.init();
  return { store, file };
}

test('formularz ma 15 niepowtarzających się pytań rozłożonych po 5 na etap', () => {
  assert.equal(QUESTION_STAGES.length, 3);
  assert.deepEqual(QUESTION_STAGES.map(x => x.questions.length), [5, 5, 5]);
  assert.equal(ALL_QUESTIONS.length, 15);
  assert.equal(new Set(ALL_QUESTIONS.map(q => q.key)).size, 15);
  assert.ok(ALL_QUESTIONS.every(q => q.label.length <= 45));
  assert.ok(ALL_QUESTIONS.reduce((sum, q) => sum + q.max + q.label.length + 20, 0) < 5800);
});

test('walidacja wszystkich etapów i nieprawidłowego wieku', () => {
  for (let step = 1; step <= 3; step++) {
    const answers = Object.fromEntries(QUESTION_STAGES[step - 1].questions.map(q =>
      [q.key, q.key === 'age' ? '20' : 'X'.repeat(Math.max(q.min, 1))]));
    assert.deepEqual(validateStepAnswers(step, answers), answers);
  }
  const values = Object.fromEntries(QUESTION_STAGES[0].questions.map(q => [q.key, 'x'.repeat(Math.max(1, q.min))]));
  values.age = 'pięć';
  assert.throws(() => validateStepAnswers(1, values), /lat/);
});

test('sesja przechodzi 3 etapy; nie można użyć starego tokenu lub powtórzyć etapu', () => {
  let now = 1000;
  const sessions = new FormSessions(10_000, () => now);
  const original = sessions.start('user1');
  assert.ok(sessions.get('user1', original.token, 1));
  const stage2 = sessions.advance('user1', original.token, 1, { position: 'Helper' });
  assert.equal(stage2.stage, 2);
  assert.equal(sessions.get('user1', original.token, 1), null);
  assert.equal(sessions.get('someoneElse', original.token, 2), null);
  sessions.advance('user1', original.token, 2, { rules: 'Zgłaszam' });
  assert.equal(sessions.get('user1', original.token, 3).answers.position, 'Helper');
  const restarted = sessions.start('user1');
  assert.equal(sessions.get('user1', original.token, 1), null);
  now += 10_001;
  assert.equal(sessions.get('user1', restarted.token, 1), null);
});

test('czyszczenie usuwa tylko rozpatrzone, tworzy kopię i zachowuje pending', async t => {
  const { store, file } = await makeStore(t);
  await Promise.all([
    store.create(application('AA000001', 'pending'), 0),
    store.create(application('AA000002', 'accepted'), 0),
    store.create(application('AA000003', 'rejected'), 0),
    store.create(application('AA000004', 'closed'), 0),
  ]);
  const result = await store.deleteFinished({ status: 'all' });
  assert.equal(result.deleted.length, 3);
  assert.equal(store.list().length, 1);
  assert.equal(store.get('AA000001').status, 'pending');
  const backup = JSON.parse(await fs.readFile(result.backupPath, 'utf8'));
  assert.equal(Object.keys(backup).length, 4);
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(file, 'utf8'))), ['AA000001']);
});

test('pojedyncze usuwanie nie może skasować oczekującego', async t => {
  const { store } = await makeStore(t);
  await store.create(application('AA000001', 'pending'), 0);
  await store.create(application('AA000002', 'accepted'), 0);
  const none = await store.deleteFinished({ id: 'AA000001' });
  assert.deepEqual(none.deleted, []);
  assert.equal(none.backupPath, null);
  assert.equal(store.get('AA000001').status, 'pending');
  const deleted = await store.deleteFinished({ id: 'AA000002' });
  assert.deepEqual(deleted.deleted.map(x => x.id), ['AA000002']);
  assert.equal(store.get('AA000002'), null);
});

test('filtrowanie statusów usuwa wyłącznie pasujące podania', async t => {
  const { store } = await makeStore(t);
  await store.create(application('AA000001', 'accepted'), 0);
  await store.create(application('AA000002', 'rejected'), 0);
  const result = await store.deleteFinished({ status: 'rejected' });
  assert.deepEqual(result.deleted.map(x => x.id), ['AA000002']);
  assert.equal(store.get('AA000001').status, 'accepted');
  await assert.rejects(() => store.deleteFinished({ status: 'pending' }), /filtr/);
});

test('czyszczenie współbieżne jest atomowe i nie usuwa dwa razy', async t => {
  const { store } = await makeStore(t);
  await store.create(application('AA000001', 'accepted'), 0);
  const [one, two] = await Promise.all([store.deleteFinished(), store.deleteFinished()]);
  assert.equal(one.deleted.length + two.deleted.length, 1);
  assert.equal(store.get('AA000001'), null);
});
