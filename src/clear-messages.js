import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const clearMessagesCommand = new SlashCommandBuilder()
  .setName('wyczysc')
  .setDescription('Usuwa do 100 ostatnich wiadomości młodszych niż 14 dni.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(o => o.setName('liczba').setDescription('Ile ostatnich wiadomości sprawdzić (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
  .addChannelOption(o => o.setName('kanal').setDescription('Domyślnie kanał, na którym używasz komendy').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement));

export async function clearMessages(interaction, { guildId, log = async () => {} }) {
  const respond = content => interaction.deferred
    ? interaction.editReply({ content, allowedMentions: { parse: [] } })
    : interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  if (!interaction.guild || interaction.guildId !== guildId) return respond('Ta komenda działa tylko na skonfigurowanym serwerze.');
  const count = interaction.options.getInteger('liczba', true);
  if (!Number.isInteger(count) || count < 1 || count > 100) return respond('Podaj liczbę od 1 do 100.');
  const channel = interaction.options.getChannel('kanal') ?? interaction.channel;
  if (!channel || channel.guildId !== interaction.guildId || !channel.messages?.fetch || !channel.bulkDelete) return respond('Wybierz kanał tekstowy na tym serwerze.');
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages];
  if (!channel.permissionsFor(interaction.member)?.has(required)) return respond('Potrzebujesz uprawnień: Wyświetlanie kanału, Czytanie historii i Zarządzanie wiadomościami na wybranym kanale.');
  const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!channel.permissionsFor(bot)?.has(required)) return respond('Bot potrzebuje uprawnień: Wyświetlanie kanału, Czytanie historii i Zarządzanie wiadomościami na wybranym kanale.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let deleted;
  let skipped;
  try {
    const messages = await channel.messages.fetch({ limit: count });
    // Discord odrzuca zbiorcze usuwanie wiadomości starszych niż 14 dni.
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recent = messages.filter(message => message.createdTimestamp > cutoff);
    deleted = recent.size ? await channel.bulkDelete(recent, true) : new Map();
    skipped = messages.size - deleted.size;
  } catch (error) {
    console.error('Nie udało się wyczyścić wiadomości:', error.message);
    return respond('Nie udało się zakończyć usuwania. Sprawdź uprawnienia bota i spróbuj ponownie.');
  }
  await respond(`Usunięto **${deleted.size}** wiadomości z <#${channel.id}>.${skipped ? ` Pominięto **${skipped}** wiadomości (np. starsze niż 14 dni).` : ''}`);
  if (deleted.size) await log(interaction.guild, '🧹 Usunięcie wiadomości', `Kanał: <#${channel.id}>\nModerator: <@${interaction.user.id}>\nUsunięto: ${deleted.size}`, 0xedaa33, 'moderation');
}
