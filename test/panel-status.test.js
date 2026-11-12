import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startPanelServer } from '../src/panel-server.js';
import { WorkerStatus } from '../src/worker-status.js';

const clientId = '123456789012345678';
const guildId = '123456789012345679';
const localFetch = globalThis.fetch;

async function fixture(t, {
  mode, ready = false, permissions = '32', guildPresent = true,
  getApplications = () => [{ id: 'A1', status: 'pending', createdAt: '2026-01-01T12:00:00Z' }],
  featureStore = { snapshot: () => ({}) },
  getWorkerStatus, refreshData, workerStatusTimeoutMs, refreshDataTimeoutMs, oauthGuilds, getGuildApplications,
} = {}) {
  const env = {
    CLIENT_ID: clientId,
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
    getApplications,
    getGuildApplications,
    featureStore,
    getWorkerStatus,
    refreshData,
    workerStatusTimeoutMs,
    refreshDataTimeoutMs,
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
  const request = (route, cookie, options = {}) => localFetch(`${baseUrl}${route}`, {
    ...options,
    redirect: 'manual',
    headers: { ...(options.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) },
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
      if (String(url).startsWith('https://discord.com/api/v10/users/@me/guilds')) return Response.json(oauthGuilds ?? [{ id: guildId, permissions }]);
      throw new Error(`Niedozwolone połączenie w teście: ${url}`);
    });
    try {
      const response = await request(`/auth/discord/callback?code=test-code&state=${encodeURIComponent(state)}`, cookie);
      assert.equal(response.status, 302);
      assert.equal(calls.length, 3);
      return response.headers.get('set-cookie').split(';')[0];
    } finally { mockedFetch.mock.restore(); }
  }
  return { request, authenticate, client, guild };
}

test('statystyki REST używają danych workera zamiast niepełnego cache panelu', async t => {
  const serverStatistics = { guildId, members: 24, humans: 17, bots: 7, online: 13, updatedAt: new Date().toISOString() };
  const state = { serverStatistics, economy: {}, economyConfig: {} };
  const panel = await fixture(t, { mode: 'rest', featureStore: { snapshot: () => state } });
  const { Collection } = await import('discord.js');
  panel.guild.channels = { cache: new Collection() };
  panel.guild.memberCount = 0;
  panel.guild.members = { cache: new Collection([['self', { user: { bot: true } }]]) };
  const cookie = await panel.authenticate();
  let response = await panel.request('/api/statistics', cookie);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual([data.members, data.humans, data.bots, data.online], [24, 17, 7, 13]);
  assert.equal(data.updatedAt, serverStatistics.updatedAt);
  state.serverStatistics = null;
  response = await panel.request('/api/statistics', cookie);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /aktualne statystyki/);
});

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

test('panel poziomów wymaga sesji i uprawnień zarządzania serwerem', async t => {
  const panel = await fixture(t, { mode: 'rest', permissions: '0' });
  assert.equal((await panel.request('/api/levels')).status, 401);
  const cookie = await panel.authenticate();
  assert.equal((await panel.request('/api/levels', cookie)).status, 403);
});

test('zabawy, pomysły i aktywność wymagają logowania oraz uprawnień', async t => {
  const panel = await fixture(t, { mode: 'rest', permissions: '0' });
  for (const route of ['/api/community', '/api/activity']) assert.equal((await panel.request(route)).status, 401);
  const cookie = await panel.authenticate();
  for (const route of ['/api/community', '/api/activity']) assert.equal((await panel.request(route, cookie)).status, 403);
});

test('udany zapis ustawień zapisuje aktora i działanie w historii, odrzucone źródło nie zapisuje', async t => {
  let state = {};
  const featureStore = { snapshot: () => structuredClone(state), update: async fn => fn(state) };
  const panel = await fixture(t, { mode: 'rest', featureStore });
  panel.client.guilds.cache.get(guildId).id = guildId;
  const cookie = await panel.authenticate();
  const url = new URL('/api/community', (await panel.request('/health')).url);
  const body = JSON.stringify({ gamesEnabled: true, ideasEnabled: true, categoryId: null, ideasChannelId: null });
  const response = await localFetch(url, { method: 'POST', headers: { Cookie: cookie, Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body });
  assert.equal(response.status, 200);
  await response.json();
  assert.equal(state.panelActivity.length, 1);
  assert.equal(state.panelActivity[0].actor.name, 'tester');
  const rejected = await localFetch(url, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body });
  assert.equal(rejected.status, 403);
  assert.equal(state.panelActivity.length, 1);
  const activity = await (await panel.request('/api/activity', cookie)).json();
  assert.equal(activity.entries[0].route, '/api/community');
});

test('panel poziomów odczytuje ranking ze wspólnych danych bota', async t => {
  const panel = await fixture(t, { mode: 'rest', featureStore: { snapshot: () => ({ levels: { guilds: { [guildId]: { users: { user: { xp: 400, messageCount: 10, voiceMinutes: 50 } } } } } }) } });
  panel.client.guilds.cache.get(guildId).roles = { fetch: async () => new MapWithFilter() };
  panel.client.guilds.cache.get(guildId).channels = { fetch: async () => new MapWithFilter() };
  class MapWithFilter extends Map { filter() { return { map: () => [] }; } }
  const cookie = await panel.authenticate();
  const response = await panel.request('/api/levels', cookie);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ranking[0].level, 2);
  assert.equal(result.totals.xp, 400);
  assert.equal(result.settings.voiceEnabled, true);
});

test('panel REST bez adaptera statusu udostępnia rekrutację ze stanem workera unknown', async t => {
  const panel = await fixture(t, { mode: 'rest' });
  const health = await (await panel.request('/health')).json();
  assert.equal(health.botReady, null);
  assert.equal(health.botStatus, 'unknown');
  assert.equal(health.discordReady, true);
  assert.equal(panel.client.isReady(), false, 'panel nie nadpisuje stanu klienta Gateway');
  const cookie = await panel.authenticate();
  const session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.canManage, true);
  assert.equal(session.botReady, null);
  assert.equal(session.botStatus, 'unknown');
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
  assert.equal((await panel.request('/api/recruitment', cookie)).status, 403);
});

function sharedWorkerStorage() {
  let now = Date.parse('2026-01-01T12:00:00Z');
  const documents = new Map();
  let queue = Promise.resolve();
  const storage = {
    async databaseEnabled() { return true; },
    async refreshDocument(key) { return structuredClone(documents.get(key) ?? null); },
    updateDocument(key, initial, change) {
      const task = queue.then(async () => {
        const state = structuredClone(documents.get(key) ?? initial);
        const result = await change(state);
        documents.set(key, structuredClone(state));
        return { state, result };
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  return {
    instance: (scope = {}) => new WorkerStatus({ guildId, clientId, storage, now: () => now, ...scope }),
    advance: milliseconds => { now += milliseconds; },
    lastSeen: () => new Date(now).toISOString(),
  };
}

test('panel HTTP odczytuje online, offline i wygasły heartbeat osobnego workera bez restartu', async t => {
  const shared = sharedWorkerStorage();
  const writer = shared.instance();
  const reader = shared.instance();
  const panel = await fixture(t, { mode: 'rest', getWorkerStatus: () => reader.read() });
  const cookie = await panel.authenticate();
  await writer.publish({ ready: true, botId: clientId });
  const health = await (await panel.request('/health')).json();
  assert.equal(health.botReady, true);
  assert.equal(health.botStatus, 'online');
  assert.equal(health.botLastSeen, shared.lastSeen());
  assert.equal(health.discordReady, true);
  let session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.botReady, true);
  assert.equal(session.botStatus, 'online');

  shared.advance(1000);
  await writer.publish({ ready: false, botId: clientId });
  session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.botReady, false);
  assert.equal(session.botStatus, 'offline');
  assert.equal(session.botLastSeen, shared.lastSeen());
  assert.equal(session.discordReady, true, 'offline workera nie wyłącza niezależnego REST');
  assert.equal((await panel.request('/api/recruitment', cookie)).status, 200);

  await writer.publish({ ready: true, botId: clientId });
  const lastSeen = shared.lastSeen();
  shared.advance(45_001);
  session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.botReady, false);
  assert.equal(session.botStatus, 'stale');
  assert.equal(session.botLastSeen, lastSeen);
  assert.equal(session.discordReady, true);
  await writer.publish({ ready: true, botId: clientId });
  session = await (await panel.request('/api/session', cookie)).json();
  assert.equal(session.botReady, true);
  assert.equal(session.botStatus, 'online');
});

for (const scope of [{ guildId: 'another-guild' }, { clientId: 'another-client' }]) {
  test(`panel nie przypisuje sobie heartbeatu innego ${scope.guildId ? 'serwera' : 'bota'}`, async t => {
    const shared = sharedWorkerStorage();
    await shared.instance().publish({ ready: true, botId: clientId });
    const reader = shared.instance(scope);
    const panel = await fixture(t, { mode: 'rest', getWorkerStatus: () => reader.read() });
    const cookie = await panel.authenticate();
    const session = await (await panel.request('/api/session', cookie)).json();
    assert.equal(session.botReady, null);
    assert.equal(session.botStatus, 'unknown');
    assert.equal(session.botLastSeen, null);
    assert.equal(session.discordReady, true);
  });
}

for (const [description, getWorkerStatus] of [
  ['błąd odczytu', async () => { throw new Error('database-private-test-secret'); }],
  ['brak odpowiedzi', () => new Promise(() => {})],
]) {
  test(`niedostępny status workera (${description}) nie blokuje panelu HTTP`, async t => {
    const panel = await fixture(t, { mode: 'rest', getWorkerStatus, workerStatusTimeoutMs: 20 });
    const cookie = await panel.authenticate();
    for (const [route, sessionCookie] of [['/health', undefined], ['/api/session', cookie]]) {
      const started = performance.now();
      const response = await panel.request(route, sessionCookie);
      assert.ok(performance.now() - started < 1000, 'odczyt statusu ma ograniczony czas oczekiwania');
      assert.equal(response.status, 200);
      const status = await response.json();
      assert.equal(status.botReady, null);
      assert.equal(status.botStatus, 'unavailable');
      assert.equal(status.botLastSeen, null);
      assert.equal(status.discordReady, true);
      assert.ok(!JSON.stringify(status).includes('database-private-test-secret'));
    }
  });
}

test('autoryzowane odczyty odświeżają podania i ustawienia przed utworzeniem odpowiedzi', async t => {
  let storedApplications = [{ id: 'A1', status: 'pending', createdAt: '2026-01-01T12:00:00Z' }];
  let storedFeatures = {};
  let visibleApplications = [];
  let visibleFeatures = {};
  let refreshes = 0;
  const panel = await fixture(t, {
    mode: 'rest',
    getApplications: () => visibleApplications,
    featureStore: { snapshot: () => visibleFeatures },
    refreshData: async () => {
      await Promise.resolve();
      refreshes += 1;
      visibleApplications = structuredClone(storedApplications);
      visibleFeatures = structuredClone(storedFeatures);
    },
  });
  const cookie = await panel.authenticate();
  assert.equal(refreshes, 0, 'samo logowanie nie ładuje chronionych danych');
  let response = await panel.request('/api/recruitment', cookie);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).counts.pending, 1);
  assert.equal(refreshes, 1);

  storedApplications = [{ id: 'A2', status: 'accepted', createdAt: '2026-01-01T12:01:00Z' }];
  storedFeatures = { autoChannels: { joinChannelId: 'voice-channel' }, verification: { roleId: 'role' } };
  response = await panel.request('/api/recruitment', cookie);
  const recruitment = await response.json();
  assert.equal(recruitment.counts.pending, 0);
  assert.equal(recruitment.counts.accepted, 1);
  assert.equal(recruitment.applications[0].id, 'A2');
  response = await panel.request('/api/features', cookie);
  assert.equal(response.status, 200);
  const features = await response.json();
  assert.equal(features.automations.autoChannels, true);
  assert.equal(features.automations.verification, true);
  assert.equal(refreshes, 3);
});

for (const authenticated of [false, true]) {
  test(`odświeżanie danych nie następuje dla ${authenticated ? 'konta bez uprawnień' : 'anonimowego żądania'}`, async t => {
    let refreshes = 0;
    const panel = await fixture(t, {
      mode: 'rest', permissions: '0', refreshData: async () => { refreshes += 1; },
    });
    const cookie = authenticated ? await panel.authenticate() : undefined;
    for (const route of ['/api/recruitment', '/api/features']) {
      const response = await panel.request(route, cookie);
      assert.equal(response.status, authenticated ? 403 : 401);
    }
    assert.equal(refreshes, 0);
  });
}

for (const [description, refreshData] of [
  ['błąd bazy', async () => { throw new Error('postgres://private-user:private-db-password@database/bot'); }],
  ['zawieszone zapytanie', () => new Promise(() => {})],
]) {
  test(`odświeżanie danych: ${description} daje ograniczone czasowo 503 bez ujawniania szczegółów`, async t => {
    const panel = await fixture(t, { mode: 'rest', refreshData, refreshDataTimeoutMs: 20 });
    const cookie = await panel.authenticate();
    for (const route of ['/api/recruitment', '/api/features']) {
      const started = performance.now();
      const response = await panel.request(route, cookie);
      assert.ok(performance.now() - started < 1000, 'odświeżanie nie blokuje żądania bez końca');
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.match(body.error, /wspólnej bazy/);
      assert.ok(!JSON.stringify(body).includes('private-db-password'));
      assert.ok(!JSON.stringify(body).includes('postgres://'));
      assert.equal(body.applications, undefined, 'nie zwraca starych danych po nieudanym odświeżeniu');
    }
    const health = await panel.request('/health');
    assert.equal(health.status, 200, 'awaria danych nie zmienia żywotności HTTP');
    assert.equal((await health.json()).ok, true);
  });
}


test('wybór serwera izoluje ekonomię, tickety i rekrutację oraz blokuje obce ID', async t => {
  const { initialState } = await import('../src/feature-store.js');
  const { Collection } = await import('discord.js');
  const other = '123456789012345680', forbidden = '123456789012345681';
  const state = initialState(); state.economyConfig.currencySymbol = 'STARE';
  state.tickets.panels.push({ guildId, messageId: 'old-message', channelId: 'old-channel', title: 'Stary panel' });
  const featureStore = { snapshot: () => structuredClone(state), update: async change => change(state) };
  const panel = await fixture(t, { mode: 'rest', featureStore,
    oauthGuilds: [{ id: guildId, name: 'Strefa', permissions: '32' }, { id: other, name: 'Nowy', permissions: '32' }, { id: forbidden, name: 'Obcy', permissions: '0' }],
    getGuildApplications: async id => id === other ? [{ id: 'NEW', status: 'pending' }] : [{ id: 'OLD', status: 'accepted' }],
  });
  let allowed = true;
  panel.client.guilds.cache.set(other, { id: other, name: 'Nowy', iconURL: () => null,
    members: { fetch: async () => ({ permissions: { has: () => allowed } }) },
    channels: { fetch: async () => new Collection() }, roles: { fetch: async () => new Collection() },
  });
  const cookie = await panel.authenticate();
  const post = (route, body, headers = {}) => panel.request(route, cookie, { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let response = await panel.request('/api/guilds', cookie); const guilds = await response.json();
  assert.equal(guilds.guilds.length, 2); assert.ok(guilds.guilds.every(g => g.id !== forbidden));
  assert.equal((await post('/api/guilds', { guildId: forbidden })).status, 403);
  assert.equal((await post('/api/guilds', { guildId: other }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await post('/api/guilds', { guildId: other })).status, 200);
  const config = { ...state.economyConfig, currencySymbol: 'NOWE' };
  assert.equal((await post('/api/economy/settings', config)).status, 200);
  assert.equal(state.economyConfig.currencySymbol, 'STARE');
  assert.equal(state.serverModules[other].economyConfig.currencySymbol, 'NOWE');
  response = await panel.request('/api/recruitment', cookie); assert.equal((await response.json()).applications[0].id, 'NEW');
  response = await panel.request('/api/tickets/panels', cookie); assert.deepEqual((await response.json()).panels, []);
  response = await post('/api/tickets/panels', { action: 'delete', panelId: 'old-message' }); assert.equal(response.status, 404);
  assert.equal(state.tickets.panels.length, 1);
  response = await panel.request('/api/economy/settings', cookie, { headers: { 'X-Guild-ID': guildId } }); assert.equal(response.status, 409);
  allowed = false;
  assert.equal((await panel.request('/api/economy/settings', cookie)).status, 403);
});


test('logowanie Discord prowadzi do centrum dowodzenia pod #server-control', async t => {
  const panel = await fixture(t, { mode: 'rest' });
  const start = await panel.request('/auth/discord');
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const mockedFetch = t.mock.method(globalThis, 'fetch', async url => {
    if (url === 'https://discord.com/api/v10/oauth2/token') return Response.json({ access_token: 'test-access-token' });
    if (url === 'https://discord.com/api/v10/users/@me') return Response.json({ id: '123456789012345682', username: 'tester' });
    if (String(url).startsWith('https://discord.com/api/v10/users/@me/guilds')) return Response.json([{ id: guildId, name: 'Strefa', permissions: '32' }]);
    throw new Error(`Niedozwolone połączenie w teście: ${url}`);
  });
  try {
    const response = await panel.request(`/auth/discord/callback?code=test-code&state=${encodeURIComponent(state)}`, cookie);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/#server-control');
  } finally { mockedFetch.mock.restore(); }
});

test('Odśwież serwery pobiera nowo dodany serwer bez ponownego logowania i nie ujawnia tokenu', async t => {
  const guilds = [{ id: guildId, name: 'Stary', permissions: '32' }];
  const panel = await fixture(t, { mode: 'rest', oauthGuilds: guilds });
  const cookie = await panel.authenticate();
  const other = '123456789012345680';
  guilds.push({ id: other, name: 'Nowy po logowaniu', owner: true, permissions: '0' });
  panel.client.guilds.cache.set(other, { name: 'Nowy po logowaniu' });
  let refreshes = 0, expired = false;
  const mocked = t.mock.method(globalThis,'fetch',async (url, options) => {
    assert.ok(String(url).startsWith('https://discord.com/api/v10/users/@me/guilds?'));
    assert.equal(options.headers.Authorization,'Bearer test-access-token'); refreshes++;
    return expired ? Response.json({}, { status: 401 }) : Response.json(guilds);
  });
  let response = await panel.request('/api/guilds?refresh=1',cookie); assert.equal(response.status,200);
  const data = await response.json(); assert.equal(data.guilds.length,2);
  assert.equal(data.guilds.find(g => g.id === other).installed,true); assert.equal(refreshes,1);
  assert.ok(!JSON.stringify(data).includes('test-access-token'));
  response = await panel.request('/api/session',cookie); assert.ok(!JSON.stringify(await response.json()).includes('test-access-token'));
  expired = true; response = await panel.request('/api/guilds?refresh=1',cookie);
  assert.equal(response.status,401); assert.equal((await response.json()).needsLogin,true);
  mocked.mock.restore();
});
