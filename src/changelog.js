import { ChannelType, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { loadReleases } from './changelog-releases.js';

export const CHANGELOG_CHANNEL_NAME = 'informacja-bot';
export const DEFAULT_CHANGELOG_CHANNEL_ID = '1570530877379977296';
const SECTION_LABELS = [['zmienione', 'Zmienione'], ['dodane', 'Dodane'], ['usuniete', 'Usunięte']];

export function resolveChangelogChannelId(guildId, { primaryGuildId, channelId } = {}) {
  if (!primaryGuildId || String(guildId) !== String(primaryGuildId)) return '';
  if (channelId === undefined || channelId === null) return DEFAULT_CHANGELOG_CHANNEL_ID;
  const value = String(channelId).trim();
  return /^\d{17,20}$/.test(value) ? value : '';
}

function changelogOptions(logOrOptions) {
  if (typeof logOrOptions === 'function') return { log: logOrOptions };
  return { log: console.error, ...(logOrOptions ?? {}) };
}

function adminOverwrites(guild, me, staffRoleId) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  const roles = [...(guild.roles?.cache?.values?.() ?? [])];
  const seen = new Set([guild.roles.everyone.id]);
  for (const role of roles) {
    if (!role?.id || seen.has(role.id)) continue;
    if (!role.permissions?.has?.(PermissionFlagsBits.Administrator)) continue;
    seen.add(role.id);
    overwrites.push({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
  }
  if (staffRoleId && !seen.has(staffRoleId)) {
    overwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
  }
  overwrites.push({ id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] });
  return overwrites;
}

async function restrictToAdmins(channel, guild, me, staffRoleId, log, label) {
  if (!me.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    log(`Brak uprawnienia Zarządzanie kanałami na ${label}. Uprawnienia kanału informacji nie zostały zmienione.`);
    return;
  }
  if (!channel.permissionOverwrites?.set) return;
  try {
    await channel.permissionOverwrites.set(adminOverwrites(guild, me, staffRoleId), 'Kanał informacji bota widoczny tylko dla administracji');
  } catch (error) {
    log(`Nie zmieniono uprawnień kanału informacji na ${label}: ${error.message}`);
  }
}

function canPost(channel, me) {
  return channel.permissionsFor?.(me)?.has?.([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]) !== false;
}

export function changelogEmbed(release) {
  const entry = typeof release.version === 'string' && Array.isArray(release.zmienione) ? release : loadReleases([release])[0];
  const field = items => (items.length ? items.map(item => `• ${item}`).join('\n') : '—').slice(0, 1024);
  return new EmbedBuilder()
    .setColor(0x9d5cff)
    .setTitle(`Aktualizacja ${entry.version}`.slice(0, 256))
    .setDescription(`Data: ${entry.date}`)
    .addFields(...SECTION_LABELS.map(([key, name]) => ({ name, value: field(entry[key]) })))
    .setFooter({ text: 'informacja-bot' })
    .setTimestamp(new Date(`${entry.date}T12:00:00Z`));
}

export async function ensureChangelogChannel(guild, logOrOptions = console.error) {
  const options = changelogOptions(logOrOptions);
  const log = options.log;
  const label = `${guild?.name || 'serwer'} (${guild?.id || 'bez id'})`;
  const me = guild?.members?.me ?? await guild?.members?.fetchMe?.().catch(() => null);
  if (!me) {
    log(`Kanał informacji bota: bot nie widzi siebie na ${label}.`);
    return null;
  }
  const configuredId = resolveChangelogChannelId(guild?.id, options);
  if (configuredId) {
    const channel = await guild.channels?.fetch?.(configuredId).catch(() => null);
    if (channel?.type === ChannelType.GuildText && (!channel.guildId || channel.guildId === guild.id)) {
      await restrictToAdmins(channel, guild, me, options.staffRoleId, log, label);
      if (!canPost(channel, me)) {
        log(`Kanał ${configuredId} na ${label} istnieje, ale bot nie może wysyłać wiadomości.`);
        return null;
      }
      return channel;
    }
    log(`CHANGELOG_CHANNEL_ID ${configuredId} nie jest kanałem tekstowym na ${label}. Używam kanału informacja-bot.`);
  }
  let channels = guild.channels?.cache;
  if (!channels?.values && guild.channels?.fetch) channels = await guild.channels.fetch().catch(() => null);
  const existing = [...(channels?.values?.() ?? [])].find(channel => channel?.type === ChannelType.GuildText && String(channel.name || '').toLowerCase() === CHANGELOG_CHANNEL_NAME);
  if (existing) {
    await restrictToAdmins(existing, guild, me, options.staffRoleId, log, label);
    if (!canPost(existing, me)) {
      log(`Kanał informacja-bot na ${label} istnieje, ale bot nie może wysyłać wiadomości.`);
      return null;
    }
    return existing;
  }
  if (!me.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    log(`Brak uprawnienia Zarządzanie kanałami na ${label}. Nie utworzono kanału informacja-bot.`);
    return null;
  }
  try {
    return await guild.channels.create({
      name: CHANGELOG_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: 'Informacje o zmianach, dodatkach i usunięciach w bocie oraz na stronie. Widoczne dla administracji.',
      permissionOverwrites: adminOverwrites(guild, me, options.staffRoleId),
      reason: 'Kanał informacji o zmianach bota',
    });
  } catch (error) {
    log(`Nie utworzono kanału informacja-bot na ${label}: ${error.message}`);
    return null;
  }
}

function postedReleaseIds(record, channel) {
  if (Array.isArray(record)) return String(channel?.name || '').toLowerCase() === CHANGELOG_CHANNEL_NAME ? record : [];
  if (record?.channelId === channel?.id && Array.isArray(record.ids)) return record.ids;
  return [];
}

export async function publishGuildChangelog(guild, featureStore, logOrOptions = console.error) {
  const options = changelogOptions(logOrOptions);
  const log = options.log;
  try {
    const channel = await ensureChangelogChannel(guild, options);
    if (!channel) return { posted: [] };
    const posted = [];
    const known = new Set(postedReleaseIds(featureStore.snapshot().changelogPosts?.[guild.id], channel));
    const pending = loadReleases().filter(release => !known.has(release.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    for (const release of pending) {
      await channel.send({ embeds: [changelogEmbed(release)] });
      await featureStore.update(state => {
        state.changelogPosts ??= {};
        const current = postedReleaseIds(state.changelogPosts[guild.id], channel);
        state.changelogPosts[guild.id] = { channelId: channel.id, ids: [...new Set([...current, release.id])] };
      });
      posted.push(release.id);
    }
    return { posted };
  } catch (error) {
    log(`Nie udało się opublikować informacji bota na ${guild?.name || guild?.id}: ${error.message}`);
    return { posted: [] };
  }
}


export const changelogCommands = [
  new SlashCommandBuilder().setName('aktualizacja').setDescription('Dodaj wpis do historii zmian bota i strony')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option.setName('typ').setDescription('Rodzaj zmiany').setRequired(true)
      .addChoices({name:'Dodano',value:'dodano'},{name:'Zmieniono',value:'zmieniono'},{name:'Usunięto',value:'usunieto'}))
    .addStringOption(option => option.setName('obszar').setDescription('Czego dotyczy zmiana').setRequired(true)
      .addChoices({name:'Bot Discord',value:'bot'},{name:'Strona',value:'strona'}))
    .addStringOption(option => option.setName('opis').setDescription('Opis aktualizacji (maks. 1000 znaków)').setRequired(true).setMaxLength(1000)),
];

export async function handleChangelogCommand(interaction, featureStore) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content:'Tylko osoby z uprawnieniem Zarządzanie serwerem mogą publikować aktualizacje.', flags:MessageFlags.Ephemeral });
  }
  const type=interaction.options.getString('typ',true);
  const area=interaction.options.getString('obszar',true);
  const description=interaction.options.getString('opis',true).trim();
  if (!['dodano','zmieniono','usunieto'].includes(type) || !['bot','strona'].includes(area) || !description || description.length>1000) {
    return interaction.reply({content:'Nieprawidłowe dane aktualizacji.',flags:MessageFlags.Ephemeral});
  }
  await featureStore.update(state=>{
    state.changelog ??= {};
    const entries=Array.isArray(state.changelog[interaction.guildId])?state.changelog[interaction.guildId]:[];
    state.changelog[interaction.guildId]=[{type,area,description,timestamp:new Date().toISOString(),authorId:interaction.user.id},...entries].slice(0,200);
  });
  return interaction.reply({content:'✅ Aktualizacja zapisana. Pojawi się na stronie po odświeżeniu.',flags:MessageFlags.Ephemeral});
}
