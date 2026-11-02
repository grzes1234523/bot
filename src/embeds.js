import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { QUESTION_STAGES } from './questions.js';

export const labels = {
  pending: '🟡 Oczekuje',
  accepted: '🟢 Zaakceptowane',
  rejected: '🔴 Odrzucone',
  closed: '⚪ Zamknięte',
};

export function panelEmbed(serverName) {
  return new EmbedBuilder().setColor(0x5865f2)
    .setTitle(`📋 Rekrutacja — ${serverName}`)
    .setDescription([
      'Chcesz dołączyć do administracji naszego serwera?',
      '',
      '📨 Kliknij **Złóż podanie** — odpowiedz na **15 pytań w 3 etapach**.',
      '➡️ Po każdym etapie otrzymasz prywatny przycisk do kolejnego formularza.',
      '🔒 Odpowiedzi zobaczy tylko zespół mający dostęp do kanału rekrutacji.',
      '',
      '🛡️ Szukamy osób odpowiedzialnych, uczciwych i zaangażowanych.',
      '📬 Wynik rekrutacji otrzymasz w DM, jeśli masz je odblokowane.',
      '⚠️ Możesz mieć tylko jedno oczekujące podanie. Na ukończenie formularza masz 30 minut.',
    ].join('\n'))
    .setFooter({ text: `${serverName} • System rekrutacji` });
}

export function panelButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('recruitment:apply').setLabel('Złóż podanie').setEmoji('📨').setStyle(ButtonStyle.Primary),
  )];
}

export function reviewEmbeds(app) {
  const color = { pending: 0x5865f2, accepted: 0x43b581, rejected: 0xed4245, closed: 0x747f8d }[app.status] ?? 0x5865f2;
  const first = new EmbedBuilder().setColor(color).setTitle(`📨 Podanie • ${app.id}`)
    .setDescription(`**Kandydat:** <@${app.userId}> (\`${String(app.userTag ?? app.userId).slice(0, 80)}\`)\n**Status:** ${labels[app.status] ?? app.status}`);
  const timestamp = Date.parse(app.createdAt ?? '');
  const stages = app.answers && typeof app.answers === 'object'
    ? QUESTION_STAGES
    : [{ title: 'Podstawowe informacje (stary formularz)', questions: [...QUESTION_STAGES[0].questions.filter(q => q.key !== 'age'), QUESTION_STAGES[1].questions.find(q => q.key === 'scenario')] }];
  const result = [];
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index];
    const embed = index === 0 ? first : new EmbedBuilder().setColor(color).setTitle(`📝 ${stage.title}`);
    if (index === 0 && stages.length > 1) embed.addFields({ name: 'Etap', value: stage.title });
    for (const question of stage.questions) {
      // Starsze rekordy zachowują pola główne, nowe odpowiedzi znajdują się w answers.
      const raw = app.answers ? app.answers[question.key] : app[question.key];
      const value = String(raw ?? '').trim().slice(0, 500) || '—';
      embed.addFields({ name: question.label, value });
    }
    if (index === 0) {
      if (Number.isFinite(timestamp)) embed.addFields({ name: 'Wysłano', value: `<t:${Math.floor(timestamp / 1000)}:F>`, inline: true });
      if (app.reviewerId) embed.addFields({ name: 'Rozpatrzył(a)', value: `<@${app.reviewerId}>`, inline: true });
      if (app.reason) embed.addFields({ name: 'Decyzja / powód', value: String(app.reason).slice(0, 500) });
      if (app.status === 'accepted') embed.addFields({ name: 'Nadanie roli', value: String(app.roleAssignmentMessage || 'Brak danych').slice(0, 300) });
    }
    embed.setFooter({ text: `Podanie ${app.id} • Kandydat ${app.userId} • ${index + 1}/${stages.length}` });
    result.push(embed);
  }
  return result;
}

export function reviewButtons(app) {
  if (app.status !== 'pending') return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`recruitment:accept:${app.id}`).setLabel('Akceptuj').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`recruitment:reject:${app.id}`).setLabel('Odrzuć').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`recruitment:close:${app.id}`).setLabel('Zamknij').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  )];
}

export function applicationModal(step, token) {
  const stage = QUESTION_STAGES[step - 1];
  if (!stage) throw new Error('Nieprawidłowy numer etapu.');
  const modal = new ModalBuilder().setCustomId(`recruitment:form:${step}:${token}`)
    .setTitle(stage.title);
  for (const q of stage.questions) {
    const input = new TextInputBuilder().setCustomId(q.key).setLabel(q.label)
      .setPlaceholder(q.placeholder).setStyle(q.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(q.required !== false).setMaxLength(q.max);
    if (q.min > 0) input.setMinLength(q.min);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

export function nextStepButtons(step, token) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`recruitment:form-next:${step}:${token}`)
      .setLabel(`Otwórz etap ${step}/3`).setEmoji('➡️').setStyle(ButtonStyle.Primary),
  )];
}

export function confirmDeleteButtons(token) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`recruitment:delete:confirm:${token}`).setLabel('Potwierdź usunięcie').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`recruitment:delete:cancel:${token}`).setLabel('Anuluj').setStyle(ButtonStyle.Secondary),
  )];
}

export function decisionModal(action, id) {
  const title = action === 'reject' ? 'Odrzucenie podania' : 'Zamknięcie podania';
  return new ModalBuilder().setCustomId(`recruitment:${action}-modal:${id}`).setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Powód / wiadomość dla kandydata')
        .setPlaceholder('Napisz krótką, kulturalną wiadomość.').setStyle(TextInputStyle.Paragraph)
        .setRequired(action === 'reject').setMinLength(action === 'reject' ? 2 : 0).setMaxLength(700),
    ));
}
