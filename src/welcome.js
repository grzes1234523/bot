import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const welcomeDefaults = { enabled: false, categoryId: null, channelId: null, message: 'Witaj {user} na serwerze **{server}**! 🎉 Jest nas już **{count}**. Miłej zabawy!' };
export const welcomeCommands = [
  new SlashCommandBuilder().setName('powitanie-ustaw').setDescription('Ustawia kanał powitań nowych użytkowników.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał powitań').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addChannelOption(o => o.setName('kategoria').setDescription('Kategoria zawierająca wybrany kanał').addChannelTypes(ChannelType.GuildCategory))
    .addStringOption(o => o.setName('wiadomosc').setDescription('Treść: {user}, {username}, {server}, {count}').setMaxLength(2000)),
  new SlashCommandBuilder().setName('powitanie-wylacz').setDescription('Wyłącza automatyczne powitania.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];
export const welcomeSettings = (state, guildId) => ({ ...welcomeDefaults, ...(state.welcome?.guilds?.[guildId] ?? {}) });

export async function configureWelcome({ guild, featureStore, body }) {
  if (!body || typeof body.enabled !== 'boolean') throw new Error('Sprawdź ustawienia powitań.');
  const message = String(body.message ?? '').trim();
  if (!message || message.length > 2000) throw new Error('Treść powitania musi mieć od 1 do 2000 znaków.');
  const categoryId = body.categoryId || null;
  const channelId = body.channelId || null;
  if (body.enabled && !channelId) throw new Error('Wybierz kanał powitań.');
  if (categoryId) {
    const category = await guild.channels.fetch(categoryId).catch(() => null);
    if (category?.type !== ChannelType.GuildCategory) throw new Error('Wybierz dostępną kategorię Discord.');
  }
  if (channelId) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Wybierz dostępny kanał tekstowy.');
    if (categoryId && channel.parentId !== categoryId) throw new Error('Wybrany kanał musi należeć do wybranej kategorii.');
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (body.enabled && !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('Bot potrzebuje uprawnień Wyświetlanie kanału, Wysyłanie wiadomości i Osadzanie linków.');
  }
  const config = { enabled: body.enabled, categoryId, channelId, message };
  await featureStore.update(state => { state.welcome ??= { guilds: {} }; state.welcome.guilds ??= {}; state.welcome.guilds[guild.id] = config; });
  return config;
}
export function welcomeText(template, member) {
  const vars = { user: `<@${member.id}>`, username: member.user.username, server: member.guild.name, count: String(member.guild.memberCount ?? 0) };
  return template.replace(/\{(user|username|server|count)\}/g, (_, name) => vars[name]).slice(0, 4000);
}
export function createWelcomeSystem({ featureStore, guildId }) {
  async function memberJoined(member) {
    if (member.guild.id !== guildId || member.user.bot) return;
    const settings = welcomeSettings(featureStore.snapshot(), guildId);
    if (!settings.enabled || !settings.channelId) return;
    const channel = await member.guild.channels.fetch(settings.channelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return;
    const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle('👋 Witaj na serwerze!').setDescription(welcomeText(settings.message, member)).setTimestamp();
    const avatar = member.user.displayAvatarURL?.({ size: 128 });
    if (avatar) embed.setThumbnail(avatar);
    await channel.send({ content: `<@${member.id}>`, embeds: [embed], allowedMentions: { parse: [], users: [member.id] } });
  }
  async function command(interaction) {
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (interaction.guildId !== guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply('Wymagane uprawnienie Zarządzanie serwerem na skonfigurowanym serwerze.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const old = welcomeSettings(featureStore.snapshot(), guildId);
    try {
      if (interaction.commandName === 'powitanie-wylacz') {
        await featureStore.update(state => { state.welcome ??= { guilds: {} }; state.welcome.guilds ??= {}; state.welcome.guilds[guildId] = { ...old, enabled: false }; });
        return interaction.editReply('Powitania wyłączone.');
      }
      const channel = interaction.options.getChannel('kanal', true);
      const category = interaction.options.getChannel('kategoria');
      await configureWelcome({ guild: interaction.guild, featureStore, body: { enabled: true, channelId: channel.id, categoryId: category?.id ?? channel.parentId ?? null, message: interaction.options.getString('wiadomosc') || old.message } });
      return interaction.editReply(`Powitania włączone w kanale <#${channel.id}>. Treść i kategorię zmienisz także w panelu Powitania na stronie.`);
    } catch (error) { return interaction.editReply(`Nie udało się zapisać powitań: ${error.message}`); }
  }
  return { memberJoined, command };
}
