import { ChannelType, PermissionFlagsBits } from 'discord.js';
export const logEvents = { voice: 'Kanały i statusy głosowe', messages: 'Usunięte wiadomości', channels: 'Tworzenie i usuwanie kanałów', members: 'Dołączenia i odejścia członków', automod: 'Auto Mod', moderation: 'Moderacja i pozostałe zdarzenia modułów' };
export const logSettings = state => ({ enabled: true, categoryId: null, ...(state.logging ?? {}), events: { ...Object.fromEntries(Object.keys(logEvents).map(key => [key,true])), ...(state.logging?.events ?? {}) } });
export async function saveLogSettings({ guild, featureStore, body }) {
  if (!body || typeof body.enabled !== 'boolean' || !body.events || Object.keys(logEvents).some(key => typeof body.events[key] !== 'boolean')) throw new Error('Sprawdź przełączniki logów.');
  const categoryId = body.categoryId || null, channelId = body.channelId || null;
  if (body.enabled && !channelId) throw new Error('Wybierz kanał logów.');
  if (categoryId && (await guild.channels.fetch(categoryId))?.type !== ChannelType.GuildCategory) throw new Error('Wybierz kategorię Discord.');
  if (channelId) {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Wybierz kanał tekstowy.');
    if (categoryId && channel.parentId !== categoryId) throw new Error('Kanał musi należeć do wybranej kategorii.');
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (body.enabled && !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('Bot potrzebuje dostępu do kanału, wysyłania wiadomości i osadzania linków.');
  }
  const settings = { enabled: body.enabled, categoryId, events: Object.fromEntries(Object.keys(logEvents).map(key => [key,body.events[key]])) };
  await featureStore.update(state => { state.logging=settings;state.logChannelId=channelId; });
  return settings;
}
