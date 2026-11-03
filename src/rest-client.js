import { Client, ClientUser, GatewayIntentBits, Routes } from 'discord.js';
import { sanitizeDiagnostic } from './status-reporter.js';

// A REST client never receives Gateway READY, so its authenticated user must
// be populated explicitly before GuildMemberManager.me/fetchMe can be used.
export async function connectRestClient({ token, clientId, guildId, client } = {}) {
  const restClient = client ?? new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  const accessToken = String(token ?? '').trim();
  try {
    if (!accessToken) throw new Error('Uzupełnij DISCORD_TOKEN dla usługi panelu WWW.');
    restClient.rest.setToken(accessToken);
    const self = await restClient.rest.get(Routes.user('@me'));
    if (self?.bot !== true) throw new Error('DISCORD_TOKEN panelu musi być tokenem bota Discord.');
    if (self.id !== String(clientId ?? '').trim()) {
      throw new Error('DISCORD_TOKEN panelu należy do innej aplikacji niż CLIENT_ID. Ustaw te same dane bota w panelu i workerze.');
    }
    restClient.user = new ClientUser(restClient, self);
    restClient.users.cache.set(restClient.user.id, restClient.user);
    const guild = await restClient.guilds.fetch(guildId);
    await Promise.all([guild.channels.fetch(), guild.roles.fetch(), guild.members.fetchMe()]);
    return restClient;
  } catch (error) {
    await Promise.resolve().then(() => restClient.destroy()).catch(() => {});
    restClient.user = null;
    restClient.users.cache.clear();
    const failure = new Error(`Nie udało się połączyć panelu z Discordem: ${sanitizeDiagnostic(error, [accessToken])}`);
    failure.name = 'DiscordRestBootstrapError';
    if (typeof error?.status === 'number') failure.status = error.status;
    if (typeof error?.code === 'number') failure.code = error.code;
    else if (typeof error?.code === 'string') failure.code = sanitizeDiagnostic(error.code, [accessToken]);
    throw failure;
  }
}
