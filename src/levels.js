import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const levelDefaults = { enabled: true, messagesEnabled: true, voiceEnabled: true, messageXp: 15, messageCooldownSeconds: 60, voiceXpPerMinute: 5, announcementChannelId: null, rewards: [] };
const levelCardCommand=name=>new SlashCommandBuilder().setName(name).setDescription('Pokazuje kartę poziomu, ranking i pasek XP.').addUserOption(o=>o.setName('uzytkownik').setDescription('Osoba, której poziom chcesz sprawdzić'));
export const levelCommands = [
  levelCardCommand('level'),
  levelCardCommand('poziom'),
  new SlashCommandBuilder().setName('ranking').setDescription('Ranking poziomów aktywności na serwerze.'),
  new SlashCommandBuilder().setName('poziomy-ustaw').setDescription('Włącza lub wyłącza system poziomów.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(o => o.setName('wlaczone').setDescription('Czy zbierać XP za aktywność?').setRequired(true)),
];
export const xpForLevel = level => 100 * Math.max(0, level) ** 2;
export const levelForXp = xp => Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100));
export function levelSettings(state, guildId) { return { ...levelDefaults, ...(state.levels?.guilds?.[guildId]?.settings ?? {}) }; }
export function levelRanking(state, guildId) {
  return Object.entries(state.levels?.guilds?.[guildId]?.users ?? {}).map(([id, user]) => ({ ...user, id, level: levelForXp(user.xp) }))
    .sort((a, b) => b.xp - a.xp || a.id.localeCompare(b.id));
}
export function validateLevelSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Nieprawidłowe ustawienia poziomów.');
  for (const key of ['enabled', 'messagesEnabled', 'voiceEnabled']) if (typeof body[key] !== 'boolean') throw new Error('Sprawdź przełączniki XP.');
  for (const [key, min, max] of [['messageXp', 1, 1000], ['messageCooldownSeconds', 10, 3600], ['voiceXpPerMinute', 1, 1000]]) {
    if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) throw new Error(`Nieprawidłowa wartość ${key}.`);
  }
  if (!Array.isArray(body.rewards) || body.rewards.length > 20) throw new Error('Możesz ustawić maksymalnie 20 ról za poziomy.');
  const seen = new Set();
  if (body.announcementChannelId != null && body.announcementChannelId !== '' && !/^\d{17,20}$/.test(body.announcementChannelId)) throw new Error('Wybierz poprawny kanał powiadomień.');
  for (const reward of body.rewards) {
    if (!Number.isInteger(reward.level) || reward.level < 1 || reward.level > 1000 || !/^\d{17,20}$/.test(reward.roleId) || seen.has(reward.roleId)) throw new Error('Sprawdź poziomy i role nagród; role nie mogą się powtarzać.');
    seen.add(reward.roleId);
  }
  return { ...Object.fromEntries([...Object.keys(levelDefaults)].map(key => [key, body[key]])), announcementChannelId: body.announcementChannelId || null };
}
function ensureGuild(state, guildId) {
  state.levels ??= { guilds: {} };
  state.levels.guilds ??= {};
  return state.levels.guilds[guildId] ??= { settings: { ...levelDefaults }, users: {} };
}

export function buildLevelCard({user,member,account,rank,guild,timestamp=Date.now()}) {
  const xp=Math.max(0,Number(account.xp)||0),level=levelForXp(xp);
  const start=xpForLevel(level),next=xpForLevel(level+1),progress=xp-start,needed=next-start;
  const percent=Math.min(100,Math.max(0,Math.floor(progress/needed*100)));
  const filled=Math.min(20,Math.floor(progress/needed*20));
  const bar='█'.repeat(filled)+'░'.repeat(20-filled);
  const format=value=>value.toLocaleString('pl-PL');
  const name=member?.displayName||user.globalName||user.username;
  const embed=new EmbedBuilder().setColor(0xf1c40f).setTitle(`⭐ Karta poziomu — ${name}`.slice(0,256))
    .setDescription(`**Poziom ${level} · Ranking ${rank?'#'+rank:'—'}**\n\n\`${bar}\`\n**${percent}%** · ${format(progress)} / ${format(needed)} XP\nŁącznie: **${format(xp)} XP**\n\nDo poziomu **${level+1}** brakuje **${format(next-xp)} XP**`)
    .setFooter({text:`${guild?.name||'Serwer Discord'} · Wiadomości: ${account.messageCount||0} · Rozmowy: ${account.voiceMinutes||0} min`})
    .setTimestamp(timestamp);
  const avatar=member?.displayAvatarURL?.({size:256})||user.displayAvatarURL?.({size:256});
  if(avatar)embed.setThumbnail(avatar);
  return embed;
}

export function createLevelSystem({ client, featureStore, guildId, now = Date.now }) {
  const voiceSince = new Map();
  let ticking = false;
  async function rewardRoles(member, xp) {
    if (!member) return;
    const settings = levelSettings(featureStore.snapshot(), guildId);
    const level = levelForXp(xp);
    for (const reward of settings.rewards) {
      if (reward.level > level || member.roles.cache.has(reward.roleId)) continue;
      const role = member.guild.roles.cache.get(reward.roleId);
      if (role?.editable && !role.managed && role.id !== guildId) {
        await member.roles.add(role, `Osiągnięto poziom ${level}`).catch(error => console.warn('Nie udało się nadać roli za poziom:', error.message));
      }
    }
  }
  async function award(member, source, time) {
    let awardedXp = null;
    let previousLevel = 0;
    await featureStore.update(state => {
      const settings = levelSettings(state, guildId);
      if (!settings.enabled || !(source === 'message' ? settings.messagesEnabled : settings.voiceEnabled)) return;
      const guild = ensureGuild(state, guildId);
      guild.users ??= {};
      const user = guild.users[member.id] ??= { xp: 0, messageCount: 0, voiceMinutes: 0 };
      const last = source === 'message' ? user.lastMessageAt : user.lastVoiceAt;
      const cooldown = source === 'message' ? settings.messageCooldownSeconds * 1000 : 60000;
      if (last != null && time - last < cooldown) return;
      user.name = member.displayName || member.user.username;
      previousLevel = levelForXp(user.xp);
      user.xp = Math.min(Number.MAX_SAFE_INTEGER, (Number(user.xp) || 0) + (source === 'message' ? settings.messageXp : settings.voiceXpPerMinute));
      if (source === 'message') { user.lastMessageAt = time; user.messageCount++; }
      else { user.lastVoiceAt = time; user.voiceMinutes++; }
      awardedXp = user.xp;
    });
    if (awardedXp != null) {
      await rewardRoles(member, awardedXp);
      const settings = levelSettings(featureStore.snapshot(), guildId);
      const level = levelForXp(awardedXp);
      if (level > previousLevel && settings.announcementChannelId) {
        try {
          const channel = await member.guild.channels.fetch(settings.announcementChannelId);
          if (channel?.isTextBased() && !channel.isThread?.()) await channel.send({
            content: `🎉 <@${member.id}> zdobywa **poziom ${level}**! Łącznie **${awardedXp} XP**.`,
            allowedMentions: { parse: [], users: [member.id] },
          });
        } catch (error) { console.warn('Nie udało się wysłać powiadomienia o poziomie:', error.message); }
      }
    }
  }
  async function message(message) {
    if (message.guildId !== guildId || message.author?.bot || message.webhookId || message.system || !message.member) return;
    const settings = levelSettings(featureStore.snapshot(), guildId);
    if (!settings.enabled || !settings.messagesEnabled) return;
    const last = featureStore.snapshot().levels?.guilds?.[guildId]?.users?.[message.author.id]?.lastMessageAt;
    if (last != null && now() - last < settings.messageCooldownSeconds * 1000) return;
    await award(message.member, 'message', now());
  }
  function eligible(state) {
    if (!state?.channel || !state.member || state.member.user.bot || state.channelId === state.guild.afkChannelId || state.mute || state.deaf || state.suppress) return false;
    return state.channel.members.filter(member => !member.user.bot && !member.voice.mute && !member.voice.deaf && !member.voice.suppress).size >= 2;
  }
  function voiceState(oldState, newState) {
    if (newState.guild.id !== guildId) return;
    for (const channel of [oldState.channel, newState.channel].filter(Boolean)) {
      for (const member of channel.members.values()) {
        if (eligible(member.voice)) {
          if (!voiceSince.has(member.id)) voiceSince.set(member.id, now());
        } else voiceSince.delete(member.id);
      }
    }
    if (!eligible(newState)) voiceSince.delete(newState.id);
  }
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const settings = levelSettings(featureStore.snapshot(), guildId);
      if (!settings.enabled || !settings.voiceEnabled) { voiceSince.clear(); return; }
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      const active = new Set();
      for (const state of guild.voiceStates.cache.values()) {
        if (!eligible(state)) continue;
        active.add(state.id);
        if (!voiceSince.has(state.id)) voiceSince.set(state.id, now());
        else if (now() - voiceSince.get(state.id) >= 60000) {
          await award(state.member, 'voice', now());
          voiceSince.set(state.id, now());
        }
      }
      for (const id of voiceSince.keys()) if (!active.has(id)) voiceSince.delete(id);
    } finally { ticking = false; }
  }
  async function command(interaction) {
    if (interaction.guildId !== guildId) return interaction.reply({ content: 'Ta komenda działa na skonfigurowanym serwerze.', flags: MessageFlags.Ephemeral });
    if (interaction.commandName === 'poziomy-ustaw') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Wymagane uprawnienie Zarządzanie serwerem.', flags: MessageFlags.Ephemeral });
      const enabled = interaction.options.getBoolean('wlaczone', true);
      await featureStore.update(state => { ensureGuild(state, guildId).settings.enabled = enabled; });
      return interaction.reply({ content: `System poziomów ${enabled ? 'włączony' : 'wyłączony'}. Ustawienia i role nagród zmienisz w panelu Poziomy na stronie.`, flags: MessageFlags.Ephemeral });
    }
    const ranking = levelRanking(featureStore.snapshot(), guildId);
    if (interaction.commandName === 'ranking') return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle('🏆 Ranking poziomów').setDescription(ranking.slice(0, 10).map((user, i) => `**${i + 1}.** <@${user.id}> · poziom **${user.level}** · ${user.xp} XP`).join('\n') || 'Nikt jeszcze nie zdobył XP. Zacznij rozmawiać!')], allowedMentions: { parse: [] } });
    const user = interaction.options.getUser('uzytkownik') ?? interaction.user;
    const account = ranking.find(item => item.id === user.id) ?? { xp: 0, level: 0, messageCount: 0, voiceMinutes: 0 };
    const member = interaction.options.getMember?.('uzytkownik') ?? interaction.guild?.members?.cache?.get(user.id) ?? (user.id===interaction.user.id?interaction.member:null);
    const rank = ranking.findIndex(item=>item.id===user.id);
    return interaction.reply({embeds:[buildLevelCard({user,member,account,rank:rank<0?null:rank+1,guild:interaction.guild,timestamp:now()})],allowedMentions:{parse:[]}});
  }
  return { message, voiceState, tick, command };
}
