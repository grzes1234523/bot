import { ChannelType, PermissionFlagsBits } from 'discord.js';
export const logEvents = { voice: 'Kanały i statusy głosowe', messages: 'Usunięte wiadomości', channels: 'Tworzenie i usuwanie kanałów', members: 'Dołączenia i odejścia członków', automod: 'Auto Mod', moderation: 'Moderacja i pozostałe zdarzenia modułów' };
export const logSettings = state => ({ enabled: true, categoryId: null, ...(state.logging ?? {}), events: { ...Object.fromEntries(Object.keys(logEvents).map(key => [key,true])), ...(state.logging?.events ?? {}) }, eventChannels: { ...Object.fromEntries(Object.keys(logEvents).map(key => [key,null])), ...(state.logging?.eventChannels ?? {}) } });
export async function saveLogSettings({ guild, featureStore, body }) {
  if (!body || typeof body.enabled !== 'boolean' || !body.events || Object.keys(logEvents).some(key => typeof body.events[key] !== 'boolean')) throw new Error('Sprawdź przełączniki logów.');
  const categoryId = body.categoryId || null, channelId = body.channelId || null;
  const supplied = body.eventChannels ?? logSettings(featureStore.snapshot()).eventChannels;
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Sprawdź kanały poszczególnych logów.');
  const eventChannels = Object.fromEntries(Object.keys(logEvents).map(key => [key,supplied[key] || null]));
  if (body.enabled && !channelId && Object.keys(logEvents).some(key => body.events[key] && !eventChannels[key])) throw new Error('Wybierz kanał domyślny albo osobny kanał dla każdego włączonego typu logów.');
  if (categoryId && (await guild.channels.fetch(categoryId))?.type !== ChannelType.GuildCategory) throw new Error('Wybierz kategorię Discord.');
  if (channelId) {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Wybierz kanał tekstowy.');
    if (categoryId && channel.parentId !== categoryId) throw new Error('Kanał musi należeć do wybranej kategorii.');
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (body.enabled && !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('Bot potrzebuje dostępu do kanału, wysyłania wiadomości i osadzania linków.');
  }
  for (const id of new Set(Object.values(eventChannels).filter(Boolean))) {
    if (typeof id !== 'string') throw new Error('Nieprawidłowy kanał logów.');
    const channel = await guild.channels.fetch(id);
    if (!channel || ![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Każdy kanał logów musi być dostępnym kanałem tekstowym.');
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (body.enabled && !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])) throw new Error('Bot potrzebuje dostępu, wysyłania wiadomości i osadzania linków w każdym wybranym kanale logów.');
  }
  const settings = { enabled: body.enabled, categoryId, events: Object.fromEntries(Object.keys(logEvents).map(key => [key,body.events[key]])), eventChannels };
  await featureStore.update(state => { state.logging=settings;state.logChannelId=channelId; });
  return settings;
}
