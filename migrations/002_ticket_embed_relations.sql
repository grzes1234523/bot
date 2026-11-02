CREATE TABLE IF NOT EXISTS ticket_guild_settings (
  guild_id text PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ticket_categories (
  guild_id text NOT NULL,
  category_id text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, category_id)
);
CREATE TABLE IF NOT EXISTS ticket_panels (
  guild_id text NOT NULL,
  message_id text NOT NULL,
  channel_id text NOT NULL,
  config jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, message_id)
);
CREATE TABLE IF NOT EXISTS ticket_records (
  guild_id text NOT NULL,
  ticket_id text NOT NULL,
  channel_id text NOT NULL,
  owner_id text NOT NULL,
  status text NOT NULL,
  category_id text,
  created_at timestamptz NOT NULL,
  closed_at timestamptz,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, ticket_id),
  UNIQUE(guild_id, channel_id)
);
CREATE INDEX IF NOT EXISTS ticket_records_owner_idx ON ticket_records(guild_id, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_records_status_idx ON ticket_records(guild_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS ticket_participants (
  guild_id text NOT NULL,
  ticket_id text NOT NULL,
  user_id text NOT NULL,
  participant_role text NOT NULL DEFAULT 'participant',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, ticket_id, user_id),
  FOREIGN KEY(guild_id, ticket_id) REFERENCES ticket_records(guild_id, ticket_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ticket_events (
  event_id text PRIMARY KEY,
  guild_id text NOT NULL,
  ticket_id text NOT NULL,
  event_type text NOT NULL,
  actor_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(guild_id, ticket_id) REFERENCES ticket_records(guild_id, ticket_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ticket_events_guild_date_idx ON ticket_events(guild_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS ticket_ratings (
  guild_id text NOT NULL,
  ticket_id text NOT NULL,
  rated_by text NOT NULL,
  staff_id text,
  stars smallint NOT NULL CHECK(stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  rated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, ticket_id),
  FOREIGN KEY(guild_id, ticket_id) REFERENCES ticket_records(guild_id, ticket_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ticket_audit_logs (
  log_id text PRIMARY KEY,
  guild_id text NOT NULL,
  ticket_id text,
  actor_id text,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ticket_audit_logs_guild_date_idx ON ticket_audit_logs(guild_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS embed_messages (
  guild_id text NOT NULL,
  message_id text NOT NULL,
  channel_id text NOT NULL,
  author_id text,
  data jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, message_id)
);
CREATE TABLE IF NOT EXISTS embed_versions (
  version_id text PRIMARY KEY,
  guild_id text NOT NULL,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS embed_templates (
  guild_id text NOT NULL,
  template_id text NOT NULL,
  data jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, template_id)
);
CREATE TABLE IF NOT EXISTS embed_schedules (
  guild_id text NOT NULL,
  schedule_id text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, schedule_id)
);
CREATE INDEX IF NOT EXISTS embed_schedules_due_idx ON embed_schedules(status, due_at);

-- Backfill existing JSON document stores without deleting or rewriting them.
DO $$
DECLARE
  doc jsonb;
  item jsonb;
  setting record;
BEGIN
  SELECT payload INTO doc FROM strefa_documents WHERE doc_key='features';
  IF doc IS NULL THEN RETURN; END IF;
  FOR setting IN SELECT key, value FROM jsonb_each(COALESCE(doc->'tickets'->'guildSettings','{}'::jsonb)) LOOP
    INSERT INTO ticket_guild_settings(guild_id,settings) VALUES(setting.key,setting.value) ON CONFLICT DO NOTHING;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'tickets'->'panels','[]'::jsonb)) LOOP
    IF item->>'guildId' IS NOT NULL AND item->>'messageId' IS NOT NULL THEN
      INSERT INTO ticket_panels(guild_id,message_id,channel_id,config) VALUES(item->>'guildId',item->>'messageId',COALESCE(item->>'channelId','unknown'),item) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  FOR setting IN SELECT key, value FROM jsonb_each(COALESCE(doc->'tickets'->'guildSettings','{}'::jsonb)) LOOP
    INSERT INTO ticket_guild_settings(guild_id,settings) VALUES(setting.key,setting.value) ON CONFLICT DO NOTHING;
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(setting.value->'categories','[]'::jsonb)) LOOP
      IF item->>'id' IS NOT NULL AND item->>'name' IS NOT NULL THEN
        INSERT INTO ticket_categories(guild_id,category_id,name,config,active) VALUES(setting.key,item->>'id',item->>'name',item,COALESCE((item->>'active')::boolean,true)) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'tickets'->'items','[]'::jsonb)) LOOP
    IF item->>'guildId' IS NOT NULL AND item->>'id' IS NOT NULL AND item->>'channelId' IS NOT NULL AND item->>'ownerId' IS NOT NULL THEN
      INSERT INTO ticket_records(guild_id,ticket_id,channel_id,owner_id,status,category_id,created_at,closed_at,data)
      VALUES(item->>'guildId',item->>'id',item->>'channelId',item->>'ownerId',COALESCE(item->>'status','open'),item->>'categoryId',COALESCE((item->>'createdAt')::timestamptz,now()),NULLIF(item->>'closedAt','')::timestamptz,item) ON CONFLICT DO NOTHING;
      INSERT INTO ticket_participants(guild_id,ticket_id,user_id,participant_role) VALUES(item->>'guildId',item->>'id',item->>'ownerId','owner') ON CONFLICT DO NOTHING;
      IF jsonb_typeof(item->'participantIds')='array' THEN
        INSERT INTO ticket_participants(guild_id,ticket_id,user_id,participant_role) SELECT item->>'guildId',item->>'id',participant.value,'participant' FROM jsonb_array_elements_text(item->'participantIds') participant(value) ON CONFLICT DO NOTHING;
      END IF;
      IF jsonb_typeof(item->'events')='array' THEN
        INSERT INTO ticket_events(event_id,guild_id,ticket_id,event_type,actor_id,occurred_at,data)
        SELECT concat_ws(':',item->>'guildId',item->>'id',event.value->>'type',event.value->>'at',COALESCE(event.value->>'by',''),COALESCE(event.value->>'to','')),item->>'guildId',item->>'id',COALESCE(event.value->>'type','event'),event.value->>'by',COALESCE((event.value->>'at')::timestamptz,now()),event.value
        FROM jsonb_array_elements(item->'events') event(value) ON CONFLICT DO NOTHING;
      END IF;
      IF jsonb_typeof(item->'rating')='object' AND (item->'rating'->>'stars') IS NOT NULL THEN
        INSERT INTO ticket_ratings(guild_id,ticket_id,rated_by,staff_id,stars,comment,rated_at) VALUES(item->>'guildId',item->>'id',COALESCE(item->'rating'->>'ratedBy',item->>'ownerId'),item->'rating'->>'staffId',(item->'rating'->>'stars')::smallint,COALESCE(item->'rating'->>'comment',''),COALESCE((item->'rating'->>'ratedAt')::timestamptz,now())) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'tickets'->'auditLogs','[]'::jsonb)) LOOP
    IF item->>'id' IS NOT NULL AND item->>'guildId' IS NOT NULL THEN
      INSERT INTO ticket_audit_logs(log_id,guild_id,ticket_id,actor_id,action,occurred_at,details) VALUES(item->>'id',item->>'guildId',item->>'ticketId',item->>'actorId',COALESCE(item->>'action','operacja'),COALESCE((item->>'at')::timestamptz,now()),COALESCE(item->'details','{}'::jsonb)) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'embeds'->'messages','[]'::jsonb)) LOOP
    IF item->>'guildId' IS NOT NULL AND item->>'messageId' IS NOT NULL AND item->>'channelId' IS NOT NULL THEN
      INSERT INTO embed_messages(guild_id,message_id,channel_id,author_id,data) VALUES(item->>'guildId',item->>'messageId',item->>'channelId',item->>'authorId',item) ON CONFLICT DO NOTHING;
      IF jsonb_typeof(item->'versions')='array' THEN
        INSERT INTO embed_versions(version_id,guild_id,message_id,created_at,data)
        SELECT concat_ws(':',item->>'guildId',item->>'messageId',COALESCE(version.value->>'version',version.value->>'at',length(version.value::text)::text)),item->>'guildId',item->>'messageId',COALESCE((version.value->>'at')::timestamptz,now()),version.value
        FROM jsonb_array_elements(item->'versions') version(value) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'embeds'->'templates','[]'::jsonb)) LOOP
    IF item->>'guildId' IS NOT NULL AND item->>'id' IS NOT NULL THEN
      INSERT INTO embed_templates(guild_id,template_id,data,active) VALUES(item->>'guildId',item->>'id',item,COALESCE((item->>'active')::boolean,true)) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(doc->'embeds'->'scheduled','[]'::jsonb)) LOOP
    IF item->>'guildId' IS NOT NULL AND item->>'id' IS NOT NULL THEN
      INSERT INTO embed_schedules(guild_id,schedule_id,due_at,status,data) VALUES(item->>'guildId',item->>'id',COALESCE((item->>'dueAt')::timestamptz,now()),COALESCE(item->>'status','pending'),item) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
