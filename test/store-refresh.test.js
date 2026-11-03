import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationStore } from '../src/store.js';
import { FeatureStore } from '../src/feature-store.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, Store) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'strefa-refresh-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  await store.init();
  return store;
}

const application = () => ({ id: 'ABCDEF01', userId: 'user1', status: 'pending' });

test('odświeżenie podań czeka na zakończenie zapisu i zwraca nowy stan', async t => {
  const store = await fixture(t, ApplicationStore);
  const writing = deferred();
  const release = deferred();
  const writeFile = fs.writeFile;
  let held = false;
  t.mock.method(fs, 'writeFile', async (...args) => {
    if (!held) {
      held = true;
      writing.resolve();
      await release.promise;
    }
    return writeFile(...args);
  });
  t.after(() => release.resolve());
  const save = store.create(application(), 0);
  await writing.promise;
  const refreshing = store.refresh();
  release.resolve();
  const [, applications] = await Promise.all([save, refreshing]);
  assert.deepEqual(applications, [application()]);
});

test('odświeżenie ustawień czeka na asynchroniczną zmianę modułów', async t => {
  const store = await fixture(t, FeatureStore);
  const changing = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  const save = store.update(async state => {
    changing.resolve();
    await release.promise;
    state.economyConfig.currencySymbol = 'Nowa waluta';
  });
  await changing.promise;
  const refreshing = store.refresh();
  release.resolve();
  const [, state] = await Promise.all([save, refreshing]);
  assert.equal(state.economyConfig.currencySymbol, 'Nowa waluta');
});

test('błąd zmiany podania nie blokuje odświeżenia ani kolejnego zapisu', async t => {
  const store = await fixture(t, ApplicationStore);
  const failed = store.update('BRAK', () => {});
  const refreshing = store.refresh();
  await assert.rejects(failed, /Nie znaleziono podania/);
  assert.deepEqual(await refreshing, []);
  await store.create(application(), 0);
  assert.deepEqual(await store.refresh(), [application()]);
});

test('błąd zmiany modułów nie blokuje odświeżenia ani kolejnego zapisu', async t => {
  const store = await fixture(t, FeatureStore);
  const failed = store.update(() => { throw new Error('przerwana zmiana'); });
  const refreshing = store.refresh();
  await assert.rejects(failed, /przerwana zmiana/);
  assert.equal((await refreshing).economyConfig.currencySymbol, 'StrefaCoins');
  await store.update(state => { state.economyConfig.currencySymbol = 'Nowa waluta'; });
  assert.equal((await store.refresh()).economyConfig.currencySymbol, 'Nowa waluta');
});

for (const [name, Store, snapshotMethod] of [
  ['podań', ApplicationStore, 'list'],
  ['modułów', FeatureStore, 'snapshot'],
]) {
  test(`błąd odczytu ${name} nie blokuje następnego odświeżenia`, async t => {
    class ReadFailureStore extends Store {
      failNextRead = false;

      [snapshotMethod]() {
        if (this.failNextRead) {
          this.failNextRead = false;
          throw new Error('kontrolowany błąd odczytu');
        }
        return super[snapshotMethod]();
      }
    }
    const store = await fixture(t, ReadFailureStore);
    store.failNextRead = true;
    await assert.rejects(store.refresh(), /kontrolowany błąd odczytu/);
    if (Store === ApplicationStore) {
      await store.create(application(), 0);
      assert.deepEqual(await store.refresh(), [application()]);
    } else {
      await store.update(state => { state.logChannelId = 'nowy-kanał'; });
      assert.equal((await store.refresh()).logChannelId, 'nowy-kanał');
    }
  });
}
