import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { loadReleases, parseRelease } from '../src/changelog-releases.js';
import { CHANGELOG_CHANNEL_NAME, changelogEmbed, ensureChangelogChannel, publishGuildChangelog } from '../src/changelog.js';

test('wpisy changelogu mają datę, wersję i trzy sekcje', () => {
  const releases = loadReleases();
  assert.ok(releases.length >= 2);
  const ids = new Set();
  for (const release of releases) {
    assert.equal(parseRelease(release).id, release.id);
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(release.version);
    for (const key of ['zmienione', 'dodane', 'usuniete']) assert.ok(Array.isArray(release[key]));
    assert.equal(ids.has(release.id), false);
    ids.add(release.id);
  }
  const direct = releases.find(release => release.id === '2026.11.12-11');
  const center = releases.find(release => release.id === '2026.11.12-10');
  assert.match(direct.dodane.join(' '), /Zmień serwer/);
  assert.match(direct.zmienione.join(' '), /centrum dowodzenia/);
  assert.match(center.zmienione.join(' '), /checksPass|Łącznie|#server-control/);
  assert.throws(() => parseRelease({ id: 'zly', version: '1', date: 'wczoraj', zmienione: [], dodane: [], usuniete: [] }));
});

function memoryStore() {
  const state = { changelogPosts: {} };
  return { snapshot: () => state, async update(change) { await change(state); } };
}

function guildFixture({ manage = true, existing = false, canSend = true } = {}) {
  const sent = [];
  const created = [];
  const me = { id: 'bot', permissions: { has: () => manage } };
  const everyone = { id: 'everyone' };
  const channel = existing ? {
    id: 'old', name: 'Informacja-Bot', type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => canSend }),
    send: async payload => { sent.push(payload); return { id: 'm' }; },
  } : null;
  const cache = new Map(channel ? [[channel.id, channel]] : []);
  const guild = {
    id: '123456789012345679', name: 'Strefa',
    roles: { everyone },
    members: { me },
    channels: {
      cache,
      create: async options => {
        created.push(options);
        const made = { id: 'new', name: options.name, type: options.type, permissionsFor: () => ({ has: () => true }), send: async payload => { sent.push(payload); return { id: 'm2' }; } };
        cache.set(made.id, made);
        return made;
      },
    },
  };
  return { guild, sent, created, me, everyone };
}

test('kanał informacja-bot powstaje tylko raz i jest ukryty przed wszystkimi', async () => {
  const fresh = guildFixture();
  const channel = await ensureChangelogChannel(fresh.guild, () => {});
  assert.equal(channel.name, CHANGELOG_CHANNEL_NAME);
  assert.equal(fresh.created.length, 1);
  const [overwrite] = fresh.created[0].permissionOverwrites;
  assert.equal(overwrite.id, fresh.everyone.id);
  assert.equal(overwrite.allow, undefined);
  assert.ok(overwrite.deny.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(fresh.created[0].permissionOverwrites.at(-1).allow.includes(PermissionFlagsBits.SendMessages));
  const again = await ensureChangelogChannel(fresh.guild, () => {});
  assert.equal(again.id, channel.id);
  assert.equal(fresh.created.length, 1);
});

test('brak uprawnienia do kanałów jest zapisany w logu i nie przerywa startu', async () => {
  const logs = [];
  const blocked = guildFixture({ manage: false });
  const channel = await ensureChangelogChannel(blocked.guild, message => logs.push(message));
  assert.equal(channel, null);
  assert.equal(blocked.created.length, 0);
  assert.match(logs.join('\n'), /Zarządzanie kanałami/);
  const result = await publishGuildChangelog(blocked.guild, memoryStore(), message => logs.push(message));
  assert.deepEqual(result.posted, []);
});

test('wpis changelogu jest wysyłany raz, a restart nie dubluje embedu', async () => {
  const { guild, sent } = guildFixture();
  const store = memoryStore();
  const first = await publishGuildChangelog(guild, store, () => {});
  assert.deepEqual(first.posted, loadReleases().map(release => release.id).sort());
  assert.equal(sent.length, loadReleases().length);
  const embed = sent.at(-1).embeds[0].toJSON();
  assert.deepEqual(embed.fields.map(field => field.name), ['Zmienione', 'Dodane', 'Usunięte']);
  assert.match(embed.description, /Data: /);
  const second = await publishGuildChangelog(guild, store, () => {});
  assert.deepEqual(second.posted, []);
  assert.equal(sent.length, loadReleases().length);
  assert.equal(changelogEmbed(loadReleases()[0]).toJSON().footer.text, 'informacja-bot');
});

test('główny serwer publikuje na CHANGELOG_CHANNEL_ID i pokazuje go tylko administracji', async () => {
  const logs = [];
  const edits = [];
  const sent = [];
  const admin = { id: 'admin-role', permissions: { has: flag => flag === PermissionFlagsBits.Administrator } };
  const staff = { id: 'staff-role', permissions: { has: () => false } };
  const channel = {
    id: '1570530877379977296', name: 'admin-info', type: ChannelType.GuildText, guildId: '123456789012345679',
    permissionsFor: () => ({ has: () => true }),
    permissionOverwrites: { set: async (overwrites) => { edits.push(overwrites); } },
    send: async payload => { sent.push(payload); return { id: 'm' }; },
  };
  const guild = {
    id: '123456789012345679', name: 'Strefa',
    roles: { everyone: { id: 'everyone' }, cache: new Map([[admin.id, admin], [staff.id, staff]]) },
    members: { me: { id: 'bot', permissions: { has: () => true } } },
    channels: { cache: new Map(), fetch: async id => id === channel.id ? channel : null, create: async () => { throw new Error('nie twórz'); } },
  };
  const found = await ensureChangelogChannel(guild, { log: message => logs.push(message), primaryGuildId: guild.id, staffRoleId: staff.id, channelId: undefined });
  assert.equal(found.id, channel.id);
  assert.equal(logs.length, 0);
  const ids = edits[0].map(item => item.id);
  assert.deepEqual(ids, ['everyone', admin.id, staff.id, 'bot']);
  assert.ok(edits[0][0].deny.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(edits[0][1].allow.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(edits[0][2].allow.includes(PermissionFlagsBits.ViewChannel));
  const store = memoryStore();
  store.snapshot().changelogPosts[guild.id] = ['2026.11.12-10'];
  const first = await publishGuildChangelog(guild, store, { log: () => {}, primaryGuildId: guild.id, channelId: channel.id });
  assert.ok(first.posted.includes('2026.11.12-10'));
  assert.equal(sent.length, loadReleases().length);
  const second = await publishGuildChangelog(guild, store, { log: () => {}, primaryGuildId: guild.id, channelId: channel.id });
  assert.deepEqual(second.posted, []);
  assert.equal(sent.length, loadReleases().length);
  assert.equal(store.snapshot().changelogPosts[guild.id].channelId, channel.id);
});

test('bez ID kanału na obcym serwerze nadal powstaje informacja-bot', async () => {
  const fresh = guildFixture();
  const channel = await ensureChangelogChannel(fresh.guild, { primaryGuildId: '999999999999999999', channelId: '1570530877379977296' });
  assert.equal(channel.name, CHANGELOG_CHANNEL_NAME);
  assert.equal(fresh.created.length, 1);
});

test('strona aktualizacji rozdziela Zmienione, Dodane i Usunięte', () => {
  const html = fs.readFileSync(new URL('../src/panel/aktualizacje.html', import.meta.url), 'utf8');
  assert.match(html, /id="releases"/);
  assert.match(html, /Zmienione/);
  assert.match(html, /Dodane/);
  assert.match(html, /Usunięte/);
  assert.match(html, /informacja-bot/);
  const script = html.split('<script>').at(-1).split('</script>')[0];
  const elements = new Map();
  const make = tag => ({
    tag, children: [], className: '', textContent: '', dateTime: '', value: '', dataset: {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener() {},
    setAttribute() {},
    classList: { toggle() {} },
  });
  for (const id of ['releases', 'entries', 'searchUpdates', 'resultCount', 'added', 'changed', 'removed']) elements.set(id, make(id));
  const buttons = [make('button')];
  buttons[0].dataset.filter = 'all';
  vm.runInNewContext(script, {
    window: { STREFA_RELEASES: loadReleases().slice(0, 1), STREFA_CHANGELOG: [{ type: 'dodano', area: 'bot', description: 'Test komendy', timestamp: '2026-11-01T10:00:00Z' }] },
    document: {
      getElementById: id => elements.get(id),
      createElement: make,
      querySelectorAll: () => buttons,
    },
  });
  const release = elements.get('releases').children[0];
  const headings = release.children[1].children.map(section => section.children[0].textContent);
  assert.deepEqual(headings, ['Zmienione', 'Dodane', 'Usunięte']);
  assert.equal(elements.get('entries').children.length, 1);
  assert.match(fs.readFileSync(new URL('../src/panel/index.html', import.meta.url), 'utf8'), /href="\/aktualizacje"/);
});
