import {
  ActionRowBuilder,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

const command = name => new SlashCommandBuilder().setName(name);
const adminCommand = name => command(name);

export const featureCommands = [
  command('statystyki').setDescription('Pokazuje statystyki serwera, rekrutacji i ekonomii.'),
  adminCommand('statystyki-kanaly').setDescription('Tworzy lub odświeża kanały ze statystykami serwera.'),
  adminCommand('statystyki-panel').setDescription('Publikuje albo przenosi automatycznie odświeżany panel statystyk.')
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał tekstowy na panel (domyślnie bieżący)').addChannelTypes(ChannelType.GuildText)),
  command('ekonomia-portfel').setDescription('Sprawdza saldo StrefaCoins.'),
  command('ekonomia-daily').setDescription('Odbiera dzienną nagrodę StrefaCoins.'),
  command('ekonomia-praca').setDescription('Wykonuje krótką pracę za StrefaCoins (cooldown 1 godz.).'),
  command('ekonomia-przelej').setDescription('Przelewa StrefaCoins innemu użytkownikowi.')
    .addUserOption(o => o.setName('odbiorca').setDescription('Osoba, której wysyłasz monety').setRequired(true))
    .addIntegerOption(o => o.setName('kwota').setDescription('Kwota przelewu').setMinValue(1).setMaxValue(1000000).setRequired(true)),
  command('ekonomia-ranking').setDescription('Pokazuje ranking sald StrefaCoins.'),
  command('ekonomia-bank').setDescription('Wpłaca albo wypłaca środki z banku serwerowego.')
    .addStringOption(o => o.setName('operacja').setDescription('Rodzaj operacji').setRequired(true).addChoices(
      { name: 'Wpłać', value: 'deposit' }, { name: 'Wypłać', value: 'withdraw' },
    ))
    .addIntegerOption(o => o.setName('kwota').setDescription('Kwota operacji').setMinValue(1).setMaxValue(1000000).setRequired(true)),
  adminCommand('auto-kanaly-ustaw').setDescription('Ustawia kanał do tworzenia prywatnych kanałów głosowych.')
    .addChannelOption(o => o.setName('lobby').setDescription('Kanał głosowy „dołącz, aby utworzyć pokój”').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addChannelOption(o => o.setName('kategoria').setDescription('Kategoria dla tworzonych pokojów').addChannelTypes(ChannelType.GuildCategory))
    .addStringOption(o => o.setName('szablon').setDescription('Nazwa pokoju; użyj {name} dla nazwy użytkownika').setMaxLength(80)),
  adminCommand('kanal-wsparcia-ustaw').setDescription('Ustawia kanał oczekiwania na pomoc głosową.')
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał głosowy, w którym użytkownicy mogą czekać').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addRoleOption(o => o.setName('obsluga').setDescription('Rola powiadamiana o osobie czekającej na pomoc')),
  adminCommand('moderacja-timeout').setDescription('Wycisza użytkownika na określony czas.')
    .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true))
    .addIntegerOption(o => o.setName('minuty').setDescription('Czas od 1 do 40320 minut').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setMaxLength(400)),
  adminCommand('moderacja-kick').setDescription('Wyrzuca użytkownika z serwera.')
    .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setMaxLength(400)),
  adminCommand('moderacja-ban').setDescription('Banuje użytkownika na serwerze.')
    .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setMaxLength(400)),
  adminCommand('moderacja-ostrzegaj').setDescription('Zapisuje ostrzeżenie użytkownika.')
    .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód ostrzeżenia').setRequired(true).setMaxLength(400)),
  adminCommand('moderacja-ostrzezenia').setDescription('Pokazuje zapisane ostrzeżenia użytkownika.')
    .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true)),
  adminCommand('moderacja-slowmode').setDescription('Ustawia slowmode na bieżącym kanale tekstowym.')
    .addIntegerOption(o => o.setName('sekundy').setDescription('0 wyłącza slowmode; zakres 0–21600').setMinValue(0).setMaxValue(21600).setRequired(true)),
  adminCommand('auto-mod-fraza').setDescription('Dodaje albo usuwa frazę blokowaną przez Auto Mod Discorda.')
    .addStringOption(o => o.setName('operacja').setDescription('Co zrobić z frazą').setRequired(true).addChoices(
      { name: 'Dodaj', value: 'add' }, { name: 'Usuń', value: 'remove' },
    ))
    .addStringOption(o => o.setName('fraza').setDescription('Słowo lub fraza (maks. 60 znaków)').setMinLength(1).setMaxLength(60).setRequired(true)),
  adminCommand('auto-mod-lista').setDescription('Pokazuje frazy i reguły Auto Mod.'),
  adminCommand('logi-ustaw').setDescription('Wybiera kanał na logi administracyjne.')
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał tekstowy na logi').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  adminCommand('moderowane-kanaly').setDescription('Pokazuje kanały z slowmode lub blokadą pisania.'),
  adminCommand('tickets-panel').setDescription('Publikuje panel otwierania ticketów.')
    .addChannelOption(o => o.setName('kategoria').setDescription('Kategoria na kanały ticketów').addChannelTypes(ChannelType.GuildCategory))
    .addRoleOption(o => o.setName('obsluga').setDescription('Rola obsługi ticketów')),
  adminCommand('weryfikacja-panel').setDescription('Publikuje przycisk nadania roli po weryfikacji.')
    .addRoleOption(o => o.setName('rola').setDescription('Rola przyznawana po kliknięciu').setRequired(true)),
];

const featureNames = new Set(featureCommands.map(item => item.name));
const TICKET_OWNER = 'strefa-ticket-owner:';
const AUTOMOD_RULE_NAME = 'Strefa Auto Mod — blokowane frazy';

export function isFeatureCommand(name) { return featureNames.has(name); }

export function createFeatureHandlers({ client, cfg, applicationStore, featureStore }) {
  const ephemeral = { flags: MessageFlags.Ephemeral };
  const automaticChannelIds = new Set(featureStore.snapshot().autoChannels.createdIds);
  const pendingVoiceLogs = new Map();

  async function statisticsEmbed(guild) {
    await guild.members.fetch();
    const humans = guild.members.cache.filter(member => !member.user.bot).size;
    const bots = guild.members.cache.filter(member => member.user.bot).size;
    const channels = guild.channels.cache;
    const textChannels = channels.filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)).size;
    const voiceChannels = channels.filter(channel => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)).size;
    const categories = channels.filter(channel => channel.type === ChannelType.GuildCategory).size;
    const apps = applicationStore.list();
    const counts = Object.fromEntries(['pending', 'accepted', 'rejected', 'closed'].map(status => [status, apps.filter(app => app.status === status).length]));
    const state = featureStore.snapshot();
    const totalCoins = Object.values(state.economy).reduce((sum, account) => sum + (Number(account.balance) || 0) + (Number(account.bank) || 0), 0);
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`📊 Statystyki — ${guild.name}`)
      .addFields(
        { name: '👥 Członkowie', value: String(guild.memberCount ?? humans + bots), inline: true },
        { name: '🧑 Użytkownicy', value: String(humans), inline: true },
        { name: '🤖 Boty', value: String(bots), inline: true },
        { name: '💬 Kanały tekstowe', value: String(textChannels), inline: true },
        { name: '🔊 Kanały głosowe', value: String(voiceChannels), inline: true },
        { name: '🗂️ Kategorie', value: String(categories), inline: true },
        { name: '📨 Podania', value: `${apps.length} razem\nOczekujące: ${counts.pending} · Zaakceptowane: ${counts.accepted} · Odrzucone: ${counts.rejected}`, inline: false },
        { name: '🪙 Ekonomia', value: `${totalCoins.toLocaleString('pl-PL')} ${state.economyConfig.currencySymbol} w ${Object.keys(state.economy).length} portfelach`, inline: false },
        { name: '📅 Utworzono', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
      )
      .setFooter({ text: 'Strefa Gry i Rozrywki • Panel odświeża się co 5 minut' })
      .setTimestamp();
    const icon = guild.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);
    return embed;
  }

  async function refreshStatisticsChannels(guild) {
    const config = featureStore.snapshot().statisticsChannels;
    if (config?.onlineChannelId || config?.membersChannelId || config?.botsChannelId) {
      const members = await guild.members.fetch({ withPresences: true });
      const bots = members.filter(member => member.user.bot).size;
      const online = members.filter(member => member.presence && member.presence.status !== 'offline').size;
      const names = [
        [config.onlineChannelId, `🟢・online ${online}`],
        [config.membersChannelId, `👥・wszyscy ${guild.memberCount}`],
        [config.botsChannelId, `🤖・boty ${bots}`],
      ];
      for (const [id, name] of names) {
        if (!id) continue;
        const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
        if (channel?.type === ChannelType.GuildVoice && channel.name !== name) await channel.setName(name, 'Odświeżenie liczników serwera');
      }
    }
    if (config?.panelChannelId && config?.panelMessageId) {
      const channel = await guild.channels.fetch(config.panelChannelId).catch(() => null);
      if (channel?.isTextBased() && channel.messages?.fetch) {
        const message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
        if (message) await message.edit({ embeds: [await statisticsEmbed(guild)] });
      }
    }
  }

  function manager(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      (cfg.staffRoleId && interaction.member?.roles?.cache?.has?.(cfg.staffRoleId)));
  }

  async function reply(interaction, content, options = {}) {
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content, ...options });
    return interaction.reply({ content, ...ephemeral, ...options });
  }

  async function defer(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply(ephemeral);
  }

  async function log(guild, title, description, color = 0x5865f2) {
    const id = featureStore.snapshot().logChannelId || cfg.logChannelId;
    if (!id || !guild) return;
    const channel = await guild.channels.fetch(id).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') return;
    await channel.send({
      embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description.slice(0, 3900)).setTimestamp()],
      allowedMentions: { parse: [] },
    }).catch(error => console.warn('Nie udało się zapisać logu modułu:', error.message));
  }

  function queueVoiceLog(guild, userId, event, flush = false) {
    const entry = pendingVoiceLogs.get(userId) ?? { guild, events: [], timer: null };
    entry.guild = guild;
    entry.events.push(event);
    if (entry.timer) clearTimeout(entry.timer);
    const send = () => {
      pendingVoiceLogs.delete(userId);
      void log(entry.guild, '🎙️ Aktywność głosowa', `Użytkownik: <@${userId}>\n${entry.events.join('\n')}`);
    };
    if (flush) return send();
    entry.timer = setTimeout(send, 900);
    entry.timer.unref?.();
    pendingVoiceLogs.set(userId, entry);
  }

  async function ensureManager(interaction) {
    if (manager(interaction)) return true;
    await reply(interaction, '⛔ Ta funkcja wymaga uprawnienia Zarządzanie serwerem lub Administrator.');
    return false;
  }

  async function ensureModerationPermission(interaction, key) {
    if (manager(interaction)) return true;
    const allowedRoles = featureStore.snapshot().moderation?.permissions?.[key] ?? [];
    if (allowedRoles.some(roleId => interaction.member?.roles?.cache?.has?.(roleId))) return true;
    await reply(interaction, '⛔ Nie masz uprawnień do tej komendy moderacyjnej.');
    return false;
  }

  async function ensureModerationTarget(interaction, target) {
    const settings = featureStore.snapshot().moderation ?? {};
    if ((settings.protectedRoleIds ?? []).some(roleId => target.roles.cache.has(roleId))) {
      await reply(interaction, '⛔ Nie można moderować członka z chronioną rangą.');
      return false;
    }
    const actor = interaction.member;
    if (settings.hierarchyEnabled && interaction.user.id !== interaction.guild.ownerId && actor?.roles?.highest && actor.roles.highest.position <= target.roles.highest.position) {
      await reply(interaction, '⛔ Hierarchia ról blokuje tę akcję wobec tego członka.');
      return false;
    }
    return true;
  }

  async function economyCommand(interaction, name) {
    const userId = interaction.user.id;
    const snapshot = featureStore.snapshot();
    const settings = snapshot.economyConfig;
    const currency = settings.currencySymbol || 'StrefaCoins';
    const formatMoney = amount => {
      const separators = { space: ' ', comma: ',', period: '.' };
      const number = Math.trunc(Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, separators[settings.thousandsSeparator] || ' ');
      return settings.currencyPosition === 'left' ? `${currency} ${number}` : `${number} ${currency}`;
    };
    const newAccount = () => ({ balance: settings.initialWallet, bank: settings.initialBank, lastDaily: 0, lastWork: 0 });
    const account = snapshot.economy[userId] ?? newAccount();
    account.bank ??= 0;
    if (name === 'ekonomia-portfel') return reply(interaction, `👛 Portfel: **${formatMoney(account.balance)}** · 🏦 Bank: **${formatMoney(account.bank)}**.`);
    if (name === 'ekonomia-bank') {
      const operation = interaction.options.getString('operacja', true);
      const amount = interaction.options.getInteger('kwota', true);
      const result = await featureStore.update(state => {
        const current = state.economy[userId] ?? newAccount();
        current.bank ??= 0;
        if (operation === 'deposit' && current.balance < amount) return { insufficient: true };
        if (operation === 'withdraw' && current.bank < amount) return { insufficient: true };
        current.balance += operation === 'withdraw' ? amount : -amount;
        current.bank += operation === 'deposit' ? amount : -amount;
        state.economy[userId] = current;
        return { balance: current.balance, bank: current.bank };
      });
      if (result.insufficient) return reply(interaction, `❌ Za mało środków w ${operation === 'deposit' ? 'portfelu' : 'banku'}.`);
      return reply(interaction, `✅ ${operation === 'deposit' ? 'Wpłacono' : 'Wypłacono'} **${formatMoney(amount)}**. Portfel: **${formatMoney(result.balance)}**, bank: **${formatMoney(result.bank)}**.`);
    }
    if (name === 'ekonomia-daily') {
      const now = Date.now();
      const result = await featureStore.update(state => {
        const current = state.economy[userId] ?? newAccount();
        current.bank ??= 0;
        if (now - current.lastDaily < 24 * 60 * 60 * 1000) return { wait: 24 * 60 * 60 * 1000 - (now - current.lastDaily), balance: current.balance };
        current.balance += settings.dailyReward;
        current.lastDaily = now;
        state.economy[userId] = current;
        return { reward: settings.dailyReward, balance: current.balance };
      });
      if (result.wait) return reply(interaction, `⏳ Dzienna nagroda będzie dostępna za **${Math.ceil(result.wait / 3600000)} godz.**`);
      return reply(interaction, `🎁 Otrzymujesz **${formatMoney(result.reward)}**. Saldo: **${formatMoney(result.balance)}**.`);
    }
    if (name === 'ekonomia-praca') {
      const now = Date.now();
      const reward = settings.workMin + cryptoRandomInt(settings.workMax - settings.workMin + 1);
      const result = await featureStore.update(state => {
        const current = state.economy[userId] ?? newAccount();
        current.bank ??= 0;
        if (now - current.lastWork < 60 * 60 * 1000) return { wait: 60 * 60 * 1000 - (now - current.lastWork), balance: current.balance };
        current.balance += reward;
        current.lastWork = now;
        state.economy[userId] = current;
        return { reward, balance: current.balance };
      });
      if (result.wait) return reply(interaction, `⏳ Następna praca za **${Math.ceil(result.wait / 60000)} min.**`);
      return reply(interaction, `🛠️ Zarabiasz **${formatMoney(result.reward)}**. Saldo: **${formatMoney(result.balance)}**.`);
    }
    if (name === 'ekonomia-przelej') {
      const receiver = interaction.options.getUser('odbiorca', true);
      const amount = interaction.options.getInteger('kwota', true);
      if (receiver.bot || receiver.id === userId) return reply(interaction, 'Wybierz innego użytkownika, który nie jest botem.');
      const result = await featureStore.update(state => {
        const senderAccount = state.economy[userId] ?? newAccount();
        const receiverAccount = state.economy[receiver.id] ?? newAccount();
        senderAccount.bank ??= 0;
        receiverAccount.bank ??= 0;
        if (senderAccount.balance < amount) return { insufficient: true, balance: senderAccount.balance };
        senderAccount.balance -= amount;
        receiverAccount.balance += amount;
        state.economy[userId] = senderAccount;
        state.economy[receiver.id] = receiverAccount;
        return { balance: senderAccount.balance };
      });
      if (result.insufficient) return reply(interaction, `Masz tylko **${formatMoney(result.balance)}**.`);
      return reply(interaction, `✅ Przelano **${formatMoney(amount)}** użytkownikowi <@${receiver.id}>. Saldo: **${formatMoney(result.balance)}**.`, { allowedMentions: { users: [] } });
    }
    if (name === 'ekonomia-ranking') {
      const top = Object.entries(snapshot.economy).sort((a, b) => (b[1].balance + (b[1].bank || 0)) - (a[1].balance + (a[1].bank || 0))).slice(0, 10);
      return reply(interaction, top.length
        ? `🏆 **Ranking ${currency}:**\n${top.map(([id, data], i) => `${i + 1}. <@${id}> — **${formatMoney(data.balance + (data.bank || 0))}**`).join('\n')}`
        : 'Ranking jest jeszcze pusty.', { allowedMentions: { parse: [] } });
    }
    return false;
  }

  function cryptoRandomInt(max) { return Math.floor(Math.random() * max); }

  async function moderate(interaction, name) {
    const user = interaction.options.getUser('uzytkownik', true);
    const reason = interaction.options.getString('powod') || `Akcja moderatora ${interaction.user.tag}`;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (name !== 'moderacja-ban' && !member) return reply(interaction, 'Tego użytkownika nie ma na serwerze.');
    if (member && (member.id === interaction.guild.ownerId || member.id === client.user.id)) return reply(interaction, 'Nie można zastosować tej akcji wobec właściciela serwera ani bota.');
    if (member && !await ensureModerationTarget(interaction, member)) return;
    if (name === 'moderacja-timeout') {
      const minutes = interaction.options.getInteger('minuty', true);
      await member.timeout(minutes * 60 * 1000, reason);
      await log(interaction.guild, '⏱️ Timeout', `Użytkownik: <@${user.id}>\nCzas: ${minutes} min\nModerator: <@${interaction.user.id}>\nPowód: ${reason}`, 0xedaa33);
      return reply(interaction, `✅ Wyciszono <@${user.id}> na ${minutes} min.`);
    }
    if (name === 'moderacja-kick') {
      await member.kick(reason);
      await log(interaction.guild, '👢 Kick', `Użytkownik: <@${user.id}>\nModerator: <@${interaction.user.id}>\nPowód: ${reason}`, 0xedaa33);
      return reply(interaction, `✅ Wyrzucono <@${user.id}> z serwera.`);
    }
    if (name === 'moderacja-ban') {
      await interaction.guild.members.ban(user.id, { reason });
      await log(interaction.guild, '🔨 Ban', `Użytkownik: <@${user.id}>\nModerator: <@${interaction.user.id}>\nPowód: ${reason}`, 0xed4245);
      return reply(interaction, `✅ Zbanowano <@${user.id}>.`);
    }
  }

  async function automodPhrase(interaction) {
    const operation = interaction.options.getString('operacja', true);
    const phrase = interaction.options.getString('fraza', true).trim();
    const state = featureStore.snapshot().automod;
    const existing = await interaction.guild.autoModerationRules.fetch().catch(() => null);
    let rule = state.ruleId ? existing?.get(state.ruleId) : null;
    rule ??= existing?.find(candidate => candidate.name === AUTOMOD_RULE_NAME);
    const phrases = [...new Set((state.keywords ?? []).map(value => value.toLowerCase()))];
    const key = phrase.toLowerCase();
    if (operation === 'add' && !phrases.includes(key)) phrases.push(key);
    if (operation === 'remove') {
      const index = phrases.indexOf(key);
      if (index < 0) return reply(interaction, 'Tej frazy nie ma na liście Auto Mod.');
      phrases.splice(index, 1);
    }
    if (operation === 'add' && phrases.length === (state.keywords ?? []).length) return reply(interaction, 'Ta fraza jest już na liście.');
    if (phrases.length > 1000) return reply(interaction, 'Discord pozwala na maksymalnie 1000 fraz w jednej regule.');
    const reason = `${operation === 'add' ? 'Dodano' : 'Usunięto'} frazę Auto Mod przez ${interaction.user.tag}`;
    if (!phrases.length) {
      if (rule) await rule.delete(reason);
      await featureStore.update(data => { data.automod.keywords = []; data.automod.ruleId = null; });
    } else if (rule) {
      await rule.edit({ triggerMetadata: { keywordFilter: phrases }, enabled: state.enabled !== false }, reason);
      await featureStore.update(data => { data.automod.keywords = phrases; data.automod.ruleId = rule.id; data.automod.enabled = state.enabled !== false; });
    } else {
      rule = await interaction.guild.autoModerationRules.create({
        name: AUTOMOD_RULE_NAME,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: phrases },
        actions: [{ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: 'Ta fraza jest zablokowana przez Auto Mod.' } }],
        enabled: state.enabled !== false,
        reason,
      });
      await featureStore.update(data => { data.automod.keywords = phrases; data.automod.ruleId = rule.id; data.automod.enabled = state.enabled !== false; });
    }
    await log(interaction.guild, '🛡️ Zmiana Auto Mod', `${operation === 'add' ? 'Dodano' : 'Usunięto'} frazę przez <@${interaction.user.id}>. Liczba fraz: ${phrases.length}.`);
    return reply(interaction, `✅ Lista Auto Mod zawiera teraz **${phrases.length}** fraz.`);
  }

  async function command(interaction) {
    const name = interaction.commandName;
    if (name.startsWith('ekonomia-')) return economyCommand(interaction, name);
    if (name === 'statystyki-kanaly') {
      if (!interaction.guild) return reply(interaction, 'Ta komenda działa tylko na serwerze Discord.');
      if (!manager(interaction) || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        return reply(interaction, '⛔ Potrzebujesz uprawnienia Zarządzanie kanałami oraz Zarządzanie serwerem.');
      }
      await defer(interaction);
      const guild = interaction.guild;
      let settings = featureStore.snapshot().statisticsChannels;
      let category = settings.categoryId ? await guild.channels.fetch(settings.categoryId).catch(() => null) : null;
      if (category?.type !== ChannelType.GuildCategory) category = null;
      if (!category) category = await guild.channels.create({ name: '📊 STATYSTYKI', type: ChannelType.GuildCategory });
      const ensureVoice = async (id, name) => {
        let channel = id ? await guild.channels.fetch(id).catch(() => null) : null;
        if (channel?.type !== ChannelType.GuildVoice) channel = null;
        if (!channel) channel = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: category.id });
        else if (channel.parentId !== category.id) await channel.setParent(category.id);
        return channel;
      };
      const online = await ensureVoice(settings.onlineChannelId, '🟢・online 0');
      const members = await ensureVoice(settings.membersChannelId, '👥・wszyscy 0');
      const bots = await ensureVoice(settings.botsChannelId, '🤖・boty 0');
      settings = { categoryId: category.id, onlineChannelId: online.id, membersChannelId: members.id, botsChannelId: bots.id };
      await featureStore.update(state => { state.statisticsChannels = settings; });
      await refreshStatisticsChannels(guild);
      return interaction.editReply(`✅ Liczniki zostały utworzone w kategorii **${category.name}** i będą odświeżane co 5 minut.`);
    }
    if (name === 'statystyki-panel') {
      if (!interaction.guild) return reply(interaction, 'Ta komenda działa tylko na serwerze Discord.');
      if (!manager(interaction)) return reply(interaction, '⛔ Ta komenda wymaga uprawnienia Zarządzanie serwerem lub Administrator.');
      await defer(interaction);
      const channel = interaction.options.getChannel('kanal') ?? interaction.channel;
      if (!channel?.isTextBased() || typeof channel.send !== 'function') return interaction.editReply('Wybierz dostępny kanał tekstowy.');
      const config = featureStore.snapshot().statisticsChannels;
      let message = config.panelChannelId && config.panelMessageId && config.panelChannelId === channel.id
        ? await channel.messages.fetch(config.panelMessageId).catch(() => null)
        : null;
      if (message) await message.edit({ embeds: [await statisticsEmbed(interaction.guild)] });
      else message = await channel.send({ embeds: [await statisticsEmbed(interaction.guild)] });
      await featureStore.update(state => {
        state.statisticsChannels.panelChannelId = channel.id;
        state.statisticsChannels.panelMessageId = message.id;
      });
      return interaction.editReply(`✅ Panel statystyk opublikowany na ${channel} i będzie odświeżany co 5 minut.`);
    }
    if (name === 'statystyki') {
      const guild = interaction.guild;
      if (!guild) return reply(interaction, 'Ta komenda działa tylko na serwerze Discord.');
      return reply(interaction, '', { embeds: [await statisticsEmbed(guild)] });
    }
    if (name === 'auto-kanaly-ustaw') {
      if (!await ensureManager(interaction)) return true;
      const lobby = interaction.options.getChannel('lobby', true);
      const category = interaction.options.getChannel('kategoria');
      const template = interaction.options.getString('szablon') || 'Kanał {name}';
      await featureStore.update(state => {
        state.autoChannels.joinChannelId = lobby.id;
        state.autoChannels.categoryId = category?.id ?? null;
        state.autoChannels.template = template;
      });
      await log(interaction.guild, '🔊 Ustawienia auto kanałów', `Kanał dołączania: <#${lobby.id}>\nKategoria: ${category ? `<#${category.id}>` : 'brak'}\nUstawił: <@${interaction.user.id}>`);
      return reply(interaction, `✅ Auto kanały ustawione. Dołącz do <#${lobby.id}>, aby utworzyć własny kanał głosowy.`);
    }
    if (name === 'kanal-wsparcia-ustaw') {
      if (!await ensureManager(interaction)) return true;
      const channel = interaction.options.getChannel('kanal', true);
      const supportRole = interaction.options.getRole('obsluga');
      await featureStore.update(state => {
        state.voiceSupport.channelId = channel.id;
        state.voiceSupport.supportRoleId = supportRole?.id ?? null;
      });
      await log(interaction.guild, '📞 Kanał wsparcia głosowego', `Kanał oczekiwania: <#${channel.id}>\nRola obsługi: ${supportRole ? `<@&${supportRole.id}>` : 'nieustawiona'}\nUstawił: <@${interaction.user.id}>`);
      return reply(interaction, `✅ Ustawiono kanał wsparcia głosowego: <#${channel.id}>.`);
    }
    if (name.startsWith('moderacja-')) {
      const permissionKey = ({ 'moderacja-ostrzezenia': 'viewWarnings', 'moderacja-kick': 'kick', 'moderacja-ostrzegaj': 'warn', 'moderacja-timeout': 'timeout', 'moderacja-ban': 'ban', 'moderacja-slowmode': 'slowmode' })[name];
      if (permissionKey ? !await ensureModerationPermission(interaction, permissionKey) : !await ensureManager(interaction)) return true;
      if (name === 'moderacja-ostrzegaj') {
        const user = interaction.options.getUser('uzytkownik', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return reply(interaction, 'Tego użytkownika nie ma na serwerze.');
        if (!await ensureModerationTarget(interaction, member)) return true;
        const reason = interaction.options.getString('powod', true).trim();
        const count = await featureStore.update(state => {
          const list = state.warnings[user.id] ?? [];
          list.push({ reason, moderatorId: interaction.user.id, at: new Date().toISOString() });
          state.warnings[user.id] = list.slice(-50);
          return state.warnings[user.id].length;
        });
        await log(interaction.guild, '⚠️ Ostrzeżenie', `Użytkownik: <@${user.id}>\nModerator: <@${interaction.user.id}>\nPowód: ${reason}\nLiczba ostrzeżeń: ${count}`, 0xedaa33);
        return reply(interaction, `⚠️ Zapisano ostrzeżenie dla <@${user.id}>. Łącznie: ${count}.`);
      }
      if (name === 'moderacja-ostrzezenia') {
        const user = interaction.options.getUser('uzytkownik', true);
        const warnings = featureStore.snapshot().warnings[user.id] ?? [];
        return reply(interaction, warnings.length
          ? `⚠️ **Ostrzeżenia <@${user.id}> (${warnings.length}):**\n${warnings.slice(-10).map((w, i) => `${i + 1}. ${w.reason} — <@${w.moderatorId}> (${new Date(w.at).toLocaleDateString('pl-PL')})`).join('\n')}`
          : `Użytkownik <@${user.id}> nie ma zapisanych ostrzeżeń.`, { allowedMentions: { parse: [] } });
      }
      if (name === 'moderacja-slowmode') {
        const channel = interaction.channel;
        if (!channel?.isTextBased() || typeof channel.setRateLimitPerUser !== 'function') return reply(interaction, 'Ta komenda działa na kanale tekstowym.');
        const seconds = interaction.options.getInteger('sekundy', true);
        await channel.setRateLimitPerUser(seconds, `Slowmode ustawił ${interaction.user.tag}`);
        await log(interaction.guild, '🐢 Zmiana slowmode', `Kanał: <#${channel.id}>\nCzas: ${seconds} sek.\nUstawił: <@${interaction.user.id}>`);
        return reply(interaction, `✅ Slowmode na <#${channel.id}> ustawiony na ${seconds} sek.`);
      }
      await moderate(interaction, name);
      return true;
    }
    if (name === 'auto-mod-fraza') {
      if (!await ensureManager(interaction)) return true;
      await automodPhrase(interaction);
      return true;
    }
    if (name === 'auto-mod-lista') {
      if (!await ensureManager(interaction)) return true;
      const state = featureStore.snapshot().automod;
      const rules = await interaction.guild.autoModerationRules.fetch().catch(() => null);
      const ours = state.ruleId ? rules?.get(state.ruleId) : rules?.find(rule => rule.name === AUTOMOD_RULE_NAME);
      return reply(interaction, `🛡️ **Auto Mod**\nNasza reguła: ${ours?.enabled ? 'włączona' : 'wyłączona'}\nLiczba fraz: **${state.keywords?.length ?? 0}**\n${state.keywords?.length ? state.keywords.slice(0, 30).map(value => `• ${value}`).join('\n') : 'Lista jest pusta.'}`);
    }
    if (name === 'logi-ustaw') {
      if (!await ensureManager(interaction)) return true;
      const channel = interaction.options.getChannel('kanal', true);
      const permissions = channel.permissionsFor(interaction.guild.members.me ?? await interaction.guild.members.fetchMe());
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return reply(interaction, 'Bot potrzebuje na tym kanale: Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków.');
      await featureStore.update(state => { state.logChannelId = channel.id; });
      await log(interaction.guild, '📜 Logi skonfigurowane', `Kanał logów ustawił <@${interaction.user.id}>.`);
      return reply(interaction, `✅ Logi będą wysyłane na <#${channel.id}>.`);
    }
    if (name === 'moderowane-kanaly') {
      if (!await ensureManager(interaction)) return true;
      const channels = await interaction.guild.channels.fetch();
      const restricted = channels.filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) && (
        channel.rateLimitPerUser > 0 || channel.permissionOverwrites.resolve(interaction.guild.roles.everyone.id)?.deny.has(PermissionFlagsBits.SendMessages)
      ));
      return reply(interaction, restricted.size
        ? `🔒 **Moderowane kanały (${restricted.size}):**\n${restricted.map(channel => `• <#${channel.id}> — ${channel.rateLimitPerUser ? `slowmode ${channel.rateLimitPerUser}s` : 'zablokowane pisanie'}`).slice(0, 30).join('\n')}`
        : 'Brak kanałów z aktywnym slowmode lub blokadą pisania.');
    }
    if (name === 'tickets-panel') {
      if (!await ensureManager(interaction)) return true;
      const category = interaction.options.getChannel('kategoria');
      const supportRole = interaction.options.getRole('obsluga');
      await featureStore.update(state => {
        if (category) state.tickets.categoryId = category.id;
        if (supportRole) state.tickets.supportRoleId = supportRole.id;
      });
      const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('strefa:ticket-pro:open').setLabel('Utwórz ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary));
      const message = await interaction.channel.send({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('🎫 Centrum ticketów').setDescription('Kliknij przycisk, aby utworzyć prywatny kanał i skontaktować się z obsługą.')],
        components: [button], allowedMentions: { parse: [] },
      });
      await featureStore.update(state => {
        state.tickets.panels ??= [];
        state.tickets.panels.push({ messageId: message.id, channelId: interaction.channelId, channelName: interaction.channel.name || 'kanał', categoryId: category?.id ?? state.tickets.categoryId, supportRoleId: supportRole?.id ?? state.tickets.supportRoleId, title: '🎫 Centrum ticketów', description: 'Kliknij przycisk, aby utworzyć prywatny kanał i skontaktować się z obsługą.', buttonLabel: 'Utwórz ticket', createdAt: new Date().toISOString() });
      });
      await log(interaction.guild, '🎫 Panel ticketów', `Opublikował: <@${interaction.user.id}>\nWiadomość: ${message.url}`);
      return reply(interaction, `✅ Panel ticketów opublikowano: ${message.url}`);
    }
    if (name === 'weryfikacja-panel') {
      if (!await ensureManager(interaction)) return true;
      const role = interaction.options.getRole('rola', true);
      const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      if (role.managed || !bot.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= bot.roles.highest.position) {
        return reply(interaction, 'Bot musi mieć Zarządzanie rolami, a rola weryfikacji musi być niżej niż rola bota.');
      }
      const verifySettings = featureStore.snapshot().verification;
      const buttonLabel = verifySettings.buttonLabel || 'Zweryfikuj się';
      const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('strefa:verify:confirm').setLabel(buttonLabel).setEmoji('✅').setStyle(ButtonStyle.Success));
      const message = await interaction.channel.send({
        embeds: [new EmbedBuilder().setColor(0x43b581).setTitle(verifySettings.title || '✅ Weryfikacja').setDescription(verifySettings.description || `Kliknij przycisk, aby otrzymać rolę <@&${role.id}>.`)],
        components: [button], allowedMentions: { roles: [] },
      });
      await featureStore.update(state => { state.verification = { ...state.verification, roleId: role.id, channelId: interaction.channelId, messageId: message.id, title: verifySettings.title || '✅ Weryfikacja', description: verifySettings.description || `Kliknij przycisk, aby otrzymać rolę <@&${role.id}>.`, buttonLabel }; });
      await log(interaction.guild, '✅ Panel weryfikacji', `Rola: <@&${role.id}>\nUstawił: <@${interaction.user.id}>`);
      return reply(interaction, `✅ Panel weryfikacji opublikowano: ${message.url}`);
    }
    return false;
  }

  async function button(interaction) {
    if (interaction.customId === 'strefa:verify:confirm') {
      const roleId = featureStore.snapshot().verification.roleId;
      if (!roleId) return reply(interaction, 'Weryfikacja nie jest jeszcze skonfigurowana.');
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
      if (!role || role.managed || !bot.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= bot.roles.highest.position) {
        return reply(interaction, 'Nie można nadać skonfigurowanej roli. Administracja musi sprawdzić rolę i hierarchię.');
      }
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member.roles.cache.has(roleId)) return reply(interaction, `Masz już rolę <@&${roleId}>.`);
      await member.roles.add(role, 'Weryfikacja przez panel StrefaBot');
      await log(interaction.guild, '✅ Użytkownik zweryfikowany', `Użytkownik: <@${interaction.user.id}>\nRola: <@&${roleId}>`);
      return reply(interaction, `✅ Weryfikacja zakończona. Otrzymujesz rolę <@&${roleId}>.`);
    }
    if (interaction.customId === 'strefa:ticket:open') {
      const settings = featureStore.snapshot().tickets;
      const panelSettings = settings.panels?.find(panel => panel.messageId === interaction.message.id) ?? settings;
      const channels = await interaction.guild.channels.fetch();
      const existing = channels.find(channel => channel?.topic === `${TICKET_OWNER}${interaction.user.id}` && !channel.name.startsWith('zamkniety-'));
      if (existing) return reply(interaction, `Masz już otwarty ticket: <#${existing.id}>.`);
      const supportRole = panelSettings.supportRoleId ? await interaction.guild.roles.fetch(panelSettings.supportRoleId).catch(() => null) : null;
      const botId = client.user.id;
      const overwrites = [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      ];
      if (supportRole) overwrites.push({ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 18) || 'user'}-${interaction.user.id.slice(-4)}`,
        type: ChannelType.GuildText,
        topic: `${TICKET_OWNER}${interaction.user.id}`,
        parent: panelSettings.categoryId || undefined,
        permissionOverwrites: overwrites,
        reason: `Ticket utworzony przez ${interaction.user.tag}`,
      });
      const closeButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('strefa:ticket:close').setLabel('Zamknij ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
      await channel.send({ content: `Witaj <@${interaction.user.id}>! Opisz tutaj sprawę. ${supportRole ? `<@&${supportRole.id}>` : ''}`, components: [closeButton], allowedMentions: { users: [interaction.user.id], roles: supportRole ? [supportRole.id] : [] } });
      await log(interaction.guild, '🎫 Otwarty ticket', `Kanał: <#${channel.id}>\nUżytkownik: <@${interaction.user.id}>`);
      return reply(interaction, `✅ Ticket utworzony: <#${channel.id}>.`);
    }
    if (interaction.customId === 'strefa:ticket:close') {
      const channel = interaction.channel;
      const ownerId = channel?.topic?.startsWith(TICKET_OWNER) ? channel.topic.slice(TICKET_OWNER.length) : null;
      if (!ownerId) return reply(interaction, 'Nie rozpoznaję kanału jako ticketu.');
      if (interaction.user.id !== ownerId && !manager(interaction)) return reply(interaction, 'Tylko autor ticketu lub administracja może go zamknąć.');
      await channel.permissionOverwrites.edit(ownerId, { SendMessages: false }, { reason: `Ticket zamknął ${interaction.user.tag}` });
      if (!channel.name.startsWith('zamkniety-')) await channel.setName(`zamkniety-${channel.name}`.slice(0, 100));
      await log(interaction.guild, '🔒 Zamknięty ticket', `Kanał: <#${channel.id}>\nAutor: <@${ownerId}>\nZamknął: <@${interaction.user.id}>`);
      return reply(interaction, '🔒 Ticket zamknięty. Historia kanału została zachowana.');
    }
    return false;
  }

  async function voiceState(oldState, newState) {
    if (!newState.guild) return;
    const settings = featureStore.snapshot().autoChannels;
    const supportSettings = featureStore.snapshot().voiceSupport;
    const member = newState.member ?? oldState.member;
    if (member && !member.user.bot && newState.channelId === supportSettings.channelId && oldState.channelId !== supportSettings.channelId) {
      const logId = featureStore.snapshot().logChannelId || cfg.logChannelId;
      const logChannel = logId ? await newState.guild.channels.fetch(logId).catch(() => null) : null;
      if (logChannel?.isTextBased() && typeof logChannel.send === 'function') {
        const roleText = supportSettings.supportRoleId ? `<@&${supportSettings.supportRoleId}> ` : '';
        await logChannel.send({
          content: `📞 ${roleText}<@${member.id}> czeka na pomoc głosową w <#${newState.channelId}>.`,
          allowedMentions: { users: [member.id], roles: supportSettings.supportRoleId ? [supportSettings.supportRoleId] : [] },
        }).catch(error => console.warn('Nie udało się powiadomić obsługi głosowej:', error.message));
      }
    }
    if (member && !member.user.bot) {
      const from = oldState.channel;
      const to = newState.channel;
      if (!from && to) {
        queueVoiceLog(newState.guild, member.id, `🔊 Dołączył do kanału głosowego: <#${to.id}>`);
      } else if (from && !to) {
        queueVoiceLog(newState.guild, member.id, `🔇 Opuścił kanał głosowy: <#${from.id}>`, true);
      } else if (from && to && from.id !== to.id) {
        queueVoiceLog(newState.guild, member.id, `🔀 Przeniósł się z <#${from.id}> do <#${to.id}>`);
      } else if (from && to && from.id === to.id) {
        const fields = [
          ['selfMute', 'Mikrofon użytkownika', value => value ? 'wyciszony' : 'aktywny'],
          ['serverMute', 'Wyciszenie przez serwer', value => value ? 'włączone' : 'wyłączone'],
          ['selfDeaf', 'Słuchawki użytkownika', value => value ? 'wyciszone' : 'aktywne'],
          ['serverDeaf', 'Ogłuszenie przez serwer', value => value ? 'włączone' : 'wyłączone'],
          ['selfVideo', 'Kamera', value => value ? 'włączona' : 'wyłączona'],
          ['streaming', 'Transmisja ekranu', value => value ? 'włączona' : 'wyłączona'],
          ['suppress', 'Głos na scenie', value => value ? 'wyciszony przez scenę' : 'można mówić'],
        ];
        const changes = fields.filter(([key]) => oldState[key] !== newState[key])
          .map(([key, label, describe]) => `• ${label}: ${describe(oldState[key])} → ${describe(newState[key])}`);
        if (changes.length) {
          queueVoiceLog(newState.guild, member.id, `🎚️ Zmienił status na <#${to.id}>:\n${changes.join('\n')}`);
        }
      }
    }
    if (newState.channelId === settings.joinChannelId && oldState.channelId !== settings.joinChannelId) {
      try {
        const channel = await newState.guild.channels.create({
          name: settings.template.replaceAll('{name}', newState.member.displayName).slice(0, 100),
          type: ChannelType.GuildVoice,
          parent: settings.categoryId || undefined,
          reason: `Automatyczny kanał dla ${newState.member.user.tag}`,
        });
        automaticChannelIds.add(channel.id);
        await featureStore.update(state => { state.autoChannels.createdIds = [...new Set([...state.autoChannels.createdIds, channel.id])]; });
        try {
          await newState.member.voice.setChannel(channel);
        } catch (error) {
          await channel.delete('Usunięto pusty auto kanał po nieudanym przeniesieniu').catch(() => {});
          automaticChannelIds.delete(channel.id);
          await featureStore.update(state => { state.autoChannels.createdIds = state.autoChannels.createdIds.filter(id => id !== channel.id); }).catch(() => {});
          throw error;
        }
        await log(newState.guild, '🔊 Utworzono kanał głosowy', `Kanał: <#${channel.id}>\nUżytkownik: <@${newState.member.id}>`);
      } catch (error) { console.warn('Nie udało się utworzyć auto kanału:', error.message); }
    }
    if (oldState.channelId && oldState.channelId !== newState.channelId && settings.createdIds.includes(oldState.channelId)) {
      const channel = oldState.channel;
      if (channel && channel.members.size === 0) {
        await channel.delete('Automatyczny kanał jest pusty').catch(() => {});
        await featureStore.update(state => { state.autoChannels.createdIds = state.autoChannels.createdIds.filter(id => id !== oldState.channelId); });
      }
    }
  }

  async function messageDeleted(message) {
    if (!message.guild || message.author?.bot) return;
    await log(message.guild, '🗑️ Usunięto wiadomość', `Kanał: <#${message.channelId}>\nAutor: ${message.author ? `<@${message.author.id}>` : 'nieznany'}\nTreść pominięto.`);
  }

  async function channelChanged(channel, created) {
    if (!channel.guild) return;
    if (!created && automaticChannelIds.delete(channel.id)) return;
    await log(channel.guild, created ? '➕ Utworzono kanał' : '➖ Usunięto kanał', `Kanał: **${channel.name}** (${channel.id})`);
  }

  async function autoModerationAction(action) {
    await log(action.guild, '🛡️ Auto Mod zablokował wiadomość', `Użytkownik: <@${action.userId}>\nKanał: <#${action.channelId}>\nReguła: ${action.ruleName}` , 0xedaa33);
  }

  return { command, button, voiceState, messageDeleted, channelChanged, autoModerationAction, refreshStatisticsChannels };
}
