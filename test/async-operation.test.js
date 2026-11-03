import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { withTimeout } from '../src/async-operation.js';

test('zawieszona operacja kończy oczekiwanie błędem OPERATION_TIMEOUT', async t => {
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(keepAlive));
  const started = performance.now();
  await assert.rejects(withTimeout(() => new Promise(() => {}), 20, 'Testowy limit czasu'), error => {
    assert.equal(error.code, 'OPERATION_TIMEOUT');
    assert.equal(error.message, 'Testowy limit czasu');
    return true;
  });
  assert.ok(performance.now() - started < 500);
});

test('ukończona operacja zwraca wartość bez oczekiwania na deadline', async () => {
  const result = { value: 42 };
  assert.equal(await withTimeout(async () => result, 1000), result);
  assert.equal(await withTimeout(() => false, 1000), false);
});

test('błąd operacji pozostaje oryginalnym obiektem zamiast błędem deadline', async () => {
  const failure = new Error('kontrolowany błąd operacji');
  await assert.rejects(withTimeout(async () => { throw failure; }, 1000), error => error === failure);
  await assert.rejects(withTimeout(() => { throw failure; }, 1000), error => error === failure);
});

test('późne odrzucenie po upływie deadline nie tworzy unhandledRejection', async t => {
  const unhandled = [];
  const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));
  const lateFailure = new Error('późny błąd');
  const lateOperation = delay(40).then(() => { throw lateFailure; });
  await assert.rejects(withTimeout(() => lateOperation, 5), { code: 'OPERATION_TIMEOUT' });
  await delay(75);
  assert.deepEqual(unhandled, []);
});
