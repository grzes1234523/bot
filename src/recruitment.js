import path from 'node:path';
import crypto from 'node:crypto';
import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { EligibilityError } from './store.js';
import { KeyedLock } from './lock.js';
import { FormSessions } from './form-sessions.js';
import { QUESTION_STAGES, validateStepAnswers } from './questions.js';
import { labels, panelEmbed, panelButtons, reviewEmbeds, reviewButtons, applicationModal, decisionModal, nextStepButtons, confirmDeleteButtons } from './embeds.js';

export function createRecruitmentHandlers({ client, cfg, store, featureStore, reportFailure }) {
const locks = new KeyedLock(), formSessions = new FormSessions(), deleteConfirmations = new Map();
const errorMessage = 'Nie udało się wykonać operacji. Spróbuj ponownie lub skontaktuj się z administracją.';
const appId = value => String(value ?? '').trim().toUpperCase();
function staffAllowed(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!cfg.staffRoleId) return false;
  const roles = interaction.member?.roles;
  return Boolean(roles?.cache?.has?.(cfg.staffRoleId) ||
    (Array.isArray(roles) && roles.includes(cfg.staffRoleId)) ||
    roles?.includes?.(cfg.staffRoleId));
}

async function privateAck(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
}

async function privateReply(interaction, message, components = []) {
  if (interaction.deferred || interaction.replied) return interaction.editReply({ content: message, components });
  return interaction.reply({ content: message, components, flags: MessageFlags.Ephemeral });
}

function eligibilityMessage(error) {
  if (!(error instanceof EligibilityError)) return null;
  if (error.code === 'PENDING') return `⚠️ Masz już oczekujące podanie: **${error.application.id}**.`;
  if (error.code === 'ACCEPTED') return `✅ Twoje podanie **${error.application.id}** zostało już zaakceptowane. Skontaktuj się z administracją, jeśli chcesz zgłosić się ponownie.`;
  if (error.code === 'COOLDOWN') return `⏳ Odczekaj około **${error.remainingHours} godz.** przed kolejnym podaniem. Ostatnie ID: **${error.application.id}**.`;
  return null;
}

async function reviewChannel(guild) {
  const channel = await guild?.channels.fetch(cfg.applicationChannelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('APPLICATION_CHANNEL_ID nie wskazuje kanału tekstowego dostępnego dla bota.');
  }
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new Error('Na kanale podań bot potrzebuje View Channel, Send Messages i Embed Links.');
  }
  return channel;
}

async function logEvent(guild, title, description, color = 0x5865f2) {
  if (!cfg.logChannelId) return;
  try {
    const channel = await guild?.channels.fetch(cfg.logChannelId);
    if (channel?.isTextBased() && typeof channel.send === 'function') {
      await channel.send({
        embeds: [new EmbedBuilder().setColor(color).setTitle(title)
          .setDescription(description.slice(0, 3900)).setTimestamp()],
        allowedMentions: { parse: [] },
      });
    }
  } catch (error) {
    console.warn('Nie udało się wysłać logu:', error.message);
  }
}

async function refreshReview(guild, app) {
  if (!app.reviewChannelId || !app.reviewMessageId) return;
  try {
    const channel = await guild?.channels.fetch(app.reviewChannelId);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(app.reviewMessageId);
    await message.edit({ embeds: reviewEmbeds(app), components: reviewButtons(app), allowedMentions: { parse: [] } });
  } catch (error) {
    console.warn(`Nie udało się odświeżyć podania ${app.id}:`, error.message);
  }
}

async function notifyUser(userId, message) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content: message, allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false; // kandydat mógł wyłączyć DM
  }
}

async function assignRole(guild, userId) {
  const roleId = cfg.acceptedRoleId;
  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) return { assigned: false, message: `Nie znaleziono roli o ID ${roleId}.` };
    if (role.managed) return { assigned: false, message: 'Rola jest zarządzana przez integrację.' };
    const bot = guild.members.me ?? await guild.members.fetchMe();
    if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return { assigned: false, message: 'Bot nie ma uprawnienia Zarządzanie rolami.' };
    }
    if (role.position >= bot.roles.highest.position) {
      return { assigned: false, message: 'Rola docelowa jest zbyt wysoko w hierarchii. Przesuń rolę bota ponad nią.' };
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { assigned: false, message: 'Kandydat nie należy już do serwera.' };
    if (member.roles.cache.has(roleId)) return { assigned: true, message: `Użytkownik ma już rolę <@&${roleId}>.` };
    await member.roles.add(roleId, 'Zaakceptowane podanie rekrutacyjne');
    return { assigned: true, message: `Nadano rolę <@&${roleId}>.` };
  } catch (error) {
    reportFailure('Błąd nadawania roli', error);
    return { assigned: false, message: 'Discord odrzucił nadanie roli — sprawdź uprawnienia i hierarchię.' };
  }
}

async function decide(interaction, id, status, reason = '') {
  await privateAck(interaction);
  if (!staffAllowed(interaction)) return privateReply(interaction, '⛔ Tylko administracja może rozpatrywać podania.');
  return locks.run(`application:${id}`, async () => {
    const current = store.get(id);
    if (!current) return privateReply(interaction, `Nie znaleziono podania **${id}**.`);
    if (current.status !== 'pending') {
      return privateReply(interaction, `Podanie **${id}** zostało już rozpatrzone: ${labels[current.status] ?? current.status}.`);
    }
    const roleResult = status === 'accepted' ? await assignRole(interaction.guild, current.userId) : null;
    const updated = await store.update(id, app => {
      if (app.status !== 'pending') throw new Error('Podanie rozpatrzono w trakcie operacji.');
      app.status = status;
      app.reviewerId = interaction.user.id;
      app.decisionAt = new Date().toISOString();
      app.reason = reason;
      app.roleAssigned = Boolean(roleResult?.assigned);
      app.roleAssignmentMessage = roleResult?.message ?? '';
    });
    await refreshReview(interaction.guild, updated);
    let dmText;
    if (status === 'accepted') {
      dmText = `🎉 Twoje podanie **${id}** na serwerze **${cfg.serverName}** zostało zaakceptowane!\n${roleResult.assigned ? '✅' : '⚠️'} ${roleResult.message}`;
    } else if (status === 'rejected') {
      dmText = `❌ Twoje podanie **${id}** na serwerze **${cfg.serverName}** zostało odrzucone.`;
    } else {
      dmText = `🔒 Twoje podanie **${id}** na serwerze **${cfg.serverName}** zostało zamknięte.`;
    }
    if (reason) dmText += `\nWiadomość administracji: ${reason}`;
    const dmSent = await notifyUser(updated.userId, dmText);
    await logEvent(interaction.guild, '📋 Decyzja rekrutacyjna',
      `ID: **${id}**\nKandydat: <@${updated.userId}>\nStatus: ${labels[status]}\nRozpatrujący: <@${interaction.user.id}>\nRola: ${roleResult?.message ?? 'nie dotyczy'}\nPowód: ${reason || '—'}\nDM: ${dmSent ? 'wysłana' : 'niedostarczona'}`,
      status === 'accepted' ? 0x43b581 : status === 'rejected' ? 0xed4245 : 0x747f8d);
    return privateReply(interaction,
      `✅ Podanie **${id}**: ${labels[status]}. ${dmSent ? 'Kandydat otrzymał DM.' : 'DM nie dotarła.'}` +
      (roleResult ? `\n${roleResult.assigned ? '✅' : '⚠️'} ${roleResult.message}` : ''));
  });
}

async function submit(interaction, answers, expanded = true) {
  await privateAck(interaction);
  return locks.run(`user:${interaction.user.id}`, async () => {
    try {
      store.eligibility(interaction.user.id, cfg.cooldownHours);
    } catch (error) {
      const message = eligibilityMessage(error);
      if (message) return privateReply(interaction, message);
      throw error;
    }
    let channel;
    try {
      channel = await reviewChannel(interaction.guild);
    } catch (error) {
      reportFailure('Konfiguracja kanału podań', error);
      return privateReply(interaction, `❌ Podanie nie może zostać wysłane: ${error.message}`);
    }
    const id = crypto.randomBytes(5).toString('hex').toUpperCase();
    const app = {
      guildId: interaction.guildId,
      id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      position: answers.position,
      experience: answers.experience,
      availability: answers.availability,
      motivation: answers.motivation,
      scenario: answers.scenario,
      ...(expanded ? { answers } : {}),
      status: 'pending',
      createdAt: new Date().toISOString(),
      reviewChannelId: channel.id,
      reviewMessageId: null,
      reviewerId: null,
      decisionAt: null,
      reason: '',
    };
    try {
      await store.create(app, cfg.cooldownHours);
    } catch (error) {
      const message = eligibilityMessage(error);
      if (message) return privateReply(interaction, message);
      throw error;
    }
    let message;
    try {
      message = await channel.send({
        content: cfg.staffRoleId ? `<@&${cfg.staffRoleId}> • Nowe podanie do rozpatrzenia` : '📨 Nowe podanie do rozpatrzenia',
        embeds: reviewEmbeds(app), components: reviewButtons(app),
        allowedMentions: cfg.staffRoleId ? { roles: [cfg.staffRoleId] } : { parse: [] },
      });
    } catch (error) {
      reportFailure('Nie udało się wysłać podania na kanał', error);
      await store.removeUnsent(id).catch(cleanupError => reportFailure('Błąd cofania podania', cleanupError));
      return privateReply(interaction, '❌ Nie udało się opublikować podania. Sprawdź uprawnienia bota i spróbuj ponownie.');
    }
    await store.update(id, value => { value.reviewMessageId = message.id; });
    await logEvent(interaction.guild, '📨 Nowe podanie', `ID: **${id}**\nKandydat: <@${app.userId}>\nStanowisko: ${app.position}`);
    return privateReply(interaction, `✅ Twoje podanie wysłano do administracji!\n**ID: \`${id}\`**\nStatus sprawdzisz komendą **/rekrutacja-status** lub **/rekrutacja-moje**.`);
  });
}

function cleanupAllowed(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

async function prepareDelete(interaction) {
  if (!cleanupAllowed(interaction)) {
    return privateReply(interaction, '⛔ Usuwanie zgłoszeń wymaga uprawnienia **Zarządzanie serwerem** lub Administrator.');
  }
  const isSingle = interaction.commandName === 'rekrutacja-usun';
  const id = isSingle ? appId(interaction.options.getString('id', true)) : null;
  const status = isSingle ? 'all' : (interaction.options.getString('status') ?? 'all');
  const removeMessages = (interaction.options.getBoolean(isSingle ? 'wiadomosc' : 'wiadomosci') ?? true);
  const finished = new Set(['accepted', 'rejected', 'closed']);
  const targets = store.list().filter(app => finished.has(app.status) &&
    (!id || app.id === id) && (status === 'all' || app.status === status));
  if (!targets.length) {
    const existing = id ? store.get(id) : null;
    if (existing?.status === 'pending') return privateReply(interaction, '⛔ Tego podania nie można usunąć — nadal oczekuje na rozpatrzenie.');
    return privateReply(interaction, 'Nie znaleziono zakończonych podań spełniających kryteria.');
  }
  // Potwierdzenie: token jest unikalny, przypisany do konta i wygasa po 120 sekundach.
  for (const [oldToken, item] of deleteConfirmations) {
    if (item.expiresAt < Date.now()) deleteConfirmations.delete(oldToken);
  }
  const token = crypto.randomBytes(12).toString('hex');
  deleteConfirmations.set(token, {
    userId: interaction.user.id, id, status, removeMessages, expiresAt: Date.now() + 120000,
  });
  const desc = id ? `podanie **${id}**` : `**${targets.length}** zakończonych podań (filtr: ${status})`;
  return privateReply(interaction,
    `🗑️ Czy na pewno usunąć ${desc}?\n` +
    `• Podania oczekujące **nigdy nie będą usuwane**.\n` +
    `• Wiadomości na kanale rekrutacji: **${removeMessages ? 'usuń' : 'zachowaj'}**.\n` +
    '• Przed usunięciem powstanie kopia bazy w `data/backups/`.\n' +
    '• Przyznane wcześniej role **pozostaną**.\n' +
    '⏳ Potwierdzenie wygasa za 2 minuty.',
    confirmDeleteButtons(token));
}

async function deleteReviewMessages(guild, deleted) {
  let removed = 0;
  let failed = 0;
  for (const app of deleted) {
    if (!app.reviewChannelId || !app.reviewMessageId) continue;
    try {
      const channel = await guild.channels.fetch(app.reviewChannelId);
      if (!channel?.isTextBased() || !channel.messages?.fetch) throw new Error('Nie można otworzyć kanału.');
      const message = await channel.messages.fetch(app.reviewMessageId);
      await message.delete();
      removed++;
    } catch (error) {
      console.warn(`Nie udało się usunąć wiadomości ${app.reviewMessageId} (${app.id}):`, error.message);
      failed++;
    }
  }
  return { removed, failed };
}

async function confirmDelete(interaction, action, token) {
  const confirmation = deleteConfirmations.get(token);
  if (!confirmation || confirmation.userId !== interaction.user.id || confirmation.expiresAt < Date.now()) {
    return privateReply(interaction, '⌛ Potwierdzenie nie istnieje lub wygasło. Wpisz komendę ponownie.');
  }
  if (!cleanupAllowed(interaction)) {
    return privateReply(interaction, '⛔ Nie masz uprawnień do usuwania.');
  }
  deleteConfirmations.delete(token);
  if (action === 'cancel') {
    return interaction.update({ content: '✅ Anulowano usuwanie — nie zmieniono żadnych podań.', components: [] });
  }
  await interaction.update({ content: '⌛ Usuwam zakończone podania oraz tworzę kopię bezpieczeństwa...', components: [] });
  // Transakcja bazy gwarantuje, że nawet przy rozpatrywaniu na bieżąco nie usunie pending.
  const { deleted, backupPath } = await locks.run('cleanup', () => store.deleteFinished(confirmation));
  const messages = confirmation.removeMessages
    ? await deleteReviewMessages(interaction.guild, deleted)
    : { removed: 0, failed: 0 };
  await logEvent(interaction.guild, '🗑️ Czyszczenie zakończonych podań',
    `Moderator: <@${interaction.user.id}>\nUsunięte: **${deleted.length}**\nWiadomości usunięte: **${messages.removed}**\nBłędy usuwania wiadomości: **${messages.failed}**\nKopia bazy: **${backupPath ? 'utworzona' : 'bez zmian'}**`);
  return interaction.editReply({ content:
    `✅ Usunięto **${deleted.length}** zakończonych podań. Oczekujące pozostały nietknięte.\n` +
    `💾 Kopia: ${backupPath ? `\`${path.relative(process.cwd(), backupPath)}\`` : 'niepotrzebna'}\n` +
    `🧹 Wiadomości z kanału: **${messages.removed}** usuniętych, **${messages.failed}** nieusuniętych.\n` +
    'Nadane role użytkowników nie zostały zmienione.' });
}

async function handleCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'rekrutacja-ustaw') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return privateReply(interaction, 'Wymagane uprawnienie Zarządzanie serwerem.');
    await privateAck(interaction);
    const channel = interaction.options.getChannel('kanal', true), role = interaction.options.getRole('rola', true);
    const staff = interaction.options.getRole('obsluga'), logs = interaction.options.getChannel('logi');
    const bot = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    const channelPermission = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory];
    if (channel.guildId !== interaction.guildId || !channel.permissionsFor(bot)?.has(channelPermission) || (logs && (logs.guildId !== interaction.guildId || !logs.permissionsFor(bot)?.has(channelPermission)))) return privateReply(interaction, 'Bot potrzebuje dostępu do kanałów, wysyłania wiadomości, linków i historii.');
    if (role.guild.id !== interaction.guildId || role.managed || role.id === interaction.guildId || !role.editable) return privateReply(interaction, 'Wybierz rolę, którą bot może nadawać (poniżej roli bota).');
    if (staff && (staff.guild.id !== interaction.guildId || staff.id === interaction.guildId || staff.managed)) return privateReply(interaction, 'Wybierz dostępną rolę obsługi inną niż @everyone.');
    await featureStore.update(state => { state.recruitment = { ...(state.recruitment ?? {}), applicationChannelId: channel.id, acceptedRoleId: role.id, staffRoleId: staff?.id ?? null, logChannelId: logs?.id ?? null }; });
    return privateReply(interaction, 'Zapisano rekrutację tego serwera. Użyj /rekrutacja-panel, aby opublikować formularz.');
  }
  if (name === 'rekrutacja-pomoc') {
    return privateReply(interaction, '📋 **Rekrutacja**\n• Kliknij **Złóż podanie** na panelu.\n• Wypełnij 15 pytań w 3 etapach; między etapami klikaj przycisk Dalej.\n• Formularz wygasa po 30 minutach.\n• **/rekrutacja-status** — ostatnie podanie.\n• **/rekrutacja-moje** — Twoja historia.\n• Administracja rozpatruje podania przyciskami, a kierownik serwera może usuwać zakończone przez **/rekrutacja-usun** lub **/rekrutacja-wyczysc**.');
  }
  if (name === 'rekrutacja-status') {
    const id = appId(interaction.options.getString('id'));
    const app = id ? store.get(id) : store.latestByUser(interaction.user.id);
    if (!app) return privateReply(interaction, 'Nie znaleziono podania.');
    if (app.userId !== interaction.user.id && !staffAllowed(interaction)) {
      return privateReply(interaction, '⛔ Możesz sprawdzać tylko własne podania.');
    }
    return privateReply(interaction, `📋 **${app.id}** — ${labels[app.status] ?? app.status}\nStanowisko: ${app.position || '—'}\n${app.reason ? `Wiadomość: ${app.reason}` : 'Brak dodatkowych uwag.'}`);
  }
  if (name === 'rekrutacja-moje') {
    const list = store.list().filter(app => app.userId === interaction.user.id).slice(0, 10);
    if (!list.length) return privateReply(interaction, 'Nie składałeś jeszcze żadnego podania.');
    return privateReply(interaction, `📁 **Twoje ostatnie podania:**\n${list.map(a => `• **${a.id}** — ${labels[a.status] ?? a.status} — ${a.position || '—'}`).join('\n')}`);
  }
  if (!staffAllowed(interaction)) return privateReply(interaction, '⛔ Ta komenda jest przeznaczona dla administracji.');

  if (name === 'rekrutacja-usun' || name === 'rekrutacja-wyczysc') {
    return prepareDelete(interaction);
  }
  if (name === 'rekrutacja-panel') {
    await privateAck(interaction);
    const channel = interaction.channel;
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return privateReply(interaction, 'Nie mogę opublikować panelu na tym kanale.');
    }
    const message = await channel.send({ embeds: [panelEmbed(cfg.serverName)], components: panelButtons(), allowedMentions: { parse: [] } });
    return privateReply(interaction, `✅ Panel rekrutacyjny opublikowano: ${message.url}`);
  }
  if (name === 'rekrutacja-akceptuj') {
    return decide(interaction, appId(interaction.options.getString('id', true)), 'accepted', interaction.options.getString('uwagi') ?? '');
  }
  if (name === 'rekrutacja-odrzuc') {
    return decide(interaction, appId(interaction.options.getString('id', true)), 'rejected', interaction.options.getString('powod', true));
  }
  if (name === 'rekrutacja-zamknij') {
    return decide(interaction, appId(interaction.options.getString('id', true)), 'closed', interaction.options.getString('powod') ?? '');
  }
  if (name === 'rekrutacja-lista') {
    const status = interaction.options.getString('status') ?? 'pending';
    const list = store.list().filter(a => status === 'all' || a.status === status).slice(0, 15);
    if (!list.length) return privateReply(interaction, 'Brak podań dla wybranego filtra.');
    return privateReply(interaction, `📁 **Podania (${status}), ostatnie ${list.length}:**\n${list.map(a => `• **${a.id}** — <@${a.userId}> — ${labels[a.status] ?? a.status} — ${(a.position || '—').slice(0, 70)}`).join('\n')}`);
  }
  if (name === 'rekrutacja-statystyki') {
    const applications = store.list();
    const count = status => applications.filter(a => a.status === status).length;
    return privateReply(interaction, `📊 **Statystyki rekrutacji**\nRazem: **${applications.length}**\n🟡 Oczekujące: **${count('pending')}**\n🟢 Zaakceptowane: **${count('accepted')}**\n🔴 Odrzucone: **${count('rejected')}**\n⚪ Zamknięte: **${count('closed')}**`);
  }
  return privateReply(interaction, 'Nieznana komenda. Uruchom `npm run deploy` i spróbuj ponownie.');
}

async function handleButton(interaction) {
  const id = interaction.customId;
  if (id === 'recruitment:apply') {
    try {
      store.eligibility(interaction.user.id, cfg.cooldownHours);
    } catch (error) {
      const msg = eligibilityMessage(error);
      if (msg) return privateReply(interaction, msg);
      throw error;
    }
    const session = formSessions.start(interaction.user.id);
    return interaction.showModal(applicationModal(1, session.token));
  }
  const next = /^recruitment:form-next:([23]):([a-f0-9]{18})$/.exec(id);
  if (next) {
    const step = Number(next[1]);
    const token = next[2];
    if (!formSessions.get(interaction.user.id, token, step)) {
      return privateReply(interaction, '⌛ Formularz wygasł lub ten etap został już uzupełniony. Zacznij ponownie od przycisku **Złóż podanie**.');
    }
    try { store.eligibility(interaction.user.id, cfg.cooldownHours); }
    catch (error) { return privateReply(interaction, eligibilityMessage(error) || errorMessage); }
    return interaction.showModal(applicationModal(step, token));
  }
  const deletion = /^recruitment:delete:(confirm|cancel):([a-f0-9]{24})$/.exec(id);
  if (deletion) return confirmDelete(interaction, deletion[1], deletion[2]);
  const match = /^recruitment:(accept|reject|close):([A-F0-9]{8,16})$/.exec(id);
  if (!match) return;
  const [, action, applicationId] = match;
  if (!staffAllowed(interaction)) return privateReply(interaction, '⛔ Brak uprawnień administracyjnych.');
  const app = store.get(applicationId);
  if (!app) return privateReply(interaction, 'Nie znaleziono podania.');
  if (app.status !== 'pending') return privateReply(interaction, `Podanie zostało już rozpatrzone: ${labels[app.status] ?? app.status}.`);
  if (action === 'accept') return decide(interaction, applicationId, 'accepted');
  // Modal musi zostać pokazany jako pierwsza odpowiedź (bez defer).
  return interaction.showModal(decisionModal(action, applicationId));
}

async function handleModal(interaction) {
  if (interaction.customId === 'recruitment:application-modal') {
    // Kompatybilność ze starymi panelami 2.0 wyświetlającymi 5 pytań.
    const legacy = Object.fromEntries(['position', 'experience', 'availability', 'motivation', 'scenario']
      .map(key => [key, interaction.fields.getTextInputValue(key).trim()]));
    return submit(interaction, legacy, false);
  }
  const staged = /^recruitment:form:([123]):([a-f0-9]{18})$/.exec(interaction.customId);
  if (staged) {
    const step = Number(staged[1]);
    const token = staged[2];
    await privateAck(interaction);
    return locks.run(`form:${interaction.user.id}`, async () => {
      if (!formSessions.get(interaction.user.id, token, step)) {
        return privateReply(interaction, '⌛ Ten formularz jest nieaktualny lub wygasł. Wróć do panelu i zacznij od nowa.');
      }
      let validated;
      try {
        const raw = Object.fromEntries(QUESTION_STAGES[step - 1].questions.map(q => {
          try { return [q.key, interaction.fields.getTextInputValue(q.key)]; }
          catch (error) {
            if (q.required === false) return [q.key, ''];
            throw error;
          }
        }));
        validated = validateStepAnswers(step, raw);
      } catch (error) { return privateReply(interaction, `❌ ${error.message} Otwórz etap ponownie, jeśli nadal jest dostępny.`); }
      const session = formSessions.advance(interaction.user.id, token, step, validated);
      if (!session) return privateReply(interaction, 'Formularz utracił ważność.');
      if (step < 3) {
        return privateReply(interaction, `✅ Zapisano etap **${step}/3**. Kliknij poniżej, aby otworzyć kolejny formularz:`, nextStepButtons(step + 1, token));
      }
      try { return await submit(interaction, session.answers, true); }
      finally { formSessions.clear(interaction.user.id, token); }
    });
  }
  const match = /^recruitment:(reject|close)-modal:([A-F0-9]{8,16})$/.exec(interaction.customId);
  if (!match) return;
  const [, action, id] = match;
  if (!staffAllowed(interaction)) return privateReply(interaction, '⛔ Brak uprawnień.');
  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (action === 'reject' && reason.length < 2) return privateReply(interaction, 'Podaj powód odrzucenia.');
  return decide(interaction, id, action === 'reject' ? 'rejected' : 'closed', reason);
}

async function recoverUnsent(guild) {
  // Wznawia zgłoszenia, które zostały zapisane, ale ich wiadomość nie ma zapisanego ID.
  const lost = store.list().filter(a => a.status === 'pending' && !a.reviewMessageId);
  if (!lost.length) return;
  let channel;
  try { channel = await reviewChannel(guild); }
  catch (error) { reportFailure('Nie udało się odzyskać niezapisanych wiadomości', error); return; }
  for (const app of lost) {
    try {
      const sent = await channel.send({
        content: `🔄 Odtworzone podanie **${app.id}**`,
        embeds: reviewEmbeds(app), components: reviewButtons(app), allowedMentions: { parse: [] },
      });
      await store.update(app.id, draft => { draft.reviewMessageId = sent.id; draft.reviewChannelId = channel.id; });
      console.log(`Odtworzono podanie ${app.id}`);
    } catch (error) { reportFailure(`Błąd odtwarzania ${app.id}`, error); }
  }
}


return { command: handleCommand, button: handleButton, modal: handleModal, recoverUnsent };
}
