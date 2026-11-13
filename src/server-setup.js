import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { serverStructure } from './server-structure.js';
import { guildStore } from './guild-store.js';
import { logEvents } from './log-settings.js';

export const SETUP_DELAY_MS = 500;
const STAFF_RANKS = new Set(['owner', 'admin', 'mod', 'helper', 'recruit']);
const MOD_RANKS = new Set(['owner', 'admin', 'mod']);
const DANGEROUS = new Set(['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks']);
const KINDS = new Set(['text', 'voice', 'stage', 'forum']);
const VISIBILITY = new Set(['start', 'members', 'vip', 'game', 'staff', 'mods', 'unverified']);
const TALK = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'AttachFiles', 'EmbedLinks', 'UseExternalEmojis'];
const VOICE = ['ViewChannel', 'Connect', 'Speak', 'Stream', 'UseVAD', 'ReadMessageHistory'];
const THREADS = ['CreatePublicThreads', 'SendMessagesInThreads'];
const READ_ONLY_DENY = ['SendMessages', 'AddReactions', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads'];
const BOT_ALLOW = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'AddReactions', 'ManageMessages', 'ManageChannels', 'Connect', 'Speak', 'MoveMembers', 'SendMessagesInThreads', 'CreatePublicThreads', 'ManageThreads'];
const IMAGE = ['AttachFiles', 'EmbedLinks'];

export const serverSetupCommands = [
  new SlashCommandBuilder()
    .setName('setup-serwera')
    .setDescription('Dodaje brakujące role, kategorie i kanały. Niczego nie usuwa.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => option
      .setName('tryb')
      .setDescription('Podgląd wypisuje plan i niczego nie tworzy.')
      .addChoices(
        { name: 'Podgląd (nic nie tworzy)', value: 'podglad' },
        { name: 'Wykonaj', value: 'wykonaj' },
      )),
];

const fold = (name, keepEmoji) => {
  const base = String(name ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pl');
  const source = keepEmoji ? base : base.replace(/\p{Extended_Pictographic}/gu, '');
  return source.replace(/[^\p{L}\p{N}]/gu, '');
};
export const sameName = (left, right) => {
  if (fold(left, true) === fold(right, true)) return true;
  const plainLeft = fold(left, false);
  const plainRight = fold(right, false);
  return plainLeft.length > 0 && plainLeft === plainRight;
};
const bits = names => names.reduce((set, name) => {
  const bit = PermissionFlagsBits[name];
  if (bit == null) throw new Error(`Nieznane uprawnienie ${name} w konfiguracji struktury serwera.`);
  return set | bit;
}, 0n);
const colorValue = color => {
  if (color == null || color === '') return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color));
  if (!match) throw new Error(`Nieprawidłowy kolor ${color}. Użyj HEX, np. #F1C40F.`);
  return Number.parseInt(match[1], 16);
};
const channelType = kind => ({ text: ChannelType.GuildText, voice: ChannelType.GuildVoice, stage: ChannelType.GuildStageVoice, forum: ChannelType.GuildForum })[kind];
const listOf = value => [...(value?.values?.() ?? value ?? [])];
const isRateLimit = error => error?.status === 429 || Number(error?.code) === 429 || error?.name === 'RateLimitError';
const retryDelay = error => {
  const raw = error?.rawError?.retry_after ?? error?.data?.retry_after ?? error?.retryAfter;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 1000;
  return Math.min(10_000, raw > 50 ? raw : raw * 1000);
};
const explain = (error, action) => {
  const code = Number(error?.code);
  if (code === 50013 || error?.status === 403) return `${action}: bot nie ma uprawnień. Nadaj roli bota Zarządzanie rolami i Zarządzanie kanałami oraz umieść ją powyżej tworzonych ról.`;
  if (code === 30005) return `${action}: osiągnięto limit 250 ról Discorda.`;
  if (code === 30013) return `${action}: osiągnięto limit kanałów Discorda.`;
  return `${action}: ${error?.message || 'nieznany błąd'}`;
};

export function validateStructure(structure = serverStructure) {
  const roles = structure?.roles ?? [];
  const categories = structure?.categories ?? [];
  const roleKeys = new Set();
  const roleNames = new Set();
  for (const role of roles) {
    if (!role?.key || !role?.name || role.name.length > 100) return `Rola ${role?.key || ''} ma pustą albo za długą nazwę.`;
    if (roleKeys.has(role.key)) return `Powtórzony klucz roli ${role.key}.`;
    roleKeys.add(role.key);
    const folded = fold(role.name, false);
    if (roleNames.has(folded)) return `Dwie role mają tę samą nazwę: ${role.name}.`;
    roleNames.add(folded);
    if (!Array.isArray(role.permissions)) return `Rola ${role.name} nie ma listy uprawnień.`;
    for (const name of role.permissions) {
      if (PermissionFlagsBits[name] == null) return `Rola ${role.name} ma nieznane uprawnienie ${name}.`;
      if (DANGEROUS.has(name) && !['owner', 'admin'].includes(role.rank)) return `Uprawnienie ${name} wolno nadać tylko rolom Właściciel i Admin (${role.name}).`;
    }
    if (role.color) { try { colorValue(role.color); } catch (error) { return error.message; } }
    if (role.level != null && (!Number.isInteger(role.level) || role.level < 1 || role.level > 1000)) return `Nieprawidłowy poziom roli ${role.name}.`;
  }
  const channelKeys = new Set();
  const categoryNames = new Set();
  for (const category of categories) {
    if (!category?.key || !category?.name || category.name.length > 100) return `Kategoria ${category?.key || ''} ma pustą albo za długą nazwę.`;
    if (!VISIBILITY.has(category.visibility)) return `Kategoria ${category.name} ma nieznaną widoczność.`;
    if (category.gameRole && !roleKeys.has(category.gameRole)) return `Kategoria ${category.name} wskazuje nieistniejącą rolę ${category.gameRole}.`;
    const folded = fold(category.name, true);
    if (categoryNames.has(folded)) return `Dwie kategorie mają tę samą nazwę: ${category.name}.`;
    categoryNames.add(folded);
    const names = new Set();
    for (const channel of category.channels ?? []) {
      if (!channel?.key || !channel?.name || channel.name.length > 100) return `Kanał ${channel?.key || ''} ma pustą albo za długą nazwę.`;
      if (channelKeys.has(channel.key)) return `Powtórzony klucz kanału ${channel.key}.`;
      channelKeys.add(channel.key);
      if (!KINDS.has(channel.kind)) return `Kanał ${channel.name} ma nieznany typ.`;
      if (channel.visibility && !VISIBILITY.has(channel.visibility)) return `Kanał ${channel.name} ma nieznaną widoczność.`;
      const channelName = fold(channel.name, true);
      if (names.has(channelName)) return `W kategorii ${category.name} powtarza się kanał ${channel.name}.`;
      names.add(channelName);
      if (channel.kind === 'forum') {
        if (!Array.isArray(channel.tags) || !channel.tags.length || channel.tags.length > 20) return `Forum ${channel.name} potrzebuje od 1 do 20 tagów.`;
        if (channel.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 20)) return `Tagi forum ${channel.name} mogą mieć do 20 znaków.`;
      }
    }
  }
  for (const key of ['member', 'unverified', 'vip', 'booster', 'logs', 'verification', 'ideas', 'welcome', 'levels', 'create-voice', 'tickets', 'recruit-inbox']) {
    const found = roleKeys.has(key) || channelKeys.has(key) || categories.some(category => category.key === key);
    if (!found) return `W strukturze brakuje klucza ${key}.`;
  }
  return null;
}

const findNamed = (items, name, extra = () => true) => listOf(items).find(item => item && extra(item) && sameName(item.name, name));

export function buildPlan({ guild, roles, channels, community, structure = serverStructure }) {
  const native = listOf(roles).find(role => role?.tags?.premiumSubscriberRole) ?? null;
  const plannedRoles = structure.roles.map(definition => {
    if (definition.nativeBooster && native) return { definition, action: 'reuse', existing: native, native: true };
    const existing = findNamed(roles, definition.name, role => role.id !== guild.id && !role.managed);
    return existing ? { definition, action: 'reuse', existing } : { definition, action: 'create' };
  });
  const blockedChannels = [];
  const categories = structure.categories.map(definition => {
    const existing = findNamed(channels, definition.name, channel => channel.type === ChannelType.GuildCategory);
    const children = [];
    for (const channel of definition.channels ?? []) {
      const type = channelType(channel.kind);
      const existingChannel = existing
        ? findNamed(channels, channel.name, item => item.type === type && (item.parentId ?? null) === existing.id)
        : null;
      if ((channel.kind === 'forum' || channel.kind === 'stage') && !community && !existingChannel) {
        blockedChannels.push({ definition: channel, reason: 'Serwer nie ma włączonej Społeczności, więc Discord nie pozwala utworzyć forum ani sceny.' });
        continue;
      }
      children.push(existingChannel ? { definition: channel, action: 'reuse', existing: existingChannel } : { definition: channel, action: 'create' });
    }
    return { definition, action: existing ? 'reuse' : 'create', existing, channels: children };
  });
  return { roles: plannedRoles, categories, blockedChannels };
}

const viewersFor = (visibility, gameRole, roles) => {
  const staff = roles.filter(role => STAFF_RANKS.has(role.rank)).map(role => role.key);
  const mods = roles.filter(role => MOD_RANKS.has(role.rank)).map(role => role.key);
  const images = roles.filter(role => role.images).map(role => role.key);
  if (visibility === 'start') return new Set(['unverified', 'member', ...images, ...staff]);
  if (visibility === 'members') return new Set(['member', ...staff]);
  if (visibility === 'vip') return new Set([...images, ...staff]);
  if (visibility === 'game') return new Set([gameRole, ...staff].filter(Boolean));
  if (visibility === 'staff') return new Set(staff);
  if (visibility === 'mods') return new Set(mods);
  if (visibility === 'unverified') return new Set(['unverified', ...staff]);
  return new Set(['member', ...staff]);
};

export function buildChannelOverwrites({ channel, category, roles, roleIds, everyoneId, botId }) {
  const visibility = channel.visibility ?? category.visibility;
  const gameRole = channel.gameRole ?? category.gameRole;
  const readOnly = Boolean(channel.readOnly);
  const kind = channel.kind ?? 'category';
  const text = kind === 'text' || kind === 'forum' || kind === 'category';
  const voice = kind === 'voice' || kind === 'stage' || kind === 'category';
  const viewers = viewersFor(visibility, gameRole, roles);
  const images = new Set(roles.filter(role => role.images).map(role => role.key));
  const allowImages = !readOnly && !['staff', 'mods', 'unverified'].includes(visibility);
  const byId = new Map();
  const add = (id, allow, deny) => {
    if (!id) return;
    const current = byId.get(id) ?? { allow: 0n, deny: 0n };
    current.allow |= allow;
    current.deny |= deny;
    current.deny &= ~current.allow;
    byId.set(id, current);
  };
  add(everyoneId, 0n, bits(['ViewChannel', ...(readOnly ? READ_ONLY_DENY : [])]));
  for (const role of roles) {
    const id = roleIds[role.key];
    if (!id) continue;
    if (viewers.has(role.key)) {
      const allow = ['ViewChannel', 'ReadMessageHistory'];
      const deny = [];
      const staff = STAFF_RANKS.has(role.rank);
      if (text && (!readOnly || staff)) allow.push(...TALK.filter(name => name !== 'ViewChannel' && name !== 'ReadMessageHistory'));
      if ((kind === 'forum' || kind === 'category') && (!readOnly || staff)) allow.push(...THREADS);
      if (text && readOnly && !staff) deny.push(...READ_ONLY_DENY);
      if (voice && !readOnly) allow.push(...VOICE.filter(name => name !== 'ViewChannel' && name !== 'ReadMessageHistory'));
      add(id, bits(allow), bits(deny));
    } else if (allowImages && images.has(role.key)) {
      add(id, bits(IMAGE), 0n);
    } else add(id, 0n, bits(['ViewChannel']));
  }
  add(botId, bits(BOT_ALLOW), 0n);
  return [...byId].map(([id, value]) => ({ id, allow: value.allow, deny: value.deny }));
}

const splitLines = (items, max = 1000) => {
  if (!items.length) return ['—'];
  const fields = [];
  let current = '';
  for (const line of items) {
    const row = `• ${line}`;
    const next = current ? `${current}\n${row}` : row;
    if (next.length > max) {
      if (current) fields.push(current);
      current = row.slice(0, max);
    } else current = next;
  }
  if (current) fields.push(current);
  return fields;
};

export function formatSetupReport(report) {
  const verb = report.dryRun ? 'Do utworzenia' : 'Utworzono';
  const lines = [
    report.dryRun
      ? '🔍 Podgląd — nic nie utworzono, nie przesunięto i nie zapisano.'
      : '✅ Konfiguracja zakończona. Niczego nie usunięto i nie zmieniono nazw.',
    `${verb}: ${report.createdRoles.length} ról, ${report.createdCategories.length} kategorii, ${report.createdChannels.length} kanałów.`,
    `Pominięto (już istnieją): ${report.skippedRoles.length} ról, ${report.skippedCategories.length} kategorii, ${report.skippedChannels.length} kanałów.`,
    report.boosterNote,
    report.permissionNote,
    report.positionNote,
    report.wired.length ? `${report.dryRun ? 'Zostałoby podłączone' : 'Podłączono'}: ${report.wired.join('; ')}.` : '',
    report.warnings.length ? `Ostrzeżenia: ${report.warnings.join(' ')}` : '',
  ].filter(Boolean);
  let content = lines.join('\n');
  const todos = report.todos.length ? `Do zrobienia:\n${report.todos.map(item => `• ${item}`).join('\n')}` : '';
  if (todos && `${content}\n${todos}`.length <= 1900) content = `${content}\n${todos}`;
  else if (todos) content = `${content}\nDo zrobienia: lista jest w podsumowaniu poniżej.`;
  const embed = new EmbedBuilder()
    .setColor(report.dryRun ? 0xF1C40F : 0x2ECC71)
    .setTitle(report.dryRun ? 'Plan /setup-serwera' : 'Wynik /setup-serwera')
    .setDescription([report.boosterNote, report.permissionNote, report.positionNote, ...report.warnings].filter(Boolean).join('\n').slice(0, 4000) || ' ');
  const fields = [];
  const addList = (name, items) => splitLines(items).forEach((value, index) => fields.push({ name: (index ? `${name} (${index + 1})` : name).slice(0, 256), value }));
  addList(`${verb}: role`, report.createdRoles);
  addList('Pominięte role', report.skippedRoles);
  addList(`${verb}: kategorie`, report.createdCategories);
  addList('Pominięte kategorie', report.skippedCategories);
  addList(`${verb}: kanały`, report.createdChannels);
  addList('Pominięte kanały', report.skippedChannels);
  if (report.blockedChannels.length) addList('Wymaga Społeczności', report.blockedChannels);
  if (report.todos.length) addList('Do zrobienia', report.todos);
  embed.addFields(fields.slice(0, 25));
  return { content: content.slice(0, 2000), embeds: [embed], allowedMentions: { parse: [] } };
}

const linkModules = (state, guildId, primaryGuildId, refs, notes) => {
  const channel = key => refs.channels[key];
  const role = key => refs.roles[key];
  const category = key => refs.categories[key];
  state.verification ??= {};
  if (!state.verification.roleId && role('member')) {
    state.verification.roleId = role('member').id;
    notes.wired.push(`weryfikacja → rola ${role('member').name}`);
  }
  if (!state.verification.unverifiedRoleId && role('unverified')) {
    state.verification.unverifiedRoleId = role('unverified').id;
    notes.wired.push(`weryfikacja zdejmie rolę ${role('unverified').name}`);
  }
  if (!state.verification.channelId && channel('verification')) {
    state.verification.channelId = channel('verification').id;
    notes.wired.push(`weryfikacja → ${channel('verification').name}`);
  }
  if (!state.verification.messageId) notes.todos.push('Opublikuj panel na kanale weryfikacji komendą /weryfikacja-panel i wskaż rolę ✅ Członek. Po kliknięciu bot zdejmie ❌ Niezweryfikowany.');

  if (channel('logs') && !state.logChannelId) {
    const events = Object.fromEntries(Object.keys(logEvents).map(key => [key, true]));
    const eventChannels = Object.fromEntries(Object.keys(logEvents).map(key => [key, channel('logs').id]));
    state.logChannelId = channel('logs').id;
    state.logging = { ...(state.logging ?? {}), enabled: true, categoryId: category('staff')?.id ?? channel('logs').parentId ?? null, events: { ...events, ...(state.logging?.events ?? {}) }, eventChannels };
    state.moderation ??= {};
    if (!state.moderation.logChannelId) state.moderation.logChannelId = channel('logs').id;
    notes.wired.push(`logi → ${channel('logs').name}`);
  }

  state.autoChannels ??= {};
  if (!state.autoChannels.joinChannelId && channel('create-voice')) {
    state.autoChannels.joinChannelId = channel('create-voice').id;
    state.autoChannels.categoryId = category('voice')?.id ?? null;
    state.autoChannels.template ||= 'Kanał {name}';
    state.autoChannels.createdIds ??= [];
    notes.wired.push(`auto-kanały → ${channel('create-voice').name}`);
  }

  state.levels ??= { guilds: {} };
  state.levels.guilds ??= {};
  const levels = state.levels.guilds[guildId] ??= { settings: {}, users: {} };
  levels.settings ??= {};
  levels.users ??= {};
  if (!levels.settings.announcementChannelId && channel('levels')) {
    levels.settings.announcementChannelId = channel('levels').id;
    notes.wired.push(`poziomy → ${channel('levels').name}`);
  }
  const rewards = Array.isArray(levels.settings.rewards) ? levels.settings.rewards : [];
  let addedRewards = 0;
  for (const definition of serverStructure.roles) {
    const rewardRole = role(definition.key);
    if (!definition.level || !rewardRole) continue;
    if (rewards.some(item => item.roleId === rewardRole.id)) continue;
    if (rewards.length >= 20) {
      notes.warnings.push('Lista nagród poziomów ma już 20 ról. Nie dodano kolejnych.');
      break;
    }
    rewards.push({ level: definition.level, roleId: rewardRole.id });
    addedRewards += 1;
  }
  levels.settings.rewards = rewards;
  if (addedRewards) notes.wired.push(`poziomy: ${addedRewards} ról za level`);

  state.tickets ??= {};
  state.tickets.guildSettings ??= {};
  const tickets = state.tickets.guildSettings[guildId] ??= {};
  if (!tickets.categoryId && category('help')) {
    tickets.categoryId = category('help').id;
    notes.wired.push(`tickety → kategoria ${category('help').name}`);
  }
  if (!tickets.supportRoleId && role('helper')) {
    tickets.supportRoleId = role('helper').id;
    notes.wired.push(`tickety → obsługa ${role('helper').name}`);
  }
  if (!tickets.logChannelId && channel('logs')) tickets.logChannelId = channel('logs').id;
  if (guildId === primaryGuildId) {
    if (!state.tickets.categoryId && category('help')) state.tickets.categoryId = category('help').id;
    if (!state.tickets.supportRoleId && role('helper')) state.tickets.supportRoleId = role('helper').id;
    if (!state.tickets.logChannelId && channel('logs')) state.tickets.logChannelId = channel('logs').id;
  }
  const hasPanel = (state.tickets.panels ?? []).some(panel => panel.guildId === guildId && panel.active !== false);
  if (!hasPanel) notes.todos.push('Opublikuj panel ticketów komendą /tickets-panel na kanale zgłoszeń.');

  state.community ??= { guilds: {} };
  state.community.guilds ??= {};
  const community = state.community.guilds[guildId] ??= {};
  community.settings ??= {};
  if (!community.settings.ideasChannelId && channel('ideas')) {
    community.settings.ideasChannelId = channel('ideas').id;
    community.settings.categoryId = category('social')?.id ?? null;
    notes.wired.push(`pomysły → ${channel('ideas').name} (reakcje ✅/❌)`);
  }

  state.welcome ??= { guilds: {} };
  state.welcome.guilds ??= {};
  const welcome = state.welcome.guilds[guildId] ??= {};
  if (!welcome.channelId && channel('welcome')) {
    welcome.enabled = true;
    welcome.channelId = channel('welcome').id;
    welcome.categoryId = category('start')?.id ?? null;
    notes.wired.push(`powitania → ${channel('welcome').name}`);
  }

  state.recruitment ??= {};
  if (!state.recruitment.applicationChannelId && channel('recruit-inbox')) {
    state.recruitment.applicationChannelId = channel('recruit-inbox').id;
    notes.wired.push(`rekrutacja → ${channel('recruit-inbox').name}`);
  }
  if (!state.recruitment.logChannelId && channel('recruit-decisions')) state.recruitment.logChannelId = channel('recruit-decisions').id;
  if (!state.recruitment.staffRoleId && role('moderator')) state.recruitment.staffRoleId = role('moderator').id;
  if (!state.recruitment.acceptedRoleId) notes.todos.push('Ustaw rolę po akceptacji podania komendą /rekrutacja-ustaw. Ta komenda jej nie nadaje. Panel opublikujesz przez /rekrutacja-panel na kanale rekrutacji.');

  notes.todos.push('Rola ❌ Niezweryfikowany nie jest nadawana przy wejściu. Ustaw autorole (np. Onboarding Discorda), inaczej nowi nie zobaczą kategorii START ani kanału weryfikacji.');
  notes.todos.push('Kanał wybierz-role nie dostaje menu automatycznie. Wstaw panel ról (gry, powiadomienia, kolory), np. przez /embed.');
  notes.todos.push('Role kolorów nie mają uprawnień. Bot nie ma sklepu ekonomii — podepnij je ręcznie, gdy sklep powstanie.');
};

export function createServerSetupSystem({ client, featureStore, primaryGuildId, structure = serverStructure, delayMs = SETUP_DELAY_MS, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const busy = new Set();
  async function command(interaction) {
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    if (!interaction.guild) return reply('Użyj tej komendy na serwerze Discord.');
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return reply('Tę komendę może uruchomić tylko osoba z uprawnieniem Administrator.');
    const problem = validateStructure(structure);
    if (problem) return reply(`Konfiguracja struktury serwera jest niepoprawna: ${problem}`);
    if (busy.has(interaction.guildId)) return reply('Na tym serwerze trwa już konfiguracja. Poczekaj na zakończenie.');
    busy.add(interaction.guildId);
    const dryRun = interaction.options.getString('tryb') === 'podglad';
    const created = { roles: [], categories: [], channels: [] };
    const skipped = { roles: [], categories: [], channels: [] };
    const warnings = [];
    let deferred = false;
    try {
      const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      const required = [['Zarządzanie rolami (Manage Roles)', PermissionFlagsBits.ManageRoles], ['Zarządzanie kanałami (Manage Channels)', PermissionFlagsBits.ManageChannels]];
      const missing = required.filter(([, bit]) => !bot.permissions.has(bit)).map(([label]) => label);
      if (missing.length) return reply(`Bot nie ma wymaganych uprawnień: ${missing.join(' i ')}. Nadaj je roli bota i umieść tę rolę powyżej ról, które mają powstać. Niczego nie utworzono.`);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;
      const [sourceRoles, sourceChannels] = await Promise.all([interaction.guild.roles.fetch(), interaction.guild.channels.fetch()]);
      const community = [...(interaction.guild.features ?? [])].includes('COMMUNITY');
      const plan = buildPlan({ guild: interaction.guild, roles: sourceRoles, channels: sourceChannels, community, structure });
      const newRoles = plan.roles.filter(item => item.action === 'create').length;
      const newCategories = plan.categories.filter(item => item.action === 'create').length;
      const newChannels = plan.categories.reduce((sum, category) => sum + category.channels.filter(item => item.action === 'create').length, 0);
      const categoryCount = listOf(sourceChannels).filter(channel => channel?.type === ChannelType.GuildCategory).length;
      if (sourceRoles.size + newRoles > 250) throw new Error(`Brakuje miejsca na ${newRoles} ról (limit 250, zajęte ${sourceRoles.size}). Niczego nie utworzono.`);
      if (categoryCount + newCategories > 50) throw new Error(`Brakuje miejsca na ${newCategories} kategorii (limit 50, zajęte ${categoryCount}). Niczego nie utworzono.`);
      if (sourceChannels.size + newCategories + newChannels > 500) throw new Error(`Brakuje miejsca na ${newCategories + newChannels} kanałów (limit 500, zajęte ${sourceChannels.size}). Niczego nie utworzono.`);
      const reason = `Konfiguracja /setup-serwera (${interaction.user.id})`;
      const attempt = async (action, label) => {
        try {
          try {
            return await action();
          } catch (error) {
            if (!isRateLimit(error)) throw error;
            await sleep(retryDelay(error));
            return await action();
          }
        } catch (error) {
          throw new Error(explain(error, label));
        }
      };
      const grant = definition => {
        const hasAll = bot.permissions.has(PermissionFlagsBits.Administrator);
        const kept = [];
        const omitted = [];
        for (const name of definition.permissions ?? []) {
          if (hasAll || bot.permissions.has(PermissionFlagsBits[name])) kept.push(name);
          else omitted.push(name);
        }
        if (omitted.length) warnings.push(`Rola ${definition.name} nie dostanie uprawnień: ${omitted.join(', ')}, bo bot ich nie posiada. Uzupełnij je ręcznie — kolejne uruchomienie nie zmienia istniejących ról.`);
        return kept;
      };
      const roleIds = {};
      const resolvedRoles = [];
      for (const item of plan.roles) {
        if (item.action === 'reuse') {
          roleIds[item.definition.key] = item.existing.id;
          resolvedRoles.push(item.existing);
          skipped.roles.push(item.native ? `${item.existing.name} (natywna rola boostów)` : item.existing.name);
          if (item.native) {
            const duplicate = findNamed(sourceRoles, item.definition.name, role => role.id !== item.existing.id && role.id !== interaction.guild.id);
            if (duplicate) warnings.push(`Zostawiono dodatkową rolę „${duplicate.name}”. Do uprawnień użyto natywnej roli boostów „${item.existing.name}”.`);
          }
          continue;
        }
        const kept = grant(item.definition);
        if (dryRun) {
          const fake = { id: `dry-role-${item.definition.key}`, name: item.definition.name, managed: false, position: 1 };
          roleIds[item.definition.key] = fake.id;
          resolvedRoles.push(fake);
          created.roles.push(item.definition.name);
          continue;
        }
        const payload = { name: item.definition.name, permissions: kept.map(name => PermissionFlagsBits[name]), hoist: Boolean(item.definition.hoist), mentionable: Boolean(item.definition.mentionable), reason };
        const color = colorValue(item.definition.color);
        if (color != null) payload.color = color;
        const role = await attempt(() => interaction.guild.roles.create(payload), `Nie udało się utworzyć roli ${item.definition.name}`);
        sourceRoles.set?.(role.id, role);
        roleIds[item.definition.key] = role.id;
        resolvedRoles.push(role);
        created.roles.push(role.name ?? item.definition.name);
        await sleep(delayMs);
      }
      const booster = plan.roles.find(item => item.definition.nativeBooster);
      const boosterNote = booster?.native
        ? `💜 Booster: użyto istniejącej roli boostów „${booster.existing.name}”. Nowej roli nie utworzono.`
        : booster?.action === 'reuse'
          ? `💜 Booster: użyto istniejącej roli „${booster.existing.name}”.`
          : `💜 Booster: serwer nie ma natywnej roli boostów, więc ${dryRun ? 'zostałaby utworzona' : 'utworzono'} rolę ${booster?.definition.name}.`;
      const ceiling = bot.roles?.highest?.position ?? 0;
      const movable = [];
      const stuck = [];
      for (const role of resolvedRoles) {
        if (!role || role.managed || String(role.id).startsWith('dry-role-')) {
          if (role?.managed) stuck.push(role.name);
          continue;
        }
        if ((role.position ?? 0) >= ceiling) stuck.push(role.name);
        else movable.push(role);
      }
      let ordered = dryRun;
      if (!dryRun && movable.length && interaction.guild.roles.setPositions) {
        const positions = [];
        let position = ceiling - 1;
        for (const role of movable) {
          if (position < 1) break;
          positions.push({ role: role.id, position });
          position -= 1;
        }
        if (positions.length) {
          try {
            await interaction.guild.roles.setPositions(positions);
            ordered = true;
            await sleep(delayMs);
          } catch (error) {
            warnings.push(explain(error, 'Nie udało się ułożyć kolejności ról'));
          }
        }
        if (positions.length < movable.length) warnings.push('Rola bota jest za nisko, żeby ułożyć wszystkie role. Przesuń ją wyżej i uruchom komendę ponownie.');
      } else if (!dryRun && movable.length) warnings.push('Nie udało się ułożyć ról, bo biblioteka nie udostępniła zmiany pozycji.');
      let positionNote = ordered
        ? `${dryRun ? 'Kolejność ról zostałaby ustawiona' : 'Ustawiono kolejność ról'} od 👑 Właściciel na górze do ❌ Niezweryfikowany na dole, pod rolą bota.`
        : 'Nie ustawiono kolejności ról. Przesuń rolę bota wyżej i uruchom komendę ponownie.';
      if (stuck.length) positionNote += ` Bez zmian zostają role, których bot nie może przesunąć: ${stuck.join(', ')}.`;
      const everyoneId = interaction.guild.roles.everyone?.id ?? interaction.guild.id;
      const categoryIds = {};
      const channelIds = {};
      const channelParents = {};
      for (const item of plan.categories) {
        let category = item.existing ?? null;
        if (item.action === 'reuse') {
          skipped.categories.push(item.existing.name);
          categoryIds[item.definition.key] = item.existing.id;
        } else if (dryRun) {
          category = { id: `dry-category-${item.definition.key}`, name: item.definition.name };
          created.categories.push(item.definition.name);
          categoryIds[item.definition.key] = category.id;
        } else {
          const permissionOverwrites = buildChannelOverwrites({ channel: { kind: 'category', visibility: item.definition.visibility, gameRole: item.definition.gameRole }, category: item.definition, roles: structure.roles, roleIds, everyoneId, botId: client.user.id });
          category = await attempt(() => interaction.guild.channels.create({ name: item.definition.name, type: ChannelType.GuildCategory, permissionOverwrites, reason }), `Nie udało się utworzyć kategorii ${item.definition.name}`);
          sourceChannels.set?.(category.id, category);
          created.categories.push(category.name ?? item.definition.name);
          categoryIds[item.definition.key] = category.id;
          await sleep(delayMs);
        }
        for (const child of item.channels) {
          if (child.action === 'reuse') {
            skipped.channels.push(child.existing.name);
            channelIds[child.definition.key] = child.existing.id;
            channelParents[child.definition.key] = child.existing.parentId ?? category?.id ?? null;
            continue;
          }
          if (dryRun) {
            created.channels.push(child.definition.name);
            channelIds[child.definition.key] = `dry-channel-${child.definition.key}`;
            channelParents[child.definition.key] = category?.id ?? null;
            continue;
          }
          const permissionOverwrites = buildChannelOverwrites({ channel: child.definition, category: item.definition, roles: structure.roles, roleIds, everyoneId, botId: client.user.id });
          const payload = { name: child.definition.name, type: channelType(child.definition.kind), parent: category?.id, permissionOverwrites, reason };
          if (child.definition.kind === 'forum') payload.availableTags = child.definition.tags.map(name => ({ name, moderated: false }));
          const createdChannel = await attempt(() => interaction.guild.channels.create(payload), `Nie udało się utworzyć kanału ${child.definition.name}`);
          sourceChannels.set?.(createdChannel.id, createdChannel);
          created.channels.push(createdChannel.name ?? child.definition.name);
          channelIds[child.definition.key] = createdChannel.id;
          channelParents[child.definition.key] = createdChannel.parentId ?? category?.id ?? null;
          await sleep(delayMs);
        }
      }
      const ref = (ids, names) => Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, { id, name: names[key] ?? key, parentId: channelParents[key] ?? null }]));
      const roleNames = Object.fromEntries(structure.roles.map(role => [role.key, roleIds[role.key] ? (resolvedRoles.find(item => item?.id === roleIds[role.key])?.name ?? role.name) : role.name]));
      const channelNames = Object.fromEntries(structure.categories.flatMap(category => category.channels.map(channel => [channel.key, channel.name])));
      const categoryNames = Object.fromEntries(structure.categories.map(category => [category.key, category.name]));
      const refs = { roles: ref(roleIds, roleNames), channels: ref(channelIds, channelNames), categories: ref(categoryIds, categoryNames) };
      const notes = { wired: [], todos: [], warnings };
      const store = featureStore ? guildStore(featureStore, interaction.guildId, primaryGuildId) : null;
      if (store) {
        if (dryRun) linkModules(store.snapshot(), interaction.guildId, primaryGuildId, refs, notes);
        else await store.update(state => linkModules(state, interaction.guildId, primaryGuildId, refs, notes));
      } else notes.todos.push('Nie podłączono magazynu konfiguracji, więc kanały nie zostały wpisane do modułów.');
      if (!bot.permissions.has(PermissionFlagsBits.AddReactions) && !bot.permissions.has(PermissionFlagsBits.Administrator)) notes.todos.push('Reakcje ✅/❌ na kanale pomysły wymagają uprawnienia Dodawanie reakcji.');
      for (const item of plan.blockedChannels) warnings.push(`Nie utworzono ${item.definition.name}: ${item.reason}`);
      const permissionNote = 'Administrator jest tylko na rolach Właściciel i Admin. Moderator, Pomocnik i Rekrutant mają wyłącznie uprawnienia moderacji. VIP i Booster mogą załączać pliki i osadzać linki. Role kolorów nie mają uprawnień. Istniejące elementy zachowały nazwy i uprawnienia.';
      const payload = formatSetupReport({
        dryRun, boosterNote, permissionNote, positionNote, warnings: notes.warnings, wired: notes.wired, todos: notes.todos,
        createdRoles: created.roles, skippedRoles: skipped.roles, createdCategories: created.categories, skippedCategories: skipped.categories,
        createdChannels: created.channels, skippedChannels: skipped.channels, blockedChannels: plan.blockedChannels.map(item => item.definition.name),
      });
      return interaction.editReply(payload);
    } catch (error) {
      const text = `${dryRun ? 'Podgląd przerwany' : 'Konfiguracja zatrzymana'}. ${error.message}\n${dryRun ? 'Niczego nie utworzono.' : `Utworzono dotąd: ${created.roles.length} ról, ${created.categories.length} kategorii, ${created.channels.length} kanałów. Niczego nie usunięto ani nie zmieniono nazw.`}`;
      const payload = { content: text.slice(0, 2000), allowedMentions: { parse: [] } };
      if (deferred) return interaction.editReply(payload);
      return reply(text.slice(0, 2000));
    } finally {
      busy.delete(interaction.guildId);
    }
  }
  return { command };
}
