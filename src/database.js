import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
let poolPromise;

async function applyMigrations(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS strefa_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await fs.readdir(migrationsPath)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
  for (const name of files) {
    const { rowCount } = await pool.query('SELECT 1 FROM strefa_schema_migrations WHERE name = $1', [name]);
    if (rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsPath, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO strefa_schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migracja ${name} nie powiodła się: ${error.message}`, { cause: error });
    } finally { client.release(); }
  }
}

async function syncRelationalFeatures(connection, state) {
  const tickets = state.tickets ?? {};
  const embeds = state.embeds ?? {};
  const settings = Object.entries(tickets.guildSettings ?? {}).map(([guildId, config]) => ({guildId, config}));
  const categories = settings.flatMap(({guildId,config}) => (config.categories ?? []).map(category => ({guildId, id:category.id, name:category.name, config:category, active:category.active !== false})));
  const panels = (tickets.panels ?? []).filter(item => item.guildId && item.messageId).map(item => ({...item, active:item.active !== false}));
  const records = (tickets.items ?? []).filter(item => item.guildId && item.id && item.channelId && item.ownerId).map(item => ({...item, status:item.status ?? 'open', createdAt:item.createdAt ?? new Date().toISOString()}));
  const events = records.flatMap(ticket => (ticket.events ?? []).map(event => ({
    eventId:`${ticket.guildId}:${ticket.id}:${event.type}:${event.at}:${event.by ?? ''}:${event.to ?? ''}`,
    guildId:ticket.guildId,ticketId:ticket.id,eventType:event.type ?? 'event',actorId:event.by ?? null,
    occurredAt:event.at ?? ticket.createdAt,data:event,
  })));
  const participants = records.flatMap(ticket => [...new Set([ticket.ownerId,...(ticket.participantIds ?? [])].filter(Boolean))].map(userId => ({guildId:ticket.guildId,ticketId:ticket.id,userId,role:userId===ticket.ownerId?'owner':'participant'})));
  const ratings = records.filter(ticket => ticket.rating?.stars).map(ticket => ({guildId:ticket.guildId,ticketId:ticket.id,ratedBy:ticket.rating.ratedBy ?? ticket.ownerId,staffId:ticket.rating.staffId ?? null,stars:ticket.rating.stars,comment:ticket.rating.comment ?? '',ratedAt:ticket.rating.ratedAt ?? new Date().toISOString()}));
  const messages = (embeds.messages ?? []).filter(item => item.guildId && item.messageId && item.channelId).map(item => ({...item, active:item.active !== false}));
  const versions = messages.flatMap(item => (item.versions ?? []).map(version => ({versionId:`${item.guildId}:${item.messageId}:${version.version ?? version.at ?? JSON.stringify(version).length}`,guildId:item.guildId,messageId:item.messageId,createdAt:version.at ?? new Date().toISOString(),data:version})));
  const templates = (embeds.templates ?? []).filter(item => item.guildId && item.id).map(item => ({...item, active:item.active !== false}));
  const schedules = (embeds.scheduled ?? []).filter(item => item.guildId && item.id).map(item => ({...item,dueAt:item.dueAt ?? new Date().toISOString(),status:item.status ?? 'pending'}));
  const logs = (tickets.auditLogs ?? []).filter(item => item.id && item.guildId).map(item => ({...item,at:item.at ?? new Date().toISOString(),details:item.details ?? {}}));
  // Each projection is bulk-upserted inside the document transaction, avoiding N+1 queries.
  const bulk = async (sql, rows) => { if (rows.length) await connection.query(sql, [JSON.stringify(rows)]); };
  await bulk(`INSERT INTO ticket_guild_settings(guild_id,settings) SELECT x.guild_id,x.settings FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,settings jsonb) ON CONFLICT(guild_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`, settings.map(x=>({guild_id:x.guildId,settings:x.config})));
  if (settings.length) await connection.query('UPDATE ticket_categories SET active=false,updated_at=now() WHERE guild_id=ANY($1::text[])',[settings.map(x=>x.guildId)]);
  await bulk(`INSERT INTO ticket_categories(guild_id,category_id,name,config,active) SELECT x.guild_id,x.category_id,x.name,x.config,x.active FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,category_id text,name text,config jsonb,active boolean) ON CONFLICT(guild_id,category_id) DO UPDATE SET name=EXCLUDED.name,config=EXCLUDED.config,active=EXCLUDED.active,updated_at=now()`,categories.map(x=>({guild_id:x.guildId,category_id:x.id,name:x.name,config:x.config,active:x.active})));
  await bulk(`INSERT INTO ticket_panels(guild_id,message_id,channel_id,config,active) SELECT x.guild_id,x.message_id,x.channel_id,x.config,x.active FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,message_id text,channel_id text,config jsonb,active boolean) ON CONFLICT(guild_id,message_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,config=EXCLUDED.config,active=EXCLUDED.active,updated_at=now()`,panels.map(x=>({guild_id:x.guildId,message_id:x.messageId,channel_id:x.channelId,config:x,active:x.active})));
  await bulk(`INSERT INTO ticket_records(guild_id,ticket_id,channel_id,owner_id,status,category_id,created_at,closed_at,data) SELECT x.guild_id,x.ticket_id,x.channel_id,x.owner_id,x.status,x.category_id,x.created_at,x.closed_at,x.data FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,ticket_id text,channel_id text,owner_id text,status text,category_id text,created_at timestamptz,closed_at timestamptz,data jsonb) ON CONFLICT(guild_id,ticket_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,owner_id=EXCLUDED.owner_id,status=EXCLUDED.status,category_id=EXCLUDED.category_id,closed_at=EXCLUDED.closed_at,data=EXCLUDED.data,updated_at=now()`,records.map(x=>({guild_id:x.guildId,ticket_id:x.id,channel_id:x.channelId,owner_id:x.ownerId,status:x.status,category_id:x.categoryId??null,created_at:x.createdAt,closed_at:x.closedAt??null,data:x})));
  await bulk(`INSERT INTO ticket_events(event_id,guild_id,ticket_id,event_type,actor_id,occurred_at,data) SELECT x.event_id,x.guild_id,x.ticket_id,x.event_type,x.actor_id,x.occurred_at,x.data FROM jsonb_to_recordset($1::jsonb) AS x(event_id text,guild_id text,ticket_id text,event_type text,actor_id text,occurred_at timestamptz,data jsonb) ON CONFLICT(event_id) DO NOTHING`,events.map(x=>({event_id:x.eventId,guild_id:x.guildId,ticket_id:x.ticketId,event_type:x.eventType,actor_id:x.actorId,occurred_at:x.occurredAt,data:x.data})));
  await bulk(`INSERT INTO ticket_participants(guild_id,ticket_id,user_id,participant_role) SELECT x.guild_id,x.ticket_id,x.user_id,x.participant_role FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,ticket_id text,user_id text,participant_role text) ON CONFLICT(guild_id,ticket_id,user_id) DO UPDATE SET participant_role=EXCLUDED.participant_role`,participants.map(x=>({guild_id:x.guildId,ticket_id:x.ticketId,user_id:x.userId,participant_role:x.role})));
  await bulk(`INSERT INTO ticket_ratings(guild_id,ticket_id,rated_by,staff_id,stars,comment,rated_at) SELECT x.guild_id,x.ticket_id,x.rated_by,x.staff_id,x.stars,x.comment,x.rated_at FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,ticket_id text,rated_by text,staff_id text,stars smallint,comment text,rated_at timestamptz) ON CONFLICT(guild_id,ticket_id) DO UPDATE SET rated_by=EXCLUDED.rated_by,staff_id=EXCLUDED.staff_id,stars=EXCLUDED.stars,comment=EXCLUDED.comment,rated_at=EXCLUDED.rated_at`,ratings.map(x=>({guild_id:x.guildId,ticket_id:x.ticketId,rated_by:x.ratedBy,staff_id:x.staffId,stars:x.stars,comment:x.comment,rated_at:x.ratedAt})));
  await bulk(`INSERT INTO embed_messages(guild_id,message_id,channel_id,author_id,data,active) SELECT x.guild_id,x.message_id,x.channel_id,x.author_id,x.data,x.active FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,message_id text,channel_id text,author_id text,data jsonb,active boolean) ON CONFLICT(guild_id,message_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,author_id=EXCLUDED.author_id,data=EXCLUDED.data,active=EXCLUDED.active,updated_at=now()`,messages.map(x=>({guild_id:x.guildId,message_id:x.messageId,channel_id:x.channelId,author_id:x.authorId??null,data:x,active:x.active})));
  await bulk(`INSERT INTO embed_versions(version_id,guild_id,message_id,created_at,data) SELECT x.version_id,x.guild_id,x.message_id,x.created_at,x.data FROM jsonb_to_recordset($1::jsonb) AS x(version_id text,guild_id text,message_id text,created_at timestamptz,data jsonb) ON CONFLICT(version_id) DO NOTHING`,versions.map(x=>({version_id:x.versionId,guild_id:x.guildId,message_id:x.messageId,created_at:x.createdAt,data:x.data})));
  await bulk(`INSERT INTO embed_templates(guild_id,template_id,data,active) SELECT x.guild_id,x.template_id,x.data,x.active FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,template_id text,data jsonb,active boolean) ON CONFLICT(guild_id,template_id) DO UPDATE SET data=EXCLUDED.data,active=EXCLUDED.active,updated_at=now()`,templates.map(x=>({guild_id:x.guildId,template_id:x.id,data:x,active:x.active})));
  await bulk(`INSERT INTO embed_schedules(guild_id,schedule_id,due_at,status,data) SELECT x.guild_id,x.schedule_id,x.due_at,x.status,x.data FROM jsonb_to_recordset($1::jsonb) AS x(guild_id text,schedule_id text,due_at timestamptz,status text,data jsonb) ON CONFLICT(guild_id,schedule_id) DO UPDATE SET due_at=EXCLUDED.due_at,status=EXCLUDED.status,data=EXCLUDED.data,updated_at=now()`,schedules.map(x=>({guild_id:x.guildId,schedule_id:x.id,due_at:x.dueAt,status:x.status,data:x})));
  await bulk(`INSERT INTO ticket_audit_logs(log_id,guild_id,ticket_id,actor_id,action,occurred_at,details) SELECT x.log_id,x.guild_id,x.ticket_id,x.actor_id,x.action,x.occurred_at,x.details FROM jsonb_to_recordset($1::jsonb) AS x(log_id text,guild_id text,ticket_id text,actor_id text,action text,occurred_at timestamptz,details jsonb) ON CONFLICT(log_id) DO NOTHING`,logs.map(x=>({log_id:x.id,guild_id:x.guildId,ticket_id:x.ticketId??null,actor_id:x.actorId??null,action:x.action,occurred_at:x.at,details:x.details})));
}

async function getPool() {
  if (!process.env.DATABASE_URL?.trim()) {
    if (process.env.REQUIRE_DATABASE === 'true') throw new Error('Ta usługa wymaga ustawienia DATABASE_URL.');
    return null;
  }
  poolPromise ??= (async () => {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', error => console.error('Błąd bezczynnego połączenia PostgreSQL:', error.message));
    await applyMigrations(pool);
    return pool;
  })();
  return poolPromise;
}

export async function databaseEnabled() { return Boolean(await getPool()); }

export async function runMigrations() {
  const pool = await getPool();
  if (!pool) throw new Error('Ustaw DATABASE_URL przed uruchomieniem migracji.');
  await applyMigrations(pool);
  return true;
}

export async function loadDocument(key, initialValue) {
  const pool = await getPool();
  if (!pool) return null;
  const json = JSON.stringify(initialValue);
  await pool.query('INSERT INTO strefa_documents (doc_key, payload) VALUES ($1, $2::jsonb) ON CONFLICT (doc_key) DO NOTHING', [key, json]);
  const { rows } = await pool.query('SELECT payload FROM strefa_documents WHERE doc_key = $1', [key]);
  return rows[0]?.payload ?? initialValue;
}

export async function updateDocument(key, initialValue, change) {
  const pool = await getPool();
  if (!pool) return null;
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('INSERT INTO strefa_documents (doc_key, payload) VALUES ($1, $2::jsonb) ON CONFLICT (doc_key) DO NOTHING', [key, JSON.stringify(initialValue)]);
    const { rows } = await connection.query('SELECT payload FROM strefa_documents WHERE doc_key = $1 FOR UPDATE', [key]);
    const state = structuredClone(rows[0]?.payload ?? initialValue);
    const result = await change(state);
    await connection.query('UPDATE strefa_documents SET payload = $2::jsonb, updated_at = now() WHERE doc_key = $1', [key, JSON.stringify(state)]);
    if (key === 'features') await syncRelationalFeatures(connection, state);
    await connection.query('COMMIT');
    return { state, result };
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { connection.release(); }
}

export async function refreshDocument(key) {
  const pool = await getPool();
  if (!pool) return null;
  const { rows } = await pool.query('SELECT payload FROM strefa_documents WHERE doc_key = $1', [key]);
  return rows[0]?.payload ?? null;
}

export async function closeDatabase() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  await pool?.end();
  poolPromise = null;
}
