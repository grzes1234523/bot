import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startPanelServer } from '../src/panel-server.js';

const guildId = '123456789012345679';
const localFetch = globalThis.fetch;

async function fixture(t, { mode, ready = false, permissions = '32', guildPresent = true } = {}) {
  const env = {
    CLIENT_ID: '123456789012345678',
    CLIENT_SECRET: 'test-secret',
    GUILD_ID: guildId,
    PANEL_SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
    PANEL_BASE_URL: 'http://localhost:3000',
    PANEL_HOST: '127.0.0.1',
    PORT: '0',
  };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const guild = { name: 'Testowy serwer', iconURL: () => null };
  const client = {
    isReady: () => ready,
    guilds: { cache: new Map(guildPresent ? [[guildId, guild]] : []) },
  };
  const server = startPanelServer({
    client,
    getApplications: () => [{ id: 'A1', status: 'pending', createdAt: '2026-01-01T12:00:00Z' }],
    featureStore: { snapshot: () => ({}) },
    ...(mode === undefined ? {} : { discordMode: mode }),
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (route, cookie) => localFetch(`${baseUrl}${route}`, {
    redirect: 'manual',
    headers: cookie ? { Cookie: cookie } : {},
  });
  async function authenticate() {
    const start = await request('/auth/discord');
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const calls = [];
    const mockedFetch = t.mock.method(globalThis, 'fetch', async url => {
      calls.push(String(url));
      if (url === 'https://discord.com/api/v10/oauth2/token') return Response.json({ access_token: 'test-access-token' });
      if (url === 'https://discord.com/api/v10/users/@me') return Response.json({ id: '123456789012345682', username: 'tester' });
      if (url === 'https://discord.com/api/v10/users/@me/guilds') return Response.json([{ id: guildId, permissions }]);
      throw new Error(`Niedozwolone połączenie w teście: ${url}`);
    });
    try {
      const response = await request(`/auth/discord/callback?code=test-code&state=${encodeURIComponent(state)}`, cookie);
      assert.equal(response.status, 302);
      assert.equal(calls.length, 3);
      return response.headers.get('set-cookie').split(';')[0];
    } finally { mockedFetch.mock.restore(); }
  }
  return { request, authenticate, client };
}

for (const ready of [false, true]) {
  test(`health Gateway pokazuje rzeczywisty stan połączenia: ${ready}`, async t => {
    const panel = await fixture(t, { ready });
    const response = await panel.request('/health');
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.botReady, ready);
    assert.equal(status.discordReady, ready);
    assert.equal(status.panelConfigured, true);
  });
}

test('panel REST udostępnia rekrutację, ale nie potwierdza uruchomienia workera', async t => {
  const panel = await fixture(t, { mode: 'rest' });
  const health = await (await panel.request('/health')).json();
  assert.equal(health.botReady, null);
  assert.equal(health.discordReady, true);
  assert.equal(panel.client.isReady(), false, 'panel nie nadpisuje stanu klienta Gateway');
  const cookie = await panel.authenticate();
  const session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.canManage, true);
  assert.equal(session.botReady, null);
  assert.equal(session.discordReady, true);
  const response = await panel.request('/api/recruitment', cookie);
  assert.equal(response.status, 200);
  const recruitment = await response.json();
  assert.equal(recruitment.counts.pending, 1);
  assert.equal(recruitment.applications[0].id, 'A1');
});

test('panel REST nadal wymaga logowania do danych rekrutacyjnych', async t => {
  const panel = await fixture(t, { mode: 'rest' });
  assert.equal((await panel.request('/api/session')).status, 401);
  assert.equal((await panel.request('/api/recruitment')).status, 401);
});

test('panel REST nadal wymaga uprawnień administracji', async t => {
  const panel = await fixture(t, { mode: 'rest', permissions: '0' });
  const cookie = await panel.authenticate();
  assert.equal((await panel.request('/api/recruitment', cookie)).status, 403);
});

test('odłączony Gateway nie udostępnia operacji Discorda', async t => {
  const panel = await fixture(t, { mode: 'gateway', ready: false });
  const cookie = await panel.authenticate();
  const session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.botReady, false);
  assert.equal(session.discordReady, false);
  assert.equal((await panel.request('/api/recruitment', cookie)).status, 503);
});

test('panel REST nie omija sprawdzenia dostępu do skonfigurowanego serwera', async t => {
  const panel = await fixture(t, { mode: 'rest', guildPresent: false });
  const cookie = await panel.authenticate();
  assert.equal((await panel.request('/api/recruitment', cookie)).status, 503);
});
