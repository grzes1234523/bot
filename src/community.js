import crypto from 'node:crypto';
import { createMillionairesSystem } from './millionaires.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const communityDefaults = { gamesEnabled: true, millionairesEnabled: true, ideasEnabled: true, categoryId: null, ideasChannelId: null };
export const communitySettings = (state, guildId) => ({ ...communityDefaults, ...(state.community?.guilds?.[guildId]?.settings ?? {}) });
export function communityGuild(state, guildId) {
  state.community ??= { guilds: {} }; state.community.guilds ??= {};
  return state.community.guilds[guildId] ??= { settings: { ...communityDefaults }, ideas: [], quizzes: [], draws: 0 };
}
export const communityCommands = [
  new SlashCommandBuilder().setName('zabawa').setDescription('Zabawy serwerowe: losowanie, quiz i Milionerzy.')
    .addSubcommand(s => s.setName('losuj').setDescription('Losuje jedną z podanych opcji.').addStringOption(o => o.setName('opcje').setDescription('Oddziel opcje przecinkami (2–20 opcji)').setRequired(true).setMaxLength(1000)))
    .addSubcommand(s => s.setName('quiz').setDescription('Rozpoczyna quiz z czterema odpowiedziami.'))
    .addSubcommand(s => s.setName('milionerzy').setDescription('12 pytań, koła ratunkowe i milion punktów do zdobycia.')),
  new SlashCommandBuilder().setName('pomysl').setDescription('Zgłasza pomysł do głosowania społeczności.')
    .addStringOption(o => o.setName('tresc').setDescription('Opisz propozycję (10–1500 znaków)').setRequired(true).setMinLength(10).setMaxLength(1500)),
];
const questions = [
  { question: 'Ile boków ma sześciokąt?', options: ['5', '6', '7', '8'], correct: 1 },
  { question: 'Który z tych języków służy do stylowania stron?', options: ['SQL', 'CSS', 'Bash', 'Python'], correct: 1 },
  { question: 'W którym roku wydano Minecraft 1.0?', options: ['2009', '2010', '2011', '2013'], correct: 2 },
  { question: 'Która planeta jest największa?', options: ['Mars', 'Ziemia', 'Wenus', 'Jowisz'], correct: 3 },
  { question: 'Ile minut ma doba?', options: ['720', '1440', '1200', '2400'], correct: 1 },
  { question: 'Który pierwiastek ma symbol O?', options: ['Złoto', 'Wodór', 'Tlen', 'Żelazo'], correct: 2 },
  { question: 'Ile wynosi 2 do potęgi 8?', options: ['64', '128', '256', '512'], correct: 2 },
  { question: 'Które studio stworzyło serię Portal?', options: ['Valve', 'Mojang', 'Ubisoft', 'CD Projekt RED'], correct: 0 },
];
export function ideaPayload(idea) {
  const votes = Object.values(idea.votes ?? {});
  const yes = votes.filter(v => v === 'yes').length, no = votes.filter(v => v === 'no').length;
  const status = { pending: 'Oczekuje', accepted: 'Zaakceptowany', rejected: 'Odrzucony' }[idea.status] ?? 'Oczekuje';
  return { embeds: [new EmbedBuilder().setColor(idea.status === 'accepted' ? 0x43b581 : idea.status === 'rejected' ? 0xed4245 : 0x8b5cf6).setTitle('💡 Pomysł społeczności').setDescription(idea.text).addFields({ name: 'Autor', value: `<@${idea.authorId}>`, inline: true }, { name: 'Głosy', value: `👍 ${yes} · 👎 ${no}`, inline: true }, { name: 'Status', value: status, inline: true }).setFooter({ text: `Pomysł ${idea.id}` })], components: [new ActionRowBuilder().addComponents(...['yes','no'].map(vote => new ButtonBuilder().setCustomId(`strefa:community:idea:${idea.id}:${vote}`).setLabel(vote === 'yes' ? `Za (${yes})` : `Przeciw (${no})`).setStyle(vote === 'yes' ? ButtonStyle.Success : ButtonStyle.Danger).setDisabled(idea.status !== 'pending')))], allowedMentions: { parse: [] } };
}
export async function saveCommunitySettings({ guild, featureStore, body }) {
  if (!body || typeof body.gamesEnabled !== 'boolean' || typeof body.ideasEnabled !== 'boolean') throw new Error('Sprawdź przełączniki modułów.');
  const categoryId = body.categoryId || null, ideasChannelId = body.ideasChannelId || null;
  if (categoryId && (await guild.channels.fetch(categoryId))?.type !== ChannelType.GuildCategory) throw new Error('Wybierz kategorię Discord.');
  if (ideasChannelId) {
    const channel = await guild.channels.fetch(ideasChannelId);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Wybierz kanał tekstowy.');
    if (categoryId && channel.parentId !== categoryId) throw new Error('Kanał musi należeć do wybranej kategorii.');
    const me = guild.members.me ?? await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('Bot potrzebuje dostępu, wysyłania wiadomości i osadzania linków w kanale pomysłów.');
  }
  if (body.millionairesEnabled !== undefined && typeof body.millionairesEnabled !== 'boolean') throw new Error('Sprawdź przełącznik Milionerów.');
  const settings = { gamesEnabled: body.gamesEnabled, millionairesEnabled: body.millionairesEnabled ?? communitySettings(featureStore.snapshot(),guild.id).millionairesEnabled, ideasEnabled: body.ideasEnabled, categoryId, ideasChannelId };
  await featureStore.update(state => { communityGuild(state, guild.id).settings = settings; });
  return settings;
}
export async function decideIdea({ guild, featureStore, id, status, actorId }) {
  if (!['accepted','rejected'].includes(status)) throw new Error('Wybierz akceptację lub odrzucenie.');
  const idea = featureStore.snapshot().community?.guilds?.[guild.id]?.ideas?.find(i => i.id === id);
  if (!idea || idea.status !== 'pending') throw new Error('Pomysł nie istnieje lub został już rozpatrzony.');
  const channel = await guild.channels.fetch(idea.channelId);
  const message = await channel.messages.fetch(idea.messageId);
  await message.edit(ideaPayload({ ...idea, status }));
  await featureStore.update(state => { const item = communityGuild(state, guild.id).ideas.find(i => i.id === id); if (item?.status === 'pending') Object.assign(item, { status, decidedBy: actorId, decidedAt: new Date().toISOString() }); });
}
export function createCommunitySystem({ featureStore, guildId, now = Date.now, client }) {
  const millionaires = createMillionairesSystem({ featureStore, guildId, now, client });
  const busy = new Set();
  const privateReply = (i, text) => i.reply({ content: text, flags: MessageFlags.Ephemeral });
  async function command(i) {
    if (i.guildId !== guildId) return privateReply(i, 'Ta komenda działa na skonfigurowanym serwerze.');
    const settings = communitySettings(featureStore.snapshot(), guildId);
    if (i.commandName === 'pomysl') {
      if (!settings.ideasEnabled || !settings.ideasChannelId) return privateReply(i, 'Pomysły nie mają jeszcze skonfigurowanego kanału. Administracja ustawia go w panelu Pomysły.');
      const text = i.options.getString('tresc', true).trim();
      if (text.length < 10 || text.length > 1500) return privateReply(i, 'Opisz pomysł w 10–1500 znakach.');
      const key = `submit:${i.user.id}`;
      if (busy.has(key)) return privateReply(i, 'Twój pomysł jest właśnie wysyłany.');
      const ideas = featureStore.snapshot().community?.guilds?.[guildId]?.ideas ?? [];
      if (ideas.some(idea => idea.authorId === i.user.id && now() - Date.parse(idea.createdAt) < 60000)) return privateReply(i, 'Kolejny pomysł możesz wysłać po minucie.');
      busy.add(key);
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const idea = { id: crypto.randomBytes(6).toString('hex'), authorId: i.user.id, text, status: 'pending', votes: {}, createdAt: new Date(now()).toISOString(), channelId: settings.ideasChannelId };
        const channel = await i.guild.channels.fetch(settings.ideasChannelId);
        const sent = await channel.send(ideaPayload(idea)); idea.messageId = sent.id;
        try { await featureStore.update(state => { communityGuild(state, guildId).ideas.push(idea); }); }
        catch (error) { await sent.delete().catch(() => {}); throw error; }
        return i.editReply(`Pomysł dodany: ${sent.url}`);
      } finally { busy.delete(key); }
    }
    if (!settings.gamesEnabled) return privateReply(i, 'Zabawy są wyłączone przez administrację.');
    if (i.options.getSubcommand() === 'milionerzy') return millionaires.start(i);
    if (i.options.getSubcommand() === 'losuj') {
      const options = [...new Set(i.options.getString('opcje', true).split(',').map(s => s.trim()).filter(Boolean))];
      if (options.length < 2 || options.length > 20) return privateReply(i, 'Podaj od 2 do 20 różnych opcji oddzielonych przecinkami.');
      await i.deferReply();
      const result = options[crypto.randomInt(options.length)];
      await featureStore.update(state => { communityGuild(state, guildId).draws++; });
      return i.editReply({ content: `🎲 Wylosowano: **${result}**`, allowedMentions: { parse: [] } });
    }
    const record = { ...questions[crypto.randomInt(questions.length)], id: crypto.randomBytes(6).toString('hex'), expiresAt: now() + 300000, answers: {} };
    await i.deferReply();
    await featureStore.update(state => { const g = communityGuild(state, guildId);g.quizzes = g.quizzes.filter(q => q.expiresAt > now()).slice(-99);g.quizzes.push(record);g.quizCount = (g.quizCount ?? 0) + 1; });
    return i.editReply({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle('🧠 Quiz').setDescription(record.question).setFooter({ text: 'Masz 5 minut. Każda osoba może odpowiedzieć raz.' })], components: [new ActionRowBuilder().addComponents(...record.options.map((answer, index) => new ButtonBuilder().setCustomId(`strefa:community:quiz:${record.id}:${index}`).setLabel(answer).setStyle(ButtonStyle.Primary)))] });
  }
  async function button(i) {
    if (i.guildId !== guildId) return privateReply(i, 'Nieprawidłowy serwer.');
    if (i.customId.startsWith('strefa:community:million:')) return millionaires.button(i);
    const match = /^strefa:community:(idea|quiz):([a-f0-9]{12}):(yes|no|[0-3])$/.exec(i.customId);
    if (!match) return privateReply(i, 'Nieprawidłowy przycisk.');
    const [, type, id, choice] = match;
    if (type === 'quiz' && !/^[0-3]$/.test(choice)) return privateReply(i, 'Nieprawidłowa odpowiedź quizu.');
    if (busy.has(id)) return privateReply(i, 'Trwa aktualizacja. Spróbuj za chwilę.');
    busy.add(id);
    try {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      let feedback;
      await featureStore.update(state => {
        const g = communityGuild(state, guildId), settings = communitySettings(state, guildId);
        if (type === 'quiz') {
          const quiz = g.quizzes.find(q => q.id === id);
          if (!settings.gamesEnabled || !quiz || quiz.expiresAt <= now()) { feedback = 'Quiz zakończony lub zabawy wyłączone.'; return; }
          if (Object.hasOwn(quiz.answers, i.user.id)) { feedback = 'Już odpowiedziałeś na ten quiz.'; return; }
          quiz.answers[i.user.id] = Number(choice);
          feedback = Number(choice) === quiz.correct ? '✅ Poprawna odpowiedź!' : `❌ Poprawna odpowiedź: ${quiz.options[quiz.correct]}.`;
        } else {
          const idea = g.ideas.find(item => item.id === id);
          if (!settings.ideasEnabled || !idea || idea.status !== 'pending' || idea.messageId !== i.message.id || idea.channelId !== i.channelId || !['yes','no'].includes(choice)) { feedback = 'Ten pomysł nie przyjmuje głosów.'; return; }
          if (idea.votes[i.user.id] === choice) { feedback = 'Ten głos jest już zapisany.'; return; }
          idea.votes[i.user.id] = choice; feedback = 'Głos zapisany.';
        }
      });
      if (type === 'idea' && feedback === 'Głos zapisany.') {
        const idea = featureStore.snapshot().community.guilds[guildId].ideas.find(item => item.id === id);
        await i.message.edit(ideaPayload(idea));
      }
      return i.editReply(feedback);
    } finally { busy.delete(id); }
  }
  return { command, button, tick: millionaires.tick };
}
