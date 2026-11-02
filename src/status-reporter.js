import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

const CHANNEL_NAME = 'status-bota';
const REPORT_TIMEOUT_MS = 3000;
const WINDOW_MS = 60_000;
const MAX_ERRORS_PER_WINDOW = 5;
const WRITE_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

// Diagnostics never contain a stack, request body, SQL detail, or environment dump.
export function sanitizeDiagnostic(value, extraSecrets = []) {
  let text = value instanceof Error
    ? [value.name, value.code, value.message].filter(Boolean).join(': ')
    : String(value ?? 'Nieznany błąd');
  const secrets = [...extraSecrets, ...Object.entries(process.env)
    .filter(([key]) => /TOKEN|SECRET|PASSWORD|DATABASE_URL|API_KEY|ACCESS_KEY/i.test(key))
    .map(([, secret]) => secret)]
    .filter(secret => typeof secret === 'string' && secret.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) text = text.split(secret).join('[UKRYTO]');
  return text
    .replace(/\b(?:mfa\.[\w-]{20,}|[\w-]{20,}\.[\w-]{6}\.[\w-]{20,})\b/g, '[UKRYTO]')
    .replace(/\b(?:Bearer|Bot)\s+[\w.\/-]{12,}/gi, '[UKRYTO]')
    .replace(/\b(?:[a-z0-9]+[_-])*(?:token|secret|password|passwd|api[_-]?key)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '[UKRYTO]')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/@]+(?::[^\s/@]*)?@/gi, '[UKRYTY_ADRES]@')
    .replace(/\b(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b[\s\S]*/gi, '[UKRYTO ZAPYTANIE SQL]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, 1400);
}

export class BotStatusReporter {
  #client;
  #cfg;
  #now;
  #channel;
  #resolving;
  #queue = Promise.resolve();
  #errors = new Map();
  #recentErrors = [];

  constructor({ client, cfg, now = () => Date.now() }) {
    this.#client = client;
    this.#cfg = cfg;
    this.#now = now;
  }

  online() {
    const name = this.#client.user?.tag || this.#client.user?.username || 'Bot';
    return this.#publish('🟢 BOT ONLINE', `${name} jest połączony z Discordem i gotowy do pracy.`, 0x2ecc71);
  }

  offline() {
    return this.#publish('🟠 BOT OFFLINE — planowane wyłączenie', 'Proces bota kończy pracę lub jest uruchamiany ponownie.', 0xf1c40f);
  }

  info(context, text) {
    return this.#publish(`ℹ️ ${context}`, text, 0x5865f2);
  }

  reportError(context, error) {
    if (!this.#client.isReady()) return Promise.resolve(false);
    const now = this.#now();
    const message = sanitizeDiagnostic(error, [this.#cfg.token]);
    const safeContext = sanitizeDiagnostic(context, [this.#cfg.token]);
    const key = `${safeContext}:${message}`;
    for (const [oldKey, at] of this.#errors) if (now - at >= WINDOW_MS) this.#errors.delete(oldKey);
    this.#recentErrors = this.#recentErrors.filter(at => now - at < WINDOW_MS);
    if (this.#errors.has(key) || this.#recentErrors.length >= MAX_ERRORS_PER_WINDOW) return Promise.resolve(false);
    this.#errors.set(key, now);
    this.#recentErrors.push(now);
    return this.#publish(`🔴 Problem: ${safeContext}`, `${message}\n\nSprawdź logi usługi bota, aby ustalić przyczynę.`, 0xe74c3c);
  }

  async #resolveChannel() {
    if (this.#channel) return this.#channel;
    if (this.#resolving) return this.#resolving;
    this.#resolving = (async () => {
      const guild = this.#client.guilds.cache.get(this.#cfg.guildId) ?? await this.#client.guilds.fetch(this.#cfg.guildId);
      if (!guild) throw new Error('Bot nie ma dostępu do serwera kanału statusu.');
      const me = guild.members.me ?? await guild.members.fetchMe();
      const configuredId = process.env.BOT_STATUS_CHANNEL_ID?.trim();
      let channel;
      if (configuredId) {
        channel = await guild.channels.fetch(configuredId);
        if (!channel || channel.guildId !== guild.id || channel.type !== ChannelType.GuildText) {
          throw new Error('BOT_STATUS_CHANNEL_ID musi wskazywać zwykły kanał tekstowy na skonfigurowanym serwerze.');
        }
      } else {
        const channels = await guild.channels.fetch();
        const matches = [...channels.values()].filter(item => item?.name === CHANNEL_NAME && item.type === ChannelType.GuildText);
        channel = matches.find(item => this.#isPrivate(item, guild));
        if (!channel && matches.length) {
          throw new Error('Istniejący status-bota ma publiczny lub nieznany dostęp. Ustaw prywatne uprawnienia albo wybierz kanał przez BOT_STATUS_CHANNEL_ID.');
        }
        if (!channel) {
          if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Do utworzenia status-bota bot potrzebuje uprawnienia Zarządzanie kanałami.');
          const overwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: me.id, allow: [...WRITE_PERMISSIONS, PermissionFlagsBits.ReadMessageHistory] },
          ];
          if (this.#cfg.staffRoleId && this.#cfg.staffRoleId !== guild.roles.everyone.id) {
            overwrites.push({ id: this.#cfg.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
          }
          channel = await guild.channels.create({
            name: CHANNEL_NAME, type: ChannelType.GuildText,
            topic: 'Stan StrefaBota i wykryte problemy. Kanał administracyjny.',
            permissionOverwrites: overwrites,
            reason: 'Automatyczny kanał statusu bota',
          });
        }
      }
      if (!channel.permissionsFor(me)?.has(WRITE_PERMISSIONS)) throw new Error('Na kanale statusu bot potrzebuje Wyświetlania kanału, Wysyłania wiadomości i Zamieszczania linków.');
      this.#channel = channel;
      return channel;
    })();
    try { return await this.#resolving; }
    finally { this.#resolving = null; }
  }

  #isPrivate(channel, guild) {
    const overwrites = channel.permissionOverwrites?.cache;
    const everyone = overwrites?.get(guild.roles.everyone.id);
    if (!everyone?.deny.has(PermissionFlagsBits.ViewChannel) || everyone.allow.has(PermissionFlagsBits.ViewChannel)) return false;
    const allowed = new Set([this.#client.user?.id, this.#cfg.staffRoleId]);
    return [...overwrites.values()].every(overwrite => !overwrite.allow.has(PermissionFlagsBits.ViewChannel) || allowed.has(overwrite.id));
  }

  #publish(title, description, color) {
    if (!this.#client.isReady()) return Promise.resolve(false);
    const deadline = Date.now() + REPORT_TIMEOUT_MS;
    const task = this.#queue.then(() => this.#bounded(async () => {
      if (!this.#client.isReady() || Date.now() >= deadline) return false;
      const channel = await this.#resolveChannel();
      if (!this.#client.isReady() || Date.now() >= deadline) return false;
      await channel.send({
        embeds: [new EmbedBuilder()
          .setTitle(sanitizeDiagnostic(title, [this.#cfg.token]).slice(0, 256))
          .setDescription(sanitizeDiagnostic(description, [this.#cfg.token]))
          .setColor(color).setTimestamp(new Date(this.#now()))],
        allowedMentions: { parse: [] },
      });
      return true;
    }, deadline));
    this.#queue = task.catch(() => false);
    return this.#bounded(() => task, deadline);
  }

  async #bounded(operation, deadline) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now())); timer.unref?.(); }),
      ]);
    } catch (error) {
      this.#channel = null;
      console.warn('Nie udało się wysłać statusu bota:', sanitizeDiagnostic(error, [this.#cfg.token]));
      return false;
    } finally { clearTimeout(timer); }
  }
}
