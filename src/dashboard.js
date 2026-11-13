import { welcomeSettings, farewellSettings } from './welcome.js';
import { levelSettings } from './levels.js';
import { communitySettings } from './community.js';
import { logSettings } from './log-settings.js';
import { loadReleases } from './changelog-releases.js';
import { commandCatalog } from './command-catalog.js';

const ALWAYS = 'always';

function flag(enabled, mode) {
  if (mode === ALWAYS) return { enabled: true, label: 'Aktywny' };
  return { enabled: Boolean(enabled), label: enabled ? 'Włączony' : 'Wyłączony' };
}

function ticketsEnabled(state, guildId, primaryGuildId) {
  const tickets = state.tickets ?? {};
  const settings = tickets.guildSettings?.[guildId] ?? {};
  const categoryId = guildId === primaryGuildId ? (settings.categoryId ?? tickets.categoryId) : (settings.categoryId || null);
  const panels = (tickets.panels ?? []).filter(panel => (panel.guildId || primaryGuildId) === guildId);
  return Boolean(categoryId || panels.length);
}

export function moduleOverview(state = {}, guildId = '', primaryGuildId = guildId) {
  const welcomeOn = welcomeSettings(state, guildId).enabled === true || farewellSettings(state, guildId).enabled === true;
  const levelsOn = levelSettings(state, guildId).enabled !== false;
  const community = communitySettings(state, guildId);
  const automod = state.automod ?? {};
  const automodOn = Boolean(automod.ruleId || automod.keywords?.length) && automod.enabled !== false;
  const logsOn = Boolean(state.logChannelId) && logSettings(state).enabled !== false;
  const autoChannelsOn = Boolean(state.autoChannels?.joinChannelId);
  const verificationOn = Boolean(state.verification?.roleId);
  const ticketsOn = ticketsEnabled(state, guildId, primaryGuildId);
  const definitions = [
    ['statystyki', 'Statystyki', '#module-statystyki', true, ALWAYS],
    ['aktywnosc', 'Aktywność', '#module-aktywnosc', true, ALWAYS],
    ['powitania', 'Powitania', '#module-powitania-pozegnania', welcomeOn],
    ['ekonomia', 'Ekonomia', '#module-ekonomia', true, ALWAYS],
    ['poziomy', 'Poziomy', '#module-poziomy', levelsOn],
    ['auto-kanaly', 'Auto kanały', '#module-auto-kanaly', autoChannelsOn],
    ['zabawy', 'Zabawy', '#module-zabawy', community.gamesEnabled !== false],
    ['pomysly', 'Pomysły', '#module-pomysly', community.ideasEnabled !== false],
    ['moderacja', 'Moderacja', '#module-moderacja', true, ALWAYS],
    ['auto-mod', 'Auto Mod', '#module-auto-mod', automodOn],
    ['moderowane-kanaly', 'Moderowane kanały', '#module-moderowane-kanaly', true, ALWAYS],
    ['tickets', 'Tickets', '#module-tickets', ticketsOn],
    ['weryfikacja', 'Weryfikacja', '#module-weryfikacja', verificationOn],
    ['logi', 'Logi', '#module-logi', logsOn],
    ['automatyzacje', 'Automatyzacje', '#module-automatyzacje', autoChannelsOn || automodOn || logsOn || ticketsOn || verificationOn],
  ];
  return definitions.map(([id, name, href, enabled, mode]) => ({ id, name, href, ...flag(enabled, mode) }));
}

export function releaseHighlights(limit = 4) {
  return loadReleases().slice(0, limit).map(release => ({
    version: release.version,
    date: release.date,
    summary: [...(release.dodane ?? []), ...(release.zmienione ?? []), ...(release.usuniete ?? [])].find(point => point && point !== '—') || 'Aktualizacja panelu i bota.',
  }));
}

export function changelogFeed(releases = [], entries = []) {
  const fromReleases = [];
  for (const release of releases) {
    const stamp = release?.date ? `${release.date}T12:00:00.000Z` : '';
    for (const [key, type] of [['zmienione', 'zmieniono'], ['dodane', 'dodano'], ['usuniete', 'usunieto']]) {
      for (const point of release?.[key] ?? []) {
        if (!point || point === '—') continue;
        const text = String(point);
        const lower = text.toLocaleLowerCase('pl-PL');
        fromReleases.push({
          type,
          area: /stron|panel|favicon|menu/.test(lower) ? 'strona' : 'bot',
          description: text,
          timestamp: stamp,
          version: release.version || '',
        });
      }
    }
  }
  const manual = (Array.isArray(entries) ? entries : []).filter(entry => entry && typeof entry === 'object');
  return [...fromReleases, ...manual];
}

export function publicDashboard(state, guildId, primaryGuildId = guildId) {
  return {
    modules: moduleOverview(state, guildId, primaryGuildId),
    commands: commandCatalog(),
    releases: releaseHighlights(),
  };
}
