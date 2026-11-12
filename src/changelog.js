import { ChannelType, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { loadReleases } from './changelog-releases.js';

export const CHANGELOG_CHANNEL_NAME = 'informacja-bot';
const SECTION_LABELS = [['zmienione', 'Zmienione'], ['dodane', 'Dodane'], ['usuniete', 'Usunięte']];

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

export async function ensureChangelogChannel(guild, log = console.error) {
  const label = `${guild?.name || 'serwer'} (${guild?.id || 'bez id'})`;
  const me = guild?.members?.me ?? await guild?.members?.fetchMe?.().catch(() => null);
  if (!me) {
    log(`Kanał informacja-bot: bot nie widzi siebie na ${label}.`);
    return null;
  }
  let channels = guild.channels?.cache;
  if (!channels?.values && guild.channels?.fetch) channels = await guild.channels.fetch();
  const existing = [...(channels?.values?.() ?? [])].find(channel => channel?.type === ChannelType.GuildText && String(channel.name || '').toLowerCase() === CHANGELOG_CHANNEL_NAME);
  if (existing) {
    const canSend = existing.permissionsFor?.(me)?.has?.([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (!canSend) {
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
      topic: 'Informacje o zmianach, dodatkach i usunięciach w bocie oraz na stronie.',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
      ],
      reason: 'Kanał informacji o zmianach bota',
    });
  } catch (error) {
    log(`Nie utworzono kanału informacja-bot na ${label}: ${error.message}`);
    return null;
  }
}

export async function publishGuildChangelog(guild, featureStore, log = console.error) {
  try {
    const channel = await ensureChangelogChannel(guild, log);
    if (!channel) return { posted: [] };
    const posted = [];
    const pending = loadReleases().filter(release => !(featureStore.snapshot().changelogPosts?.[guild.id] ?? []).includes(release.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    for (const release of pending) {
      await channel.send({ embeds: [changelogEmbed(release)] });
      await featureStore.update(state => {
        state.changelogPosts ??= {};
        const current = Array.isArray(state.changelogPosts[guild.id]) ? state.changelogPosts[guild.id] : [];
        if (!current.includes(release.id)) state.changelogPosts[guild.id] = [...current, release.id];
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
