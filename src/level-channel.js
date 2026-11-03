import { ChannelType, PermissionFlagsBits } from 'discord.js';

export async function createLevelChannel({ guild, featureStore, categoryId }) {
  if (!/^\d{17,20}$/.test(String(categoryId ?? ''))) throw new Error('Wybierz kategorię Discord.');
  const category = await guild.channels.fetch(categoryId);
  if (category?.type !== ChannelType.GuildCategory) throw new Error('Wybrany kanał nie jest kategorią Discord.');
  const me = guild.members.me ?? await guild.members.fetchMe();
  if (!category.permissionsFor(me)?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error('Brak uprawnień bota w wybranej kategorii.');
  const configuredId = featureStore.snapshot().levels?.guilds?.[guild.id]?.settings?.announcementChannelId;
  const channels = await guild.channels.fetch();
  const existing = channels.find(channel => channel?.type === ChannelType.GuildText && channel.parentId === category.id && (channel.id === configuredId || channel.name === 'poziomy'));
  if (existing && !existing.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error('Bot nie może wysyłać wiadomości w istniejącym kanale poziomy.');
  const channel = existing ?? await guild.channels.create({ name: 'poziomy', type: ChannelType.GuildText, parent: category.id, topic: '🏆 Awans na nowe poziomy aktywności — StrefaBot', reason: 'Utworzenie kanału poziomów z panelu WWW' });
  try {
    await featureStore.update(state => {
      state.levels ??= { guilds: {} };
      state.levels.guilds ??= {};
      const data = state.levels.guilds[guild.id] ??= { users: {}, settings: {} };
      data.settings ??= {};
      data.settings.announcementChannelId = channel.id;
    });
  } catch (error) {
    if (!existing) await channel.delete('Nie udało się zapisać konfiguracji poziomów').catch(() => {});
    throw error;
  }
  return { channelId: channel.id, channelName: channel.name, categoryId: category.id, created: !existing };
}
