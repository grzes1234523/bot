import 'dotenv/config';

const ID_PATTERN = /^\d{17,20}$/;

export function readConfig(env = process.env) {
  const required = [
    'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'APPLICATION_CHANNEL_ID', 'ACCEPTED_ROLE_ID',
  ];
  const missing = required.filter(key => !String(env[key] ?? '').trim());
  if (missing.length) throw new Error(`Brakuje konfiguracji w .env: ${missing.join(', ')}`);
  const idFields = [
    'CLIENT_ID', 'GUILD_ID', 'APPLICATION_CHANNEL_ID', 'ACCEPTED_ROLE_ID', 'STAFF_ROLE_ID', 'LOG_CHANNEL_ID', 'BOT_STATUS_CHANNEL_ID',
  ];
  for (const key of idFields) {
    const value = String(env[key] ?? '').trim();
    if (value && !ID_PATTERN.test(value)) {
      throw new Error(`${key} musi zawierać ID Discord (17–20 cyfr), a nie nazwę roli/kanału.`);
    }
  }
  const cooldownHours = Number(env.REAPPLY_COOLDOWN_HOURS ?? 24);
  if (!Number.isFinite(cooldownHours) || cooldownHours < 0 || cooldownHours > 24 * 365) {
    throw new Error('REAPPLY_COOLDOWN_HOURS musi być liczbą od 0 do 8760.');
  }
  return Object.freeze({
    token: String(env.DISCORD_TOKEN).trim(),
    clientId: String(env.CLIENT_ID).trim(),
    guildId: String(env.GUILD_ID).trim(),
    applicationChannelId: String(env.APPLICATION_CHANNEL_ID).trim(),
    acceptedRoleId: String(env.ACCEPTED_ROLE_ID).trim(),
    staffRoleId: String(env.STAFF_ROLE_ID ?? '').trim(),
    logChannelId: String(env.LOG_CHANNEL_ID ?? '').trim(),
    cooldownHours,
    serverName: String(env.SERVER_DISPLAY_NAME ?? 'Strefa Gry i Rozrywki').trim().slice(0, 70) || 'Serwer Discord',
  });
}
