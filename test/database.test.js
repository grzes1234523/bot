import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientDatabaseError, retryDatabaseOperation } from '../src/database.js';

test('ponawia chwilowe błędy PostgreSQL i kończy po udanym połączeniu', async () => {
  let attempts = 0;
  const waits = [];
  const value = await retryDatabaseOperation(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    return 'connected';
  }, { sleep: async ms => waits.push(ms) });
  assert.equal(value, 'connected');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('rozpoznaje przejściowe błędy także w przyczynie i nie ponawia błędów SQL', async () => {
  assert.equal(isTransientDatabaseError(new Error('wrapped', { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) })), true);
  assert.equal(isTransientDatabaseError(Object.assign(new Error('syntax'), { code: '42601' })), false);
  let attempts = 0;
  await assert.rejects(retryDatabaseOperation(async () => {
    attempts += 1;
    throw Object.assign(new Error('syntax'), { code: '42601' });
  }, { sleep: async () => {} }), /syntax/);
  assert.equal(attempts, 1);
});

test('po wyczerpaniu prób przekazuje ostatni błąd połączenia', async () => {
  let attempts = 0;
  await assert.rejects(retryDatabaseOperation(async () => {
    attempts += 1;
    throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
  }, { attempts: 3, sleep: async () => {} }), error => error.code === 'ECONNREFUSED');
  assert.equal(attempts, 3);
});
