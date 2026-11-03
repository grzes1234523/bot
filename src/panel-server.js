import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTimeout } from './async-operation.js';
import { levelSettings, levelRanking, validateLevelSettings } from './levels.js';
import { createLevelChannel } from './level-channel.js';
import { welcomeSettings, configureWelcome, farewellSettings, configureFarewell } from './welcome.js';
import { ActionRowBuilder, AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleTriggerType, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

const PANEL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'panel');
const API = 'https://discord.com/api/v10';
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;
const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error('Treść żądania jest za duża.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function cookieSignature(id, secret) {
  return crypto.createHmac('sha256', secret).update(id).digest('hex');
}

function parseSession(req, secret) {
  const raw = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('strefa_panel='))?.slice('strefa_panel='.length);
  if (!raw) return null;
  const [id, signature] = raw.split('.');
  if (!id || !signature) return null;
  const expected = Buffer.from(cookieSignature(id, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  const session = sessions.get(id);
  if (!session || Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(id);
    return null;
  }
  return { id, value: session };
}

function setSessionCookie(res, id, secret, baseUrl) {
  const secure = baseUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `strefa_panel=${id}.${cookieSignature(id, secret)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`);
}

function hasManagePermission(permissions) {
  try {
    const bits = BigInt(permissions ?? '0');
    return (bits & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
  } catch { return false; }
}

export function startPanelServer({ client, getApplications, featureStore, discordMode = 'gateway', getWorkerStatus, refreshData, workerStatusTimeoutMs = 2000, refreshDataTimeoutMs = 2000 }) {
  if (!['gateway', 'rest'].includes(discordMode)) throw new Error('Nieznany tryb połączenia panelu z Discordem.');
  const creatingLevelChannel = new Set();
  // The panel's REST access and the worker's Gateway connection are independent.
  const isDiscordAvailable = () => discordMode === 'rest' || client.isReady();
  const connectionStatus = async () => {
    if (discordMode === 'gateway') {
      const ready = client.isReady();
      return { botReady: ready, discordReady: ready, botStatus: ready ? 'online' : 'offline', botLastSeen: null };
    }
    let worker = { botReady: null, botStatus: 'unknown', botLastSeen: null };
    if (getWorkerStatus) {
      const unavailable = { botReady: null, botStatus: 'unavailable', botLastSeen: null };
      try {
        worker = await withTimeout(getWorkerStatus, workerStatusTimeoutMs) ?? unavailable;
      } catch { worker = unavailable; }
    }
    return { ...worker, discordReady: isDiscordAvailable() };
  };
  const { CLIENT_ID = '', CLIENT_SECRET = '', GUILD_ID = '', PANEL_BASE_URL = 'http://localhost:3000', PANEL_SESSION_SECRET = '', PANEL_HOST = '127.0.0.1' } = process.env;
  const panelPort = Number(process.env.PORT || process.env.PANEL_PORT || 3000);
  const baseUrl = PANEL_BASE_URL.replace(/\/+$/, '');
  const redirectUri = `${baseUrl}/auth/discord/callback`;
  const configReady = Boolean(CLIENT_ID && CLIENT_SECRET && GUILD_ID && PANEL_SESSION_SECRET.length >= 32);

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const route = requestUrl.pathname;
    try {
      if (req.method === 'GET' && route === '/health') {
        return json(res, 200, { ok: true, ...await connectionStatus(), panelConfigured: configReady });
      }

      if (req.method === 'GET' && route === '/auth/discord') {
        if (!configReady) return res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Uzupełnij CLIENT_SECRET i PANEL_SESSION_SECRET w pliku .env, a potem uruchom ponownie bota.');
        const id = crypto.randomBytes(32).toString('hex');
        const session = { createdAt: Date.now(), oauthState: crypto.randomBytes(32).toString('hex') };
        sessions.set(id, session);
        setSessionCookie(res, id, PANEL_SESSION_SECRET, baseUrl);
        const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'identify guilds', state: session.oauthState });
        res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${params}` });
        return res.end();
      }

      if (req.method === 'GET' && route === '/auth/discord/callback') {
        const current = parseSession(req, PANEL_SESSION_SECRET);
        const code = requestUrl.searchParams.get('code');
        const state = requestUrl.searchParams.get('state');
        if (requestUrl.searchParams.has('error')) return res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Logowanie Discord anulowane. Możesz wrócić do panelu.');
        if (!configReady) return res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Panel OAuth2 nie jest skonfigurowany. Uzupełnij CLIENT_SECRET i PANEL_SESSION_SECRET w lokalnym pliku .env, sprawdź PANEL_BASE_URL, a potem uruchom bota ponownie.');
        if (!current || !code || !state || state !== current.value.oauthState) return res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Sesja logowania wygasła albo jest nieprawidłowa. Wróć do panelu i zaloguj się ponownie.');

        const tokenResponse = await fetch(`${API}/oauth2/token`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
        });
        if (!tokenResponse.ok) {
          const oauthError = await tokenResponse.json().catch(() => ({}));
          console.error('Discord OAuth token exchange rejected:', tokenResponse.status, oauthError.error ?? 'unknown');
          throw new Error(`Discord odrzucił wymianę kodu OAuth2 (${oauthError.error ?? 'unknown'}).`);
        }
        const token = await tokenResponse.json();
        const authHeaders = { Authorization: `Bearer ${token.access_token}` };
        const [userResponse, guildsResponse] = await Promise.all([
          fetch(`${API}/users/@me`, { headers: authHeaders }),
          fetch(`${API}/users/@me/guilds`, { headers: authHeaders }),
        ]);
        if (!userResponse.ok || !guildsResponse.ok) throw new Error('Discord nie zwrócił danych konta i serwerów.');
        const user = await userResponse.json();
        const guilds = await guildsResponse.json();
        const guild = guilds.find(item => item.id === GUILD_ID);
        const newId = crypto.randomBytes(32).toString('hex');
        sessions.delete(current.id);
        sessions.set(newId, { createdAt: Date.now(), user: { id: user.id, username: user.global_name || user.username }, canManage: Boolean(guild && hasManagePermission(guild.permissions)) });
        setSessionCookie(res, newId, PANEL_SESSION_SECRET, baseUrl);
        res.writeHead(302, { Location: '/' });
        return res.end();
      }

      if (req.method === 'POST' && route === '/auth/logout') {
        const current = parseSession(req, PANEL_SESSION_SECRET);
        if (current) sessions.delete(current.id);
        res.writeHead(204, { 'Set-Cookie': 'strefa_panel=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
        return res.end();
      }

      if ((req.method === 'GET' || req.method === 'POST') && route.startsWith('/api/')) {
        const current = configReady ? parseSession(req, PANEL_SESSION_SECRET) : null;
        if (route === '/api/session') {
          if (!current?.value.user) return json(res, 401, { authenticated: false, configured: configReady });
          const guild = client.guilds.cache.get(GUILD_ID);
          return json(res, 200, { authenticated: true, user: current.value.user, canManage: current.value.canManage, ...await connectionStatus(), guildName: guild?.name || process.env.SERVER_DISPLAY_NAME || 'Strefa Gry i Rozrywki', guildIcon: guild?.iconURL({ size: 128 }) || null });
        }
        if (current?.value.user && current.value.canManage && refreshData) {
          try { await withTimeout(refreshData, refreshDataTimeoutMs); }
          catch { return json(res, 503, { error: 'Nie można odświeżyć danych ze wspólnej bazy. Spróbuj ponownie za chwilę.' }); }
        }
        if (route === '/api/welcome' || route === '/api/farewell') {
          const settingsFor = route === '/api/farewell' ? farewellSettings : welcomeSettings;
          const configure = route === '/api/farewell' ? configureFarewell : configureWelcome;
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Zarządzanie serwerem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild || !isDiscordAvailable()) return json(res, 503, { error: 'Brak połączenia z Discordem.' });
          if (req.method === 'POST') {
            if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
            try {
              const settings = await configure({ guild, featureStore, body: await readJson(req) });
              return json(res, 200, { ok: true, settings });
            } catch (error) { return json(res, 400, { error: error.message }); }
          }
          const channels = await guild.channels.fetch();
          return json(res, 200, { settings: settingsFor(featureStore.snapshot(), GUILD_ID), categories: channels.filter(c => c?.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name })), channels: channels.filter(c => c && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)).map(c => ({ id: c.id, name: c.name, categoryId: c.parentId })) });
        }
        if (route === '/api/levels' || route === '/api/levels/channel') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Zarządzanie serwerem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!isDiscordAvailable() || !guild) return json(res, 503, { error: 'Brak połączenia z serwerem Discord.' });
          if (route === '/api/levels/channel') {
            if (req.method !== 'POST') return json(res, 405, { error: 'Użyj przycisku Utwórz kanał w panelu.' });
            if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
            if (creatingLevelChannel.has(guild.id)) return json(res, 409, { error: 'Kanał jest właśnie tworzony. Poczekaj chwilę.' });
            creatingLevelChannel.add(guild.id);
            try {
              const body = await readJson(req);
              const result = await createLevelChannel({ guild, featureStore, categoryId: body?.categoryId });
              return json(res, 200, result);
            } catch (error) { console.error('Tworzenie kanału poziomów:', error.message); return json(res, 400, { error: 'Nie udało się utworzyć kanału. Sprawdź kategorię oraz uprawnienia bota: Zarządzanie kanałami, Wyświetlanie kanałów i Wysyłanie wiadomości.' }); }
            finally { creatingLevelChannel.delete(guild.id); }
          }
          if (req.method === 'POST') {
            if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
            let settings;
            try { settings = validateLevelSettings(await readJson(req)); }
            catch (error) { return json(res, 400, { error: error.message }); }
            const roles = await guild.roles.fetch();
            const me = guild.members.me ?? await guild.members.fetchMe();
            if (settings.announcementChannelId) {
              const channel = await guild.channels.fetch(settings.announcementChannelId).catch(() => null);
              if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) || !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return json(res, 400, { error: 'Wybierz kanał tekstowy, w którym bot może wyświetlać kanał i wysyłać wiadomości.' });
            }
            for (const reward of settings.rewards) {
              const role = roles.get(reward.roleId);
              if (!role || role.id === guild.id || role.managed || !role.editable || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return json(res, 400, { error: 'Bot musi mieć Zarządzanie rolami, a nagrody muszą być poniżej jego najwyższej roli.' });
            }
            await featureStore.update(state => {
              state.levels ??= { guilds: {} };
              state.levels.guilds ??= {};
              const levels = state.levels.guilds[GUILD_ID] ??= { users: {} };
              levels.settings = settings;
            });
            return json(res, 200, { ok: true });
          }
          const state = featureStore.snapshot();
          const ranking = levelRanking(state, GUILD_ID);
          const roles = await guild.roles.fetch();
          const channels = await guild.channels.fetch();
          return json(res, 200, { settings: levelSettings(state, GUILD_ID), ranking: ranking.slice(0, 100), totals: { users: ranking.length, xp: ranking.reduce((sum, user) => sum + user.xp, 0), voiceMinutes: ranking.reduce((sum, user) => sum + user.voiceMinutes, 0) }, roles: roles.filter(role => role && role.id !== guild.id && !role.managed && role.editable).map(role => ({ id: role.id, name: role.name })), categories: channels.filter(channel => channel?.type === ChannelType.GuildCategory).map(channel => ({ id: channel.id, name: channel.name })), channels: channels.filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name })) });
        }
        if (route === '/api/recruitment') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable() || !client.guilds.cache.has(GUILD_ID)) return json(res, 503, { error: 'Bot nie jest połączony ze skonfigurowanym serwerem.' });
          const applications = Object.values(getApplications()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
          const counts = { pending: 0, accepted: 0, rejected: 0, closed: 0 };
          for (const app of applications) if (Object.hasOwn(counts, app.status)) counts[app.status]++;
          return json(res, 200, { counts, applications: applications.slice(0, 50).map(({ id, status, createdAt, decisionAt }) => ({ id, status, createdAt, decisionAt })) });
        }
        if (route === '/api/features') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable() || !client.guilds.cache.has(GUILD_ID)) return json(res, 503, { error: 'Bot nie jest połączony ze skonfigurowanym serwerem.' });
          const state = featureStore.snapshot();
          return json(res, 200, { automations: {
            autoChannels: Boolean(state.autoChannels?.joinChannelId),
            automod: Boolean(state.automod?.ruleId || state.automod?.keywords?.length),
            logs: Boolean(state.logChannelId),
            tickets: Boolean(state.tickets?.categoryId),
            verification: Boolean(state.verification?.roleId),
          } });
        }
        if (route === '/api/automod') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          const botMember = guild.members.me ?? await guild.members.fetchMe();
          if (!botMember.permissions.has(PermissionFlagsBits.ManageGuild)) return json(res, 403, { error: 'Bot potrzebuje uprawnienia Zarządzanie serwerem, aby konfigurować reguły Auto Mod.' });
          const state = featureStore.snapshot().automod;
          const rules = await guild.autoModerationRules.fetch();
          let rule = (state.ruleId ? rules.get(state.ruleId) : null) ?? rules.find(item => item.name === 'Strefa Auto Mod — blokowane frazy') ?? null;
          const keywords = [...new Set((rule?.triggerMetadata.keywordFilter ?? state.keywords ?? []).map(value => String(value).toLowerCase()))];
          if (req.method === 'GET') return json(res, 200, { keywords, enabled: rule?.enabled ?? state.enabled !== false, configured: Boolean(rule), ruleId: rule?.id ?? null });
          if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
          const body = await readJson(req);
          const action = String(body.action ?? '');
          if (action === 'toggle') {
            const enabled = Boolean(body.enabled);
            if (enabled && !rule) return json(res, 400, { error: 'Najpierw dodaj co najmniej jedną blokowaną frazę.' });
            if (rule && rule.enabled !== enabled) await rule.edit({ enabled }, `Auto Mod ${enabled ? 'włączony' : 'wyłączony'} przez ${current.value.user.username}`);
            await featureStore.update(data => { data.automod.enabled = enabled; if (rule) data.automod.ruleId = rule.id; });
            return json(res, 200, { keywords, enabled, configured: Boolean(rule), ruleId: rule?.id ?? null });
          }
          const phrase = String(body.phrase ?? '').trim().toLowerCase();
          if (!phrase || phrase.length > 60) return json(res, 400, { error: 'Fraza musi mieć od 1 do 60 znaków.' });
          let updatedKeywords = [...keywords];
          if (action === 'add') {
            if (updatedKeywords.includes(phrase)) return json(res, 400, { error: 'Ta fraza jest już na liście.' });
            if (updatedKeywords.length >= 1000) return json(res, 400, { error: 'Osiągnięto limit 1000 fraz w jednej regule.' });
            updatedKeywords.push(phrase);
          } else if (action === 'remove') {
            if (!updatedKeywords.includes(phrase)) return json(res, 404, { error: 'Nie znaleziono tej frazy na liście.' });
            updatedKeywords = updatedKeywords.filter(item => item !== phrase);
          } else return json(res, 400, { error: 'Nieznana operacja Auto Mod.' });
          const enabled = state.enabled !== false;
          const reason = `${action === 'add' ? 'Dodano' : 'Usunięto'} frazę Auto Mod z panelu WWW`;
          if (!updatedKeywords.length) {
            if (rule) await rule.delete(reason);
            rule = null;
          } else if (rule) {
            await rule.edit({ triggerMetadata: { keywordFilter: updatedKeywords }, enabled }, reason);
          } else {
            rule = await guild.autoModerationRules.create({
              name: 'Strefa Auto Mod — blokowane frazy',
              eventType: AutoModerationRuleEventType.MessageSend,
              triggerType: AutoModerationRuleTriggerType.Keyword,
              triggerMetadata: { keywordFilter: updatedKeywords },
              actions: [{ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: 'Ta fraza jest zablokowana przez Auto Mod.' } }],
              enabled,
              reason,
            });
          }
          await featureStore.update(data => { data.automod.keywords = updatedKeywords; data.automod.ruleId = rule?.id ?? null; data.automod.enabled = enabled; });
          return json(res, 200, { keywords: updatedKeywords, enabled: rule?.enabled ?? enabled, configured: Boolean(rule), ruleId: rule?.id ?? null });
        }
        if (route === '/api/server-control') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          const channels = await guild.channels.fetch();
          const botMember = guild.members.me ?? await guild.members.fetchMe();
          const channelList = channels.filter(channel => channel && channel.type !== ChannelType.GuildCategory).map(channel => {
            const permissions = channel.permissionsFor(botMember);
            const text = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type);
            const accessible = Boolean(permissions?.has(PermissionFlagsBits.ViewChannel));
            const canSend = text && Boolean(permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));
            return { id: channel.id, name: channel.name, type: text ? 'tekstowy' : 'głosowy', parentName: channel.parent?.name ?? 'Bez kategorii', slowmode: channel.rateLimitPerUser ?? 0, accessible, canSend };
          }).sort((a, b) => a.parentName.localeCompare(b.parentName, 'pl') || a.name.localeCompare(b.name, 'pl'));
          return json(res, 200, {
            server: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), memberCount: guild.memberCount ?? 0 },
            channels: channelList,
            counts: { servers: 1, channels: channelList.length, ready: channelList.filter(channel => channel.canSend).length, needsAttention: channelList.filter(channel => !channel.accessible).length },
          });
        }
        if (route === '/api/moderation/settings') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          const channels = await guild.channels.fetch();
          const roles = await guild.roles.fetch();
          const state = featureStore.snapshot();
          if (req.method === 'GET') return json(res, 200, {
            moderation: state.moderation,
            logChannelId: state.logChannelId,
            textChannels: channels.filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name })),
            roles: roles.filter(role => role && role.id !== guild.id && !role.managed).map(role => ({ id: role.id, name: role.name })),
          });
          if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
          const body = await readJson(req);
          const logChannelId = String(body.logChannelId ?? '');
          const logChannel = logChannelId ? channels.get(logChannelId) : null;
          if (logChannelId && (!logChannel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(logChannel.type))) return json(res, 400, { error: 'Wybierz dostępny kanał tekstowy do logów.' });
          if (logChannel) {
            const botMember = guild.members.me ?? await guild.members.fetchMe();
            if (!logChannel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return json(res, 400, { error: 'Bot potrzebuje dostępu, wysyłania wiadomości i osadzania linków w kanale logów.' });
          }
          const allowedKeys = ['viewWarnings', 'kick', 'warn', 'timeout', 'ban', 'slowmode'];
          const permissions = {};
          for (const key of allowedKeys) {
            const ids = Array.isArray(body.permissions?.[key]) ? [...new Set(body.permissions[key].map(String))] : [];
            if (ids.length > 10 || ids.some(id => !roles.has(id) || roles.get(id).managed || id === guild.id)) return json(res, 400, { error: 'Sprawdź role wybrane przy uprawnieniach moderacji.' });
            permissions[key] = ids;
          }
          const protectedRoleIds = Array.isArray(body.protectedRoleIds) ? [...new Set(body.protectedRoleIds.map(String))] : [];
          if (protectedRoleIds.length > 25 || protectedRoleIds.some(id => !roles.has(id) || roles.get(id).managed || id === guild.id)) return json(res, 400, { error: 'Sprawdź role chronione.' });
          await featureStore.update(data => {
            data.moderation = { permissions, protectedRoleIds, hierarchyEnabled: Boolean(body.hierarchyEnabled) };
            data.logChannelId = logChannel?.id ?? null;
          });
          return json(res, 200, { moderation: featureStore.snapshot().moderation, logChannelId: featureStore.snapshot().logChannelId });
        }
        if (route === '/api/verification/panel') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
          const state = featureStore.snapshot().verification;
          if (req.method === 'GET') return json(res, 200, {
            config: { ...state, channelName: channels.get(state.channelId)?.name ?? null, roleName: roles.get(state.roleId)?.name ?? null },
            textChannels: channels.filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name })),
            roles: roles.filter(role => role && role.id !== guild.id && !role.managed).map(role => ({ id: role.id, name: role.name })),
          });
          if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
          const body = await readJson(req);
          const title = String(body.title ?? '').trim();
          const description = String(body.description ?? '').trim();
          const buttonLabel = String(body.buttonLabel ?? '').trim();
          const channel = channels.get(String(body.channelId ?? ''));
          const role = roles.get(String(body.roleId ?? ''));
          if (!title || title.length > 256 || !description || description.length > 3500 || !buttonLabel || buttonLabel.length > 80) return json(res, 400, { error: 'Uzupełnij tytuł, opis i tekst przycisku. Limit opisu to 3500 znaków.' });
          if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return json(res, 400, { error: 'Wybierz dostępny kanał tekstowy.' });
          if (!role || role.id === guild.id || role.managed) return json(res, 400, { error: 'Wybierz dostępną rolę weryfikacji.' });
          const botMember = guild.members.me ?? await guild.members.fetchMe();
          if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) return json(res, 400, { error: 'Bot potrzebuje uprawnienia Zarządzanie rolami, a wybrana rola musi być niżej od roli bota.' });
          const channelPermissions = channel.permissionsFor(botMember);
          if (!channelPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return json(res, 400, { error: 'Bot potrzebuje dostępu, wysyłania wiadomości i osadzania linków w wybranym kanale.' });
          const payload = {
            embeds: [new EmbedBuilder().setColor(0x43b581).setTitle(title).setDescription(description)],
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('strefa:verify:confirm').setLabel(buttonLabel).setEmoji('✅').setStyle(ButtonStyle.Success))],
            allowedMentions: { parse: [] },
          };
          const oldChannel = state.channelId ? channels.get(state.channelId) : null;
          const oldMessage = oldChannel?.isTextBased() ? await oldChannel.messages.fetch(state.messageId).catch(() => null) : null;
          let message;
          if (oldMessage && oldChannel.id === channel.id) { await oldMessage.edit(payload); message = oldMessage; }
          else {
            message = await channel.send(payload);
            if (oldMessage) await oldMessage.delete().catch(() => {});
          }
          await featureStore.update(data => { data.verification = { roleId: role.id, channelId: channel.id, messageId: message.id, title, description, buttonLabel }; });
          return json(res, 200, { ok: true, config: { roleId: role.id, channelId: channel.id, messageId: message.id, title, description, buttonLabel, channelName: channel.name, roleName: role.name, messageUrl: message.url } });
        }
        if (route === '/api/auto-channels' || route === '/api/voice-support') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          const channels = await guild.channels.fetch();
          const roles = route === '/api/voice-support' ? await guild.roles.fetch() : null;
          const state = featureStore.snapshot();
          if (req.method === 'GET') {
            const voiceChannels = channels.filter(channel => channel && channel.type === ChannelType.GuildVoice).map(channel => ({ id: channel.id, name: channel.name, parentName: channel.parent?.name ?? 'Bez kategorii' })).sort((a, b) => a.parentName.localeCompare(b.parentName, 'pl') || a.name.localeCompare(b.name, 'pl'));
            if (route === '/api/auto-channels') return json(res, 200, {
              config: state.autoChannels,
              voiceChannels,
              categories: channels.filter(channel => channel?.type === ChannelType.GuildCategory).map(channel => ({ id: channel.id, name: channel.name })),
              createdCount: state.autoChannels.createdIds?.length ?? 0,
            });
            return json(res, 200, {
              config: state.voiceSupport,
              voiceChannels,
              roles: roles.filter(role => role && role.id !== guild.id && !role.managed).map(role => ({ id: role.id, name: role.name })),
            });
          }
          if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
          const body = await readJson(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Nieprawidłowe ustawienia kanałów.' });
          const channelId = String(body.channelId ?? '');
          const selectedChannel = channels.get(channelId);
          if (!selectedChannel || selectedChannel.type !== ChannelType.GuildVoice) return json(res, 400, { error: 'Wybierz dostępny kanał głosowy.' });
          if (route === '/api/auto-channels') {
            const categoryId = String(body.categoryId ?? '');
            const category = categoryId ? channels.get(categoryId) : null;
            const template = String(body.template ?? 'Kanał {name}').trim();
            if (categoryId && category?.type !== ChannelType.GuildCategory) return json(res, 400, { error: 'Wybierz dostępną kategorię.' });
            if (!template || template.length > 80) return json(res, 400, { error: 'Szablon nazwy musi mieć od 1 do 80 znaków.' });
            const me = guild.members.me ?? await guild.members.fetchMe();
            if (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.MoveMembers)) return json(res, 400, { error: 'Bot potrzebuje uprawnień Zarządzanie kanałami i Przenoszenie członków.' });
            await featureStore.update(data => { data.autoChannels.joinChannelId = selectedChannel.id; data.autoChannels.categoryId = category?.id ?? null; data.autoChannels.template = template; });
            return json(res, 200, { config: featureStore.snapshot().autoChannels });
          }
          const roleId = String(body.supportRoleId ?? '');
          const role = roleId ? roles.get(roleId) : null;
          if (roleId && (!role || role.managed || role.id === guild.id)) return json(res, 400, { error: 'Wybierz dostępną rolę obsługi.' });
          await featureStore.update(data => { data.voiceSupport.channelId = selectedChannel.id; data.voiceSupport.supportRoleId = role?.id ?? null; });
          return json(res, 200, { config: featureStore.snapshot().voiceSupport });
        }
        if (route === '/api/statistics') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          const channels = guild.channels.cache;
          const config = featureStore.snapshot().statisticsChannels ?? {};
          const countIn = id => {
            const channel = id ? channels.get(id) : null;
            const match = channel?.name.match(/(\d+)\s*$/);
            return match ? Number(match[1]) : null;
          };
          const all = guild.memberCount ?? 0;
          const bots = countIn(config.botsChannelId) ?? guild.members.cache.filter(member => member.user.bot).size;
          const applications = Object.values(getApplications());
          const economy = featureStore.snapshot();
          const totalCoins = Object.values(economy.economy).reduce((sum, account) => sum + (Number(account.balance) || 0) + (Number(account.bank) || 0), 0);
          const countStatus = status => applications.filter(app => app.status === status).length;
          return json(res, 200, {
            server: guild.name,
            online: countIn(config.onlineChannelId),
            members: countIn(config.membersChannelId) ?? all,
            humans: Math.max(0, (countIn(config.membersChannelId) ?? all) - bots),
            bots,
            textChannels: channels.filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type)).size,
            voiceChannels: channels.filter(channel => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)).size,
            categories: channels.filter(channel => channel.type === ChannelType.GuildCategory).size,
            applications: { pending: countStatus('pending'), accepted: countStatus('accepted'), rejected: countStatus('rejected'), closed: countStatus('closed') },
            economy: { accounts: Object.keys(economy.economy).length, totalCoins, currency: economy.economyConfig.currencySymbol },
            createdTimestamp: guild.createdTimestamp,
            updatedAt: new Date().toISOString(),
          });
        }
        if (route === '/api/economy/settings') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable() || !client.guilds.cache.has(GUILD_ID)) return json(res, 503, { error: 'Bot nie jest połączony ze skonfigurowanym serwerem.' });
          if (req.method === 'GET') return json(res, 200, featureStore.snapshot().economyConfig);
          if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
          const body = await readJson(req);
          const currencySymbol = String(body.currencySymbol ?? '').trim();
          const numericFields = ['initialBank', 'initialWallet', 'dailyReward', 'workMin', 'workMax'];
          const values = Object.fromEntries(numericFields.map(key => [key, Number(body[key])]));
          const thousandsSeparator = ['space', 'comma', 'period'].includes(body.thousandsSeparator) ? body.thousandsSeparator : '';
          const currencyPosition = ['left', 'right'].includes(body.currencyPosition) ? body.currencyPosition : '';
          if (!currencySymbol || currencySymbol.length > 16 || !thousandsSeparator || !currencyPosition || numericFields.some(key => !Number.isInteger(values[key]) || values[key] < 0 || values[key] > 1000000) || values.workMin > values.workMax) {
            return json(res, 400, { error: 'Sprawdź nazwę waluty, kwoty oraz zakres zarobków.' });
          }
          const updated = { currencySymbol, ...values, thousandsSeparator, currencyPosition };
          await featureStore.update(state => { state.economyConfig = updated; });
          return json(res, 200, updated);
        }
        if (route === '/api/tickets/panels') {
          if (!current?.value.user) return json(res, 401, { error: 'Zaloguj się przez Discord.' });
          if (!current.value.canManage) return json(res, 403, { error: 'Potrzebujesz uprawnienia Administrator lub Zarządzanie serwerem.' });
          if (!isDiscordAvailable()) return json(res, 503, { error: 'Bot nie jest połączony z Discordem.' });
          const guild = client.guilds.cache.get(GUILD_ID);
          if (!guild) return json(res, 503, { error: 'Bot nie ma dostępu do skonfigurowanego serwera.' });
          if (req.method === 'GET') {
            const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
            const state = featureStore.snapshot().tickets;
            const panels = (state.panels ?? []).map(panel => ({ ...panel, channelName: channels.get(panel.channelId)?.name ?? panel.channelName ?? 'brak kanału', supportRoleName: roles.get(panel.supportRoleId)?.name ?? null }));
            return json(res, 200, {
              panels,
              textChannels: channels.filter(channel => channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name })),
              categories: channels.filter(channel => channel?.type === ChannelType.GuildCategory).map(channel => ({ id: channel.id, name: channel.name })),
              roles: roles.filter(role => role && role.id !== guild.id && !role.managed).map(role => ({ id: role.id, name: role.name })),
              defaults: { categoryId: state.categoryId, supportRoleId: state.supportRoleId },
            });
          }
          if (req.headers.origin !== new URL(baseUrl).origin) return json(res, 403, { error: 'Nieprawidłowe źródło żądania.' });
          const body = await readJson(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Nieprawidłowe dane panelu.' });
          const state = featureStore.snapshot().tickets;
          const existing = (state.panels ?? []).find(panel => panel.messageId === String(body.panelId ?? ''));
          const action = String(body.action ?? 'publish');
          if (['publish', 'duplicate', 'resend'].includes(action) && (state.panels ?? []).length >= 10) return json(res, 400, { error: 'Osiągnięto limit 10 paneli ticketów.' });
          if (action === 'delete') {
            if (!existing) return json(res, 404, { error: 'Nie znaleziono panelu ticketów.' });
            const oldChannel = await guild.channels.fetch(existing.channelId).catch(() => null);
            const oldMessage = oldChannel?.isTextBased() ? await oldChannel.messages.fetch(existing.messageId).catch(() => null) : null;
            if (oldMessage) await oldMessage.delete();
            await featureStore.update(data => { data.tickets.panels = (data.tickets.panels ?? []).filter(panel => panel.messageId !== existing.messageId); });
            return json(res, 200, { ok: true });
          }
          const title = String(body.title ?? existing?.title ?? '').trim();
          const description = String(body.description ?? existing?.description ?? '').trim();
          const buttonLabel = String(body.buttonLabel ?? existing?.buttonLabel ?? '').trim();
          const channelId = String(body.channelId ?? existing?.channelId ?? '');
          const categoryId = body.categoryId === '' ? (state.categoryId || null) : String(body.categoryId ?? existing?.categoryId ?? state.categoryId ?? '') || null;
          const supportRoleId = body.supportRoleId === '' ? (state.supportRoleId || null) : String(body.supportRoleId ?? existing?.supportRoleId ?? state.supportRoleId ?? '') || null;
          if (!title || title.length > 256 || !description || description.length > 3500 || !buttonLabel || buttonLabel.length > 80) return json(res, 400, { error: 'Uzupełnij tytuł, opis i etykietę przycisku (maks. 80 znaków).'});
          const channel = await guild.channels.fetch(channelId).catch(() => null);
          if (!channel?.isTextBased() || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return json(res, 400, { error: 'Wybierz dostępny kanał tekstowy.' });
          const category = categoryId ? await guild.channels.fetch(categoryId).catch(() => null) : null;
          if (categoryId && category?.type !== ChannelType.GuildCategory) return json(res, 400, { error: 'Wybrana kategoria ticketów jest nieprawidłowa.' });
          const supportRole = supportRoleId ? await guild.roles.fetch(supportRoleId).catch(() => null) : null;
          if (supportRoleId && !supportRole) return json(res, 400, { error: 'Nie znaleziono wybranej roli obsługi.' });
          const botMember = guild.members.me ?? await guild.members.fetchMe();
          const permissions = channel.permissionsFor(botMember);
          if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return json(res, 400, { error: 'Bot potrzebuje uprawnień do wyświetlania kanału, wysyłania wiadomości i osadzania linków.' });
          const payload = {
            embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(description)],
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('strefa:ticket-pro:open').setLabel(buttonLabel).setEmoji('🎫').setStyle(ButtonStyle.Primary))],
            allowedMentions: { parse: [] },
          };
          if (action === 'edit') {
            if (!existing) return json(res, 404, { error: 'Nie znaleziono panelu ticketów.' });
            if (existing.channelId !== channel.id) return json(res, 400, { error: 'Aby zmienić kanał, użyj akcji Przenieś.' });
            const message = await channel.messages.fetch(existing.messageId).catch(() => null);
            if (!message) return json(res, 404, { error: 'Wiadomość panelu nie istnieje. Użyj opcji Wyślij ponownie.' });
            await message.edit(payload);
            const updated = { ...existing, title, description, buttonLabel, categoryId, supportRoleId, channelName: channel.name };
            await featureStore.update(data => { data.tickets.panels = (data.tickets.panels ?? []).map(panel => panel.messageId === existing.messageId ? updated : panel); data.tickets.categoryId = categoryId; data.tickets.supportRoleId = supportRoleId; });
            return json(res, 200, { ok: true, panel: updated });
          }
          if (!['publish', 'duplicate', 'resend', 'move'].includes(action)) return json(res, 400, { error: 'Nieznana akcja panelu.' });
          if (['duplicate', 'resend', 'move'].includes(action) && !existing) return json(res, 404, { error: 'Nie znaleziono panelu ticketów.' });
          const message = await channel.send(payload);
          const created = { messageId: message.id, channelId: channel.id, channelName: channel.name, categoryId, supportRoleId, title, description, buttonLabel, createdAt: new Date().toISOString() };
          if (action === 'move') {
            const oldChannel = await guild.channels.fetch(existing.channelId).catch(() => null);
            const oldMessage = oldChannel?.isTextBased() ? await oldChannel.messages.fetch(existing.messageId).catch(() => null) : null;
            if (oldMessage) {
              try { await oldMessage.delete(); }
              catch (error) { await message.delete().catch(() => {}); throw error; }
            }
          }
          await featureStore.update(data => {
            const panels = data.tickets.panels ?? [];
            data.tickets.panels = action === 'move' ? [...panels.filter(panel => panel.messageId !== existing.messageId), created] : [...panels, created];
            data.tickets.categoryId = categoryId;
            data.tickets.supportRoleId = supportRoleId;
          });
          return json(res, 200, { ok: true, panel: created });
        }
        return json(res, 404, { error: 'Nie znaleziono endpointu.' });
      }

      if (req.method === 'GET' && route === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return fs.createReadStream(path.join(PANEL_DIR, 'index.html')).pipe(res);
      }
      if (req.method === 'GET' && /^\/assets\/[\w.-]+$/.test(route)) {
        const assetName = path.basename(route);
        const assetPath = path.join(PANEL_DIR, 'assets', assetName);
        if (!fs.existsSync(assetPath)) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': assetName.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
        return fs.createReadStream(assetPath).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nie znaleziono strony.');
    } catch (error) {
      console.error('Błąd panelu WWW:', error.message);
      if (!res.headersSent) json(res, 500, { error: 'Błąd panelu WWW. Spróbuj ponownie.' });
      else res.end();
    }
  });

  server.listen(panelPort, PANEL_HOST, () => {
    console.log(`Panel WWW nasłuchuje na ${PANEL_HOST}:${panelPort}`);
    if (!configReady) console.warn('Panel wymaga CLIENT_SECRET oraz losowego PANEL_SESSION_SECRET (min. 32 znaki) w .env.');
  });
  return server;
}
