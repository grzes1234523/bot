import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import { initialState } from '../src/feature-store.js';
import { changelogFeed, moduleOverview, publicDashboard } from '../src/dashboard.js';
import { commandCatalog } from '../src/command-catalog.js';
import { loadReleases } from '../src/changelog-releases.js';
import { startPanelServer } from '../src/panel-server.js';

const guildId = '123456789012345679';

test('karty modułów odróżniają włączone ustawienia od widoków', () => {
  const state = initialState();
  state.welcome.guilds[guildId] = { enabled: true, channelId: '1', categoryId: null, message: 'Cześć' };
  state.autoChannels.joinChannelId = '9';
  state.verification.roleId = '4';
  state.logChannelId = '5';
  state.automod = { keywords: ['spam'], ruleId: '6', enabled: true };
  state.community.guilds[guildId] = { settings: { gamesEnabled: false, ideasEnabled: true } };
  const modules = moduleOverview(state, guildId);
  assert.equal(modules.length, 15);
  assert.deepEqual(modules.map(item => item.id), ['statystyki', 'aktywnosc', 'powitania', 'ekonomia', 'poziomy', 'auto-kanaly', 'zabawy', 'pomysly', 'moderacja', 'auto-mod', 'moderowane-kanaly', 'tickets', 'weryfikacja', 'logi', 'automatyzacje']);
  const byId = Object.fromEntries(modules.map(item => [item.id, item]));
  assert.equal(byId.powitania.enabled, true);
  assert.equal(byId.powitania.label, 'Włączony');
  assert.equal(byId.zabawy.enabled, false);
  assert.equal(byId.zabawy.label, 'Wyłączony');
  assert.equal(byId.pomysly.enabled, true);
  assert.equal(byId['auto-kanaly'].enabled, true);
  assert.equal(byId['auto-mod'].enabled, true);
  assert.equal(byId.weryfikacja.enabled, true);
  assert.equal(byId.logi.enabled, true);
  assert.equal(byId.statystyki.label, 'Aktywny');
  assert.equal(byId.tickets.enabled, false);
  assert.equal(byId.automatyzacje.enabled, true);
  for (const item of modules) assert.match(item.href, /^#/);
});

test('katalog komend ma kategorie i podkomendy z kodu bota', () => {
  const list = commandCatalog();
  assert.ok(list.length > 20);
  assert.ok(list.some(row => row.usage === '/rekrutacja-panel' && row.category === 'Rekrutacja'));
  assert.ok(list.some(row => row.usage === '/zabawa milionerzy' && row.category === 'Zabawy'));
  assert.ok(list.some(row => row.usage === '/ticket-admin panel' && row.category === 'Tickets'));
  assert.ok(list.some(row => row.category === 'Embedy'));
  assert.equal(new Set(list.map(row => row.usage)).size, list.length);
});

test('dziennik aktualizacji korzysta z tych samych wersji co karty historii', () => {
  const releases = loadReleases().slice(0, 1);
  const manual = [{ type: 'dodano', area: 'bot', description: 'Ręczny wpis', timestamp: '2026-11-01T10:00:00Z' }];
  const feed = changelogFeed(releases, manual);
  const points = ['zmienione', 'dodane', 'usuniete'].reduce((sum, key) => sum + releases[0][key].filter(point => point && point !== '—').length, 0);
  assert.equal(feed.length, points + 1);
  assert.equal(feed.at(-1).description, 'Ręczny wpis');
  assert.ok(feed.some(item => item.version === releases[0].version && item.description === releases[0].dodane[0] || item.description === releases[0].zmienione[0]));
  assert.equal(changelogFeed([], []).length, 0);
});

test('pulpit zwraca moduły, komendy i skrót wersji', () => {
  const dashboard = publicDashboard(initialState(), guildId);
  assert.equal(dashboard.modules.length, 15);
  assert.ok(dashboard.commands.length > 20);
  assert.ok(dashboard.releases.length >= 1);
  assert.equal(dashboard.releases[0].version, loadReleases()[0].version);
  assert.ok(dashboard.releases[0].summary);
});

test('favicon i strona aktualizacji są podlinkowane', () => {
  for (const file of ['src/panel/index.html', 'src/panel/aktualizacje.html', 'src/panel/wybor-serwera.html', 'src/panel/poziomy-podglad.html']) {
    assert.match(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /rel="icon" href="\/favicon\.ico"/);
  }
  const html = fs.readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="welcomeImagePreview"[^>]*data-empty="true"[^>]*src="data:image\/gif/);
  assert.match(html, /id="farewellImagePreview"[^>]*data-empty="true"[^>]*src="data:image\/gif/);
  assert.match(html, /id="navToggle"/);
  assert.match(html, /id="dashBotMessage"/);
  assert.match(html, /id="dashCommandSearch"/);
});

test('favicon i dziennik wersji są dostępne bez sesji', async t => {
  const previous = { PORT: process.env.PORT, PANEL_HOST: process.env.PANEL_HOST, GUILD_ID: process.env.GUILD_ID };
  process.env.PORT = '0';
  process.env.PANEL_HOST = '127.0.0.1';
  process.env.GUILD_ID = guildId;
  const server = startPanelServer({
    client: { isReady: () => false, guilds: { cache: new Map() } },
    getApplications: () => [],
    featureStore: { snapshot: () => ({ changelog: { [guildId]: [{ type: 'dodano', area: 'bot', description: 'Ręczny wpis', timestamp: '2026-11-01T10:00:00Z' }] } }), async refresh() {} },
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.close();
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const icon = await fetch(`${base}/favicon.ico`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type'), /icon/);
  assert.ok((await icon.arrayBuffer()).byteLength > 100);
  const script = await (await fetch(`${base}/aktualizacje.js`)).text();
  assert.match(script, /window\.STREFA_RELEASES/);
  assert.match(script, /Ręczny wpis/);
  assert.match(script, /2026\.11\.13-panel/);
});
