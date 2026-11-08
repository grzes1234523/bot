import path from 'node:path';
import {
  Client, Events, GatewayIntentBits, MessageFlags,
} from 'discord.js';
import { readConfig } from './config.js';
import { registerGuildCommands } from './command-registration.js';
import { startPanelServer } from './panel-server.js';
import { ApplicationStore } from './store.js';
import { FeatureStore } from './feature-store.js';
import { isFeatureCommand, featureCommands } from './features.js';
import { createGuildRuntimes } from './guild-runtime.js';
import { createGuildApplicationStores } from './guild-applications.js';
import { recruitmentCommands } from './commands.js';
import { createProSystem, isProCommand, proCommands } from './pro-system.js';
import { closeDatabase, databaseEnabled } from './database.js';
import { BotStatusReporter, sanitizeDiagnostic } from './status-reporter.js';
import { WorkerStatus } from './worker-status.js';
import { withTimeout } from './async-operation.js';
import { levelCommands } from './levels.js';
import { changelogCommands, handleChangelogCommand } from './changelog.js';
import { welcomeCommands, farewellCommands } from './welcome.js';
import { communityCommands } from './community.js';
import { createServerBuilderSystem, serverBuilderCommands } from './server-builder.js';
const cfg = readConfig();
const dataDirectory = process.env.STREFA_BOT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const store = new ApplicationStore(path.join(dataDirectory, 'applications.json'));
await store.init();
const featureStore = new FeatureStore(path.join(dataDirectory, 'features.json'));
await featureStore.init();
const applicationStores = createGuildApplicationStores({ primaryStore: store, primaryGuildId: cfg.guildId, dataDirectory });
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildModeration,
] });
const statusReporter = new BotStatusReporter({ client, cfg, getChannelId:()=>featureStore.snapshot().botStatusChannelId });
const workerStatus = new WorkerStatus(cfg);
const runtimes = createGuildRuntimes({ client, cfg, applicationStore: store, applicationStores, reportFailure, featureStore });
const featureHandlers = runtimes.features;
const proSystem = createProSystem({ client, featureStore, cfg });
const serverBuilder = createServerBuilderSystem({ client });
const levelSystem = runtimes.levels;
const welcomeSystem = runtimes.welcome;
const farewellSystem = runtimes.farewell;
const communitySystem = runtimes.community;
const panelServer = startPanelServer({ client, getApplications: () => store.list(), getGuildApplications: async id => { const apps = await applicationStores.get(id); await apps.refresh(); return apps.list(); }, featureStore });
const shutdownTimers = new Set();
let shutdownPromise;

const errorMessage = '❌ Nie udało się wykonać operacji. Spróbuj ponownie lub skontaktuj się z administracją.';

function reportFailure(context, error) {
  console.error(`${context}:`, sanitizeDiagnostic(error, [cfg.token]));
  void statusReporter.reportError(context, error);
}

const workerStatuses = new Map([[cfg.guildId, workerStatus]]);
function publishWorkerStatus(ready = client.isReady()) {
  if (shutdownPromise) return Promise.resolve(false);
  for (const id of client.guilds.cache.keys()) if (!workerStatuses.has(id)) workerStatuses.set(id, new WorkerStatus({ ...cfg, guildId: id }));
  return withTimeout(() => Promise.all([...workerStatuses].map(([id, status]) => status.publish({ ready: ready && client.guilds.cache.has(id), botId: client.user?.id ?? null }))), 4000, 'Przekroczono czas zapisu stanu połączenia bota.')
    .catch(error => { reportFailure('Nie udało się zapisać stanu połączenia bota', error); return false; });
}

client.once(Events.ClientReady, async ready => {
  console.log(`✅ Zalogowano jako ${ready.user.tag} | rekrutacja 3.0`);
  await publishWorkerStatus();
  if (shutdownPromise) return;
  const statusTimer = setInterval(() => { void publishWorkerStatus(); }, 15_000);
  shutdownTimers.add(statusTimer);
  statusTimer.unref?.();
  await statusReporter.online();
  await registerGuildCommands({guild:{id:'global',name:'Komendy globalne',commands:ready.application.commands},commands:proCommands,isActive:()=>!shutdownPromise,reportFailure});
  const guild = await ready.guilds.fetch(cfg.guildId).catch(() => null);
  if (!guild) console.error('Bot nie ma dostępu do głównego GUILD_ID; pozostałe serwery pozostają aktywne.');
  for (const joined of ready.guilds.cache.values()) await initializeGuild(joined);
  const levelTimer = setInterval(() => levelSystem.tick().catch(error => reportFailure('Błąd XP za rozmowy', error)), 15000);
  shutdownTimers.add(levelTimer);
  levelTimer.unref?.();
  await levelSystem.tick();
  
  const refreshStats = () => Promise.all([...client.guilds.cache.values()].map(server => featureHandlers.refreshStatisticsChannels(server)
    .catch(error => reportFailure('Nie udało się odświeżyć liczników serwera', error))));
  await refreshStats();
  const statisticsDataTimer = setInterval(() => Promise.all([...client.guilds.cache.values()].map(server => featureHandlers.publishStatistics(server)
    .catch(error => reportFailure('Nie udało się udostępnić statystyk panelowi', error)))), 30000);
  shutdownTimers.add(statisticsDataTimer);
  statisticsDataTimer.unref?.();
  const statsTimer = setInterval(refreshStats, 5 * 60 * 1000);
  shutdownTimers.add(statsTimer);
  statsTimer.unref?.();
  await proSystem.maintenance().catch(error => reportFailure('Nie udało się wznowić automatyzacji ticketów i publikacji', error));
  await communitySystem.tick().catch(error => reportFailure('Nie udało się wznowić gier', error));
  const maintenanceTimer = setInterval(() => Promise.all([proSystem.maintenance(), communitySystem.tick()]).catch(error => reportFailure('Automatyzacja ticketów lub gier nie powiodła się', error)), 60_000);
  shutdownTimers.add(maintenanceTimer);
  maintenanceTimer.unref?.();
  if (await databaseEnabled()) {
    const sharedStateTimer = setInterval(() => Promise.all([applicationStores.refresh(), featureStore.refresh()])
      .catch(error => reportFailure('Nie udało się odświeżyć współdzielonych danych', error)), 5000);
    shutdownTimers.add(sharedStateTimer);
    sharedStateTimer.unref?.();
  }
});

const initializingGuilds = new Map();
function initializeGuild(guild) {
  if (initializingGuilds.has(guild.id)) return initializingGuilds.get(guild.id);
  const task = (async () => {
    const registration = await registerGuildCommands({ guild,
      commands: [...serverBuilderCommands, ...recruitmentCommands, ...featureCommands, ...levelCommands, ...welcomeCommands, ...farewellCommands, ...communityCommands, ...changelogCommands, ...proCommands],
      isActive: () => client.guilds.cache.has(guild.id) && !shutdownPromise, reportFailure });
    if (!registration.ok || !client.guilds.cache.has(guild.id)) return;
    await applicationStores.get(guild.id);
    const runtime = runtimes.get(guild.id);
    if (!runtime) return;
    await runtime.features.refreshStatisticsChannels(guild).catch(error => reportFailure(`Początkowe statystyki serwera ${guild.name} (${guild.id})`, error));
    await runtime.recruitment.recoverUnsent(guild);
  })().finally(() => initializingGuilds.delete(guild.id));
  initializingGuilds.set(guild.id, task);
  return task;
}
client.on(Events.GuildCreate, guild => {
  void initializeGuild(guild).then(() => publishWorkerStatus())
    .catch(error => reportFailure('Konfiguracja nowego serwera nie powiodła się', error));
});
client.on(Events.GuildDelete, guild => { runtimes.remove(guild.id); void publishWorkerStatus(); });

client.on(Events.InteractionCreate, async interaction => {
  if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('strefa:rebuild:')) {
    return interaction.reply({content:'Usuwanie kanałów tym panelem jest wyłączone. Użyj /rozbuduj-serwer, aby dodać brakujące elementy bez kasowania.',flags:MessageFlags.Ephemeral});
  }
  if (interaction.isChatInputCommand() && serverBuilderCommands.some(command=>command.name===interaction.commandName)) {
    try { await serverBuilder.command(interaction); }
    catch(error) { reportFailure('Błąd dodawania kanałów lub ról',error);const payload={content:'Nie udało się dodać elementów. Niczego nie usunięto.'};if(interaction.deferred||interaction.replied)await interaction.editReply(payload).catch(()=>{});else await interaction.reply({...payload,flags:MessageFlags.Ephemeral}).catch(()=>{}); }
    return;
  }
  if ((interaction.isChatInputCommand() && communityCommands.some(command => command.name === interaction.commandName)) || (interaction.isButton() && interaction.customId.startsWith('strefa:community:'))) {
    try { if (interaction.isButton()) await communitySystem.button(interaction); else await communitySystem.command(interaction); }
    catch (error) { reportFailure('Błąd zabawy lub pomysłu', error); const payload = { content: 'Nie udało się wykonać działania. Sprawdź konfigurację kanału i uprawnienia bota.' }; if (interaction.deferred) await interaction.editReply(payload).catch(() => {}); else if (!interaction.replied) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {}); }
    return;
  }
  if (interaction.isChatInputCommand() && farewellCommands.some(command => command.name === interaction.commandName)) {
    try { await farewellSystem.command(interaction); }
    catch (error) { reportFailure('Błąd konfiguracji pożegnań', error); }
    return;
  }
  if (interaction.isChatInputCommand() && welcomeCommands.some(command => command.name === interaction.commandName)) {
    try { await welcomeSystem.command(interaction); }
    catch (error) { reportFailure('Błąd konfiguracji powitań', error); }
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === 'aktualizacja') {
    try { await handleChangelogCommand(interaction, featureStore); }
    catch (error) { reportFailure('Błąd zapisu aktualizacji', error); if (!interaction.replied && !interaction.deferred) await interaction.reply({content:errorMessage,flags:MessageFlags.Ephemeral}).catch(()=>{}); }
    return;
  }
  if (interaction.isChatInputCommand() && levelCommands.some(command => command.name === interaction.commandName)) {
    try { await levelSystem.command(interaction); }
    catch (error) { reportFailure('Błąd komendy poziomów', error); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral }).catch(() => {}); }
    return;
  }
  const isFeature = interaction.isChatInputCommand() && isFeatureCommand(interaction.commandName);
  const isFeatureButton = interaction.isButton() && interaction.customId.startsWith('strefa:');
  const isPro = interaction.isChatInputCommand() && isProCommand(interaction.commandName);
  const isProInteraction = (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && (interaction.customId.startsWith('strefa:ticket-pro:') || interaction.customId.startsWith('strefa:embed:'));
  const relevant = isFeature || isFeatureButton || isPro || isProInteraction || (interaction.isChatInputCommand() ? interaction.commandName.startsWith('rekrutacja-')
    : (interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('recruitment:'));
  if (!relevant) return;
  try {
    if (isPro) return await proSystem.command(interaction);
    if (isProInteraction) return interaction.isModalSubmit() ? await proSystem.modal(interaction) : await proSystem.button(interaction);
    if (interaction.isButton() && interaction.customId === 'strefa:ticket:close') return await proSystem.closeLegacy(interaction);
    if (isFeature) return await featureHandlers.command(interaction);
    if (isFeatureButton) return await featureHandlers.button(interaction);
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Rekrutacja działa na serwerze Discord.', flags: MessageFlags.Ephemeral });
    }
    await applicationStores.get(interaction.guildId);
    const recruitment = runtimes.get(interaction.guildId).recruitment;
    if (interaction.isChatInputCommand()) return await recruitment.command(interaction);
    if (interaction.isButton()) return await recruitment.button(interaction);
    if (interaction.isModalSubmit()) return await recruitment.modal(interaction);
  } catch (error) {
    reportFailure('Błąd obsługi interakcji', error);
    if (interaction.isRepliable()) { const payload = { content: errorMessage }; if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {}); else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {}); }
  }
});

client.on(Events.Error, error => reportFailure('Błąd klienta Discord', error));
client.on(Events.ShardError, error => reportFailure('Błąd połączenia z Discordem', error));
client.on(Events.ShardDisconnect, () => { void publishWorkerStatus(false); });
client.on(Events.ShardReconnecting, () => { void publishWorkerStatus(false); });
client.on(Events.ShardResume, () => { void publishWorkerStatus(); });
client.on(Events.VoiceStateUpdate, (oldState, newState) => featureHandlers.voiceState(oldState, newState));
client.on(Events.VoiceStateUpdate, (oldState, newState) => levelSystem.voiceState(oldState, newState));
client.on(Events.MessageCreate, message => levelSystem.message(message).catch(error => reportFailure('Błąd XP za wiadomość', error)));
client.on(Events.GuildMemberAdd, member => welcomeSystem.memberJoined(member).catch(error => reportFailure('Nie udało się wysłać powitania', error)));
client.on(Events.GuildMemberRemove, member => farewellSystem.memberLeft(member).catch(error => reportFailure('Nie udało się wysłać pożegnania', error)));
client.on(Events.GuildMemberAdd, member => featureHandlers.memberChanged(member, true).catch(error => reportFailure('Błąd logu dołączenia', error)));
client.on(Events.GuildMemberRemove, member => featureHandlers.memberChanged(member, false).catch(error => reportFailure('Błąd logu odejścia', error)));
client.on(Events.MessageDelete, message => featureHandlers.messageDeleted(message));
client.on(Events.MessageCreate, message => proSystem.message(message).catch(error => reportFailure('Nie udało się zapisać aktywności ticketu', error)));
client.on(Events.ChannelCreate, channel => featureHandlers.channelChanged(channel, true));
client.on(Events.ChannelDelete, channel => featureHandlers.channelChanged(channel, false));
client.on(Events.AutoModerationActionExecution, action => featureHandlers.autoModerationAction(action));
process.on('unhandledRejection', error => reportFailure('Nieobsłużona obietnica', error));
async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    for (const timer of shutdownTimers) clearInterval(timer);
    await withTimeout(() => Promise.all([...workerStatuses.values()].map(status => status.stop())), 4000, 'Przekroczono czas zapisu wyłączenia bota.')
      .catch(error => reportFailure('Nie udało się zapisać wyłączenia bota', error));
    await statusReporter.offline();
    const results = await Promise.allSettled([
      new Promise((resolve, reject) => panelServer.close(error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      })),
      Promise.resolve().then(() => client.destroy()),
      closeDatabase(),
    ]);
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Nie udało się zamknąć wszystkich zasobów bota.');
  })();
  return shutdownPromise;
}
process.once('SIGINT', () => { void shutdown().catch(error => reportFailure('Błąd zamykania bota', error)); });
process.once('SIGTERM', () => { void shutdown().catch(error => reportFailure('Błąd zamykania bota', error)); });

await client.login(cfg.token).catch(async error => {
  reportFailure('Błąd logowania bota', error);
  process.exitCode = 1;
  await shutdown().catch(shutdownError => reportFailure('Błąd zamykania po nieudanym logowaniu', shutdownError));
});
