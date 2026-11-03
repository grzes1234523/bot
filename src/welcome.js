import { AttachmentBuilder, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const MEMBER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export function validateMemberImage(image) {
  if (image == null) return null;
  if (typeof image !== 'object' || typeof image.data !== 'string' || image.data.length > Math.ceil(MEMBER_IMAGE_MAX_BYTES / 3) * 4 || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new Error('Nieprawidłowe zdjęcie. Wybierz plik PNG, JPG, GIF lub WebP do 2 MB.');
  const bytes = Buffer.from(image.data, 'base64');
  if (!bytes.length || bytes.length > MEMBER_IMAGE_MAX_BYTES) throw new Error('Zdjęcie może mieć maksymalnie 2 MB.');
  const formats = [
    ['image/png', 'png', bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))],
    ['image/jpeg', 'jpg', bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255],
    ['image/gif', 'gif', ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))],
    ['image/webp', 'webp', bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'],
  ];
  const format = formats.find(([mime,, valid]) => mime === image.mime && valid);
  if (!format) throw new Error('Format zdjęcia nie pasuje do pliku. Dozwolone: PNG, JPG, GIF i WebP.');
  return { mime: format[0], name: `zdjecie.${format[1]}`, data: bytes.toString('base64') };
}

export const welcomeDefaults = { enabled: false, categoryId: null, channelId: null, message: 'Witaj {user} na serwerze **{server}**! 🎉 Jest nas już **{count}**. Miłej zabawy!' };
export const welcomeCommands = [
  new SlashCommandBuilder().setName('powitanie-ustaw').setDescription('Ustawia kanał powitań nowych użytkowników.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał powitań').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addChannelOption(o => o.setName('kategoria').setDescription('Kategoria zawierająca wybrany kanał').addChannelTypes(ChannelType.GuildCategory))
    .addStringOption(o => o.setName('wiadomosc').setDescription('Treść: {user}, {username}, {server}, {count}').setMaxLength(2000)),
  new SlashCommandBuilder().setName('powitanie-wylacz').setDescription('Wyłącza automatyczne powitania.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];
export const welcomeSettings = (state, guildId) => ({ ...welcomeDefaults, ...(state.welcome?.guilds?.[guildId] ?? {}) });
export const farewellDefaults = { enabled: false, categoryId: null, channelId: null, message: '👋 {username} opuścił(a) serwer **{server}**. Do zobaczenia! Pozostało nas **{count}**.' };
export const farewellCommands = [
  new SlashCommandBuilder().setName('pozegnanie-ustaw').setDescription('Ustawia kanał pożegnań po odejściu użytkownika.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('kanal').setDescription('Kanał pożegnań').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addChannelOption(o => o.setName('kategoria').setDescription('Kategoria zawierająca wybrany kanał').addChannelTypes(ChannelType.GuildCategory))
    .addStringOption(o => o.setName('wiadomosc').setDescription('Treść: {user}, {username}, {server}, {count}').setMaxLength(2000)),
  new SlashCommandBuilder().setName('pozegnanie-wylacz').setDescription('Wyłącza automatyczne pożegnania.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];
export const farewellSettings = (state, guildId) => ({ ...farewellDefaults, ...(state.farewell?.guilds?.[guildId] ?? {}) });
export const configureFarewell = options => configureWelcome({ ...options, kind: 'farewell' });
export const createFarewellSystem = options => createWelcomeSystem({ ...options, kind: 'farewell' });


export async function configureWelcome({ guild, featureStore, body, kind = 'welcome' }) {
  if (!body || typeof body.enabled !== 'boolean') throw new Error('Sprawdź ustawienia wiadomości.');
  const message = String(body.message ?? '').trim();
  if (!message || message.length > 2000) throw new Error('Treść wiadomości musi mieć od 1 do 2000 znaków.');
  const categoryId = body.categoryId || null;
  const channelId = body.channelId || null;
  const previous = featureStore.snapshot()[kind]?.guilds?.[guild.id];
  const image = Object.hasOwn(body, 'image') ? validateMemberImage(body.image) : previous?.image ?? null;
  if (body.enabled && !channelId) throw new Error('Wybierz kanał wiadomości.');
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
    if (body.enabled && image && !channel.permissionsFor(me)?.has(PermissionFlagsBits.AttachFiles)) throw new Error('Bot potrzebuje uprawnienia Załączanie plików, aby wysyłać zdjęcia.');
  }
  const config = { enabled: body.enabled, categoryId, channelId, message, image };
  await featureStore.update(state => { state[kind] ??= { guilds: {} }; state[kind].guilds ??= {}; state[kind].guilds[guild.id] = config; });
  return config;
}
export function welcomeText(template, member, mention = true) {
  const vars = { user: mention ? `<@${member.id}>` : member.user.username, username: member.user.username, server: member.guild.name, count: String(member.guild.memberCount ?? 0) };
  return template.replace(/\{(user|username|server|count)\}/g, (_, name) => vars[name]).slice(0, 4000);
}
export function createWelcomeSystem({ featureStore, guildId, kind = 'welcome' }) {
  const settingsFor = kind === 'farewell' ? farewellSettings : welcomeSettings;
  const label = kind === 'farewell' ? 'Pożegnania' : 'Powitania';
  async function memberJoined(member) {
    if (member.guild.id !== guildId || member.user.bot) return;
    const settings = settingsFor(featureStore.snapshot(), guildId);
    if (!settings.enabled || !settings.channelId) return;
    const channel = await member.guild.channels.fetch(settings.channelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return;
    const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle(kind === 'farewell' ? '👋 Do zobaczenia!' : '👋 Witaj na serwerze!').setDescription(welcomeText(settings.message, member, kind !== 'farewell')).setTimestamp();
    const avatar = member.user.displayAvatarURL?.({ size: 128 });
    if (avatar) embed.setThumbnail(avatar);
    const image = settings.image ? validateMemberImage(settings.image) : null;
    const files = image ? [new AttachmentBuilder(Buffer.from(image.data, 'base64'), { name: image.name })] : [];
    if (image) embed.setImage(`attachment://${image.name}`);
    await channel.send({ ...(kind === 'welcome' ? { content: `<@${member.id}>` } : {}), embeds: [embed], ...(files.length ? { files } : {}), allowedMentions: { parse: [], users: kind === 'welcome' ? [member.id] : [] } });
  }
  async function command(interaction) {
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (interaction.guildId !== guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply('Wymagane uprawnienie Zarządzanie serwerem na skonfigurowanym serwerze.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const old = settingsFor(featureStore.snapshot(), guildId);
    try {
      if (interaction.commandName.endsWith('-wylacz')) {
        await featureStore.update(state => { state[kind] ??= { guilds: {} }; state[kind].guilds ??= {}; state[kind].guilds[guildId] = { ...old, enabled: false }; });
        return interaction.editReply(`${label} wyłączone.`);
      }
      const channel = interaction.options.getChannel('kanal', true);
      const category = interaction.options.getChannel('kategoria');
      await configureWelcome({ guild: interaction.guild, featureStore, kind, body: { enabled: true, channelId: channel.id, categoryId: category?.id ?? channel.parentId ?? null, message: interaction.options.getString('wiadomosc') || old.message } });
      return interaction.editReply(`${label} włączone w kanale <#${channel.id}>. Treść i kategorię zmienisz także w panelu ${label} na stronie.`);
    } catch (error) { return interaction.editReply(`Nie udało się zapisać ustawień: ${error.message}`); }
  }
  return { memberJoined, memberLeft: memberJoined, command };
}
