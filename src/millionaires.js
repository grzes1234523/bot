import crypto from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { millionaireQuestions } from './millionaires-questions.js';

export const millionairePrizes = [500,1000,2000,5000,10000,20000,40000,75000,125000,250000,500000,1000000];
const timeoutMs = 5 * 60 * 1000;
const letters = ['A','B','C','D'];
const format = amount => `${amount.toLocaleString('pl-PL')} pkt`;
const shuffle = items => {
  const result = [...items];
  for (let n = result.length - 1; n > 0; n--) { const j = crypto.randomInt(n + 1); [result[n],result[j]] = [result[j],result[n]]; }
  return result;
};
function questionCopy(question) {
  const order = shuffle([0,1,2,3]);
  return { ...question, options: order.map(index => question.options[index]), correct: order.indexOf(question.correct) };
}
function gameList(state, guildId) {
  state.community ??= { guilds: {} }; state.community.guilds ??= {};
  const guild = state.community.guilds[guildId] ??= {};
  return guild.millionaires ??= [];
}
function enabled(state, guildId) {
  const settings = state.community?.guilds?.[guildId]?.settings;
  return settings?.gamesEnabled !== false && settings?.millionairesEnabled !== false;
}
function finish(game, status, now) {
  game.status = status; game.finishedAt = now; game.revision++;
  game.prize = status === 'won' ? millionairePrizes.at(-1) : status === 'quit' ? (millionairePrizes[game.step - 1] ?? 0) : game.guaranteed;
}
export function millionaireSummary(state, guildId) {
  const games = state.community?.guilds?.[guildId]?.millionaires ?? [];
  return { played: state.community?.guilds?.[guildId]?.millionairesPlayed ?? games.length, active: games.filter(game => game.status === 'active').length, wins: state.community?.guilds?.[guildId]?.millionairesWins ?? games.filter(game => game.status === 'won').length };
}
export function millionairePayload(game) {
  const active = game.status === 'active', question = game.questions[game.step];
  const embed = new EmbedBuilder().setColor(active ? 0x8b5cf6 : game.status === 'won' ? 0xfbbf24 : 0x5865f2)
    .setTitle('💎 Milionerzy').setFooter({ text: 'Punkty tej gry nie zmieniają portfela ekonomii serwera.' });
  if (!active) {
    const title = { won: '🏆 Milion punktów! Gratulacje!', lost: '❌ Błędna odpowiedź.', quit: '💰 Gra zakończona na Twoje życzenie.', expired: '⌛ Upłynął czas na odpowiedź.' }[game.status];
    embed.setDescription(`${title}\nGracz: <@${game.userId}>\nWygrana: **${format(game.prize)}**\nPoprawnych odpowiedzi: **${game.step}/12**${game.status === 'lost' ? `\nPoprawna odpowiedź: **${letters[question.correct]}. ${question.options[question.correct]}**` : ''}`);
    return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
  }
  embed.setDescription(`Gracz: <@${game.userId}>\n**Pytanie ${game.step + 1}/12 za ${format(millionairePrizes[game.step])}**\n\n${question.question}\n\n${question.options.map((answer,index) => game.hidden.includes(index) ? `~~${letters[index]}. —~~` : `**${letters[index]}.** ${answer}`).join('\n')}`)
    .addFields({ name: 'Zebrane punkty', value: format(millionairePrizes[game.step - 1] ?? 0), inline: true }, { name: 'Gwarantowane', value: format(game.guaranteed), inline: true }, { name: 'Czas na odpowiedź', value: `<t:${Math.floor(game.expiresAt/1000)}:R>`, inline: true });
  const button = (action,label,style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`strefa:community:million:${game.id}:${game.revision}:${action}`).setLabel(label).setStyle(style);
  return { embeds: [embed], components: [
    new ActionRowBuilder().addComponents(...letters.map((letter,index) => button(String(index),letter,ButtonStyle.Primary).setDisabled(game.hidden.includes(index)))),
    new ActionRowBuilder().addComponents(button('half','50:50').setDisabled(game.usedHalf), button('swap','Zmień pytanie').setDisabled(game.usedSwap), button('quit','Zakończ i zabierz punkty',ButtonStyle.Danger)),
  ], allowedMentions: { parse: [] } };
}

export function createMillionairesSystem({ featureStore, guildId, now = Date.now, client }) {
  const busy = new Set();
  const reply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  async function start(i) {
    if (i.guildId !== guildId || !enabled(featureStore.snapshot(),guildId)) return reply(i,'Milionerzy są wyłączeni na tym serwerze.');
    const game = { id: crypto.randomBytes(6).toString('hex'), userId: i.user.id, channelId: i.channelId, messageId: null, step: 0, revision: 0, hidden: [], usedHalf: false, usedSwap: false, guaranteed: 0, prize: 0, status: 'active', createdAt: now(), expiresAt: now() + timeoutMs,
      questions: [0,1,2].flatMap(difficulty => shuffle(millionaireQuestions.filter(q => q.difficulty === difficulty)).slice(0,4).map(questionCopy)),
    };
    await i.deferReply();
    const error = await featureStore.update(state => {
      const games = gameList(state,guildId);
      if (!enabled(state,guildId)) return 'Milionerzy są wyłączeni na tym serwerze.';
      if (games.some(previous => previous.userId === i.user.id && previous.status === 'active' && previous.expiresAt > now())) return 'Masz już aktywną grę. Dokończ ją lub użyj przycisku Zakończ.';
      if (games.filter(previous => previous.status === 'active' && previous.expiresAt > now()).length >= 50) return 'Na serwerze trwa już 50 gier. Spróbuj ponownie później.';
      const g = state.community.guilds[guildId];
      g.millionaires = [...games.filter(previous => previous.status !== 'active').slice(-199), ...games.filter(previous => previous.status === 'active'), game];
      g.millionairesPlayed = (g.millionairesPlayed ?? 0) + 1;
      return null;
    });
    if (error) return i.editReply({ content: error });
    try {
      const sent = await i.editReply(millionairePayload(game));
      await featureStore.update(state => { const current = gameList(state,guildId).find(item => item.id === game.id); if (current) current.messageId = sent.id; });
    } catch (error) {
      await featureStore.update(state => { const current = gameList(state,guildId).find(item => item.id === game.id); if (current?.status === 'active') finish(current,'expired',now()); });
      throw error;
    }
  }
  async function button(i) {
    if (i.guildId !== guildId) return reply(i,'Nieprawidłowy serwer.');
    const match = /^strefa:community:million:([a-f0-9]{12}):(\d{1,3}):([0-3]|half|swap|quit)$/.exec(i.customId);
    if (!match) return reply(i,'Nieprawidłowy przycisk gry.');
    const [,id,revision,action] = match;
    const before = featureStore.snapshot().community?.guilds?.[guildId]?.millionaires?.find(item => item.id === id);
    if (!before || before.userId !== i.user.id || before.channelId !== i.channelId || before.messageId !== i.message.id) return reply(i,'Te przyciski należą do gry innego gracza lub innej wiadomości.');
    if (busy.has(id)) return reply(i,'Odpowiedź jest zapisywana. Poczekaj chwilę.');
    busy.add(id);
    try {
      await i.deferUpdate();
      const result = await featureStore.update(state => {
        const game = gameList(state,guildId).find(item => item.id === id);
        if (!enabled(state,guildId)) return { error: 'Milionerzy są wyłączeni na tym serwerze.' };
        if (!game || game.status !== 'active' || game.revision !== Number(revision)) return { error: 'Ten przycisk jest już nieaktualny. Użyj najnowszego pytania.' };
        if (game.expiresAt <= now()) { finish(game,'expired',now()); return { game }; }
        if (action === 'quit') { finish(game,'quit',now()); return { game }; }
        const question = game.questions[game.step];
        if (action === 'half') {
          if (game.usedHalf) return { error: 'Koło 50:50 zostało już wykorzystane.' };
          game.usedHalf = true; game.hidden = shuffle([0,1,2,3].filter(index => index !== question.correct)).slice(0,2);
        } else if (action === 'swap') {
          if (game.usedSwap) return { error: 'Zmiana pytania została już wykorzystana.' };
          const alternatives = millionaireQuestions.filter(q => q.difficulty === question.difficulty && !game.questions.some(used => used.id === q.id));
          game.usedSwap = true; game.questions[game.step] = questionCopy(alternatives[crypto.randomInt(alternatives.length)]);
          game.hidden = [];
          if (game.usedHalf && before.hidden.length) game.hidden = shuffle([0,1,2,3].filter(index => index !== game.questions[game.step].correct)).slice(0,2);
        } else {
          const answer = Number(action);
          if (game.hidden.includes(answer)) return { error: 'Ta odpowiedź została odrzucona przez koło 50:50.' };
          if (answer !== question.correct) { finish(game,'lost',now()); return { game }; }
          game.step++; game.hidden = [];
          if (game.step === 2) game.guaranteed = 1000;
          if (game.step === 7) game.guaranteed = 40000;
          if (game.step === 12) { finish(game,'won',now()); const g = state.community.guilds[guildId]; g.millionairesWins = (g.millionairesWins ?? 0) + 1; return { game }; }
        }
        game.revision++; game.expiresAt = now() + timeoutMs;
        return { game };
      });
      if (result.error) return i.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
      await i.editReply(millionairePayload(result.game));
    } finally { busy.delete(id); }
  }
  async function tick() {
    const games = featureStore.snapshot().community?.guilds?.[guildId]?.millionaires ?? [];
    for (const previous of games.filter(game => game.status === 'active' && game.expiresAt <= now())) {
      const game = await featureStore.update(state => {
        const current = gameList(state,guildId).find(item => item.id === previous.id);
        if (!current || current.status !== 'active' || current.expiresAt > now()) return null;
        finish(current,'expired',now()); return current;
      });
      if (game?.messageId && client) {
        try { const channel = await client.channels.fetch(game.channelId); const message = await channel.messages.fetch(game.messageId); await message.edit(millionairePayload(game)); }
        catch (error) { console.warn('Nie udało się odświeżyć zakończonej gry Milionerzy:', error.message); }
      }
    }
  }
  return { start, button, tick };
}
