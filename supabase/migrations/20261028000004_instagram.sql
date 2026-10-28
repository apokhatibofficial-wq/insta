-- KHATIB platform — Phase 4: Instagram (Instagram API with Instagram Login)
-- OAuth state, encrypted tokens, media sync, webhook idempotency and the
-- automation decision (matching + precedence + cooldown) in one transaction.
-- Network calls to Meta happen in the server; every decision happens here.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

-- One Instagram account can be linked to one active client only.
create unique index ig_connections_ig_user_unique on public.ig_connections (ig_user_id)
  where ig_user_id is not null;

alter table public.ig_posts
  add column media_url text,
  add column media_product_type text;

-- OAuth `state`: single use, 10 minutes, bound to the client session that started it.
create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash bytea not null unique,
  client_id uuid not null references public.clients (id) on delete cascade,
  session_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);
alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;
create policy oauth_states_service_role on public.oauth_states for all to service_role using (true) with check (true);
revoke all on public.oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.oauth_states to service_role;

-- Private messages are limited by Meta to 1000 UTF-8 bytes; the DM is sent
-- as text + newline + link, so the limit covers both. Applies to every path.
create function app_private.check_rule_limits() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if octet_length(coalesce(new.dm_text, '') ||
                  case when new.link_url is not null then E'\n' || new.link_url else '' end) > 1000 then
    raise exception 'invalid_input';
  end if;
  return new;
end $$;
create trigger rules_limits before insert or update on public.rules
  for each row execute function app_private.check_rule_limits();

-- ---------------------------------------------------------------------------
-- OAuth state
-- ---------------------------------------------------------------------------
create function public.oauth_state_create(p_session_hash bytea, p_state_hash bytea) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare v_client uuid := app_private.session_client(p_session_hash);
begin
  if not app_private.client_can_edit(v_client) then raise exception 'read_only'; end if;
  delete from public.oauth_states where expires_at < now() - interval '1 day';
  insert into public.oauth_states (state_hash, client_id, session_hash)
  values (p_state_hash, v_client, p_session_hash);
  return v_client;
end $$;

-- Returns the client id when the state is valid, unused, unexpired and was
-- created by this same session; otherwise null. Single use.
create function public.oauth_state_consume(p_session_hash bytea, p_state_hash bytea) returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare v_client uuid;
begin
  update public.oauth_states
     set used_at = now()
   where state_hash = p_state_hash and session_hash = p_session_hash
     and used_at is null and expires_at > now()
  returning client_id into v_client;
  return v_client;
end $$;

-- ---------------------------------------------------------------------------
-- Connection & tokens (service_role only)
-- ---------------------------------------------------------------------------
create function public.client_ig_connect(
  p_client_id uuid, p_ig_user_id text, p_username text,
  p_token_ciphertext bytea, p_token_iv bytea, p_token_expires_at timestamptz
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
begin
  if p_ig_user_id is null or p_ig_user_id !~ '^[0-9]{5,30}$' then raise exception 'invalid_input'; end if;
  if exists (select 1 from public.ig_connections
             where ig_user_id = p_ig_user_id and client_id <> p_client_id) then
    raise exception 'ig_account_in_use';
  end if;
  update public.ig_connections
     set ig_user_id = p_ig_user_id, username = left(p_username, 60), status = 'ok',
         token_ciphertext = p_token_ciphertext, token_iv = p_token_iv,
         token_expires_at = p_token_expires_at, updated_at = now()
   where client_id = p_client_id;
  if not found then raise exception 'not_found'; end if;
  insert into public.events (client_id, kind, code, data)
  values (p_client_id, 'set', 'ig.connected', jsonb_build_object('username', left(p_username, 60)));
  perform app_private.audit('client', null, p_client_id, 'automation.ig_connected',
    jsonb_build_object('username', left(p_username, 60)));
  return jsonb_build_object('ok', true);
end $$;

create function public.ig_token_get(p_client_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'client_id', i.client_id, 'ig_user_id', i.ig_user_id, 'status', i.status,
    'token_ciphertext', encode(i.token_ciphertext, 'base64'),
    'token_iv', encode(i.token_iv, 'base64'),
    'token_expires_at', i.token_expires_at, 'updated_at', i.updated_at)
  from public.ig_connections i
  where i.client_id = p_client_id and i.token_ciphertext is not null
$$;

-- Long-lived tokens: refresh when older than 24h and expiring within 10 days.
create function public.ig_tokens_due_refresh() returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(i.client_id), '[]'::jsonb)
  from public.ig_connections i
  where i.status = 'ok' and i.token_ciphertext is not null
    and i.token_expires_at < now() + interval '10 days'
    and i.updated_at < now() - interval '24 hours'
$$;

create function public.ig_token_update(
  p_client_id uuid, p_token_ciphertext bytea, p_token_iv bytea, p_token_expires_at timestamptz
) returns void
language sql volatile
set search_path = ''
as $$
  update public.ig_connections
     set token_ciphertext = p_token_ciphertext, token_iv = p_token_iv,
         token_expires_at = p_token_expires_at, updated_at = now()
   where client_id = p_client_id and status = 'ok'
$$;

-- Meta rejected the token: stop the bot, tell the client, keep everything else.
create function public.ig_mark_needs_reconnect(p_client_id uuid) returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  update public.ig_connections
     set status = 'needs_reconnect', token_ciphertext = null, token_iv = null, updated_at = now()
   where client_id = p_client_id and status = 'ok';
  if found then
    insert into public.events (client_id, kind, code, data) values (p_client_id, 'fail', 'ig.reconnect_needed', '{}');
    perform app_private.audit('system', null, p_client_id, 'automation.ig_token_rejected', '{}');
  end if;
end $$;

create function public.ig_connected_clients() returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(i.client_id), '[]'::jsonb)
  from public.ig_connections i join public.clients c on c.id = i.client_id
  where i.status = 'ok' and c.status = 'active'
$$;

-- ---------------------------------------------------------------------------
-- Media sync
-- ---------------------------------------------------------------------------
create function public.ig_posts_upsert(p_client_id uuid, p_items jsonb) returns int
language plpgsql volatile
set search_path = ''
as $$
declare v_n int;
begin
  insert into public.ig_posts as p
    (client_id, ig_media_id, caption, media_type, media_product_type, permalink, thumbnail_url, media_url,
     posted_at, comments_count, synced_at)
  select p_client_id, x ->> 'id', left(x ->> 'caption', 2200), x ->> 'media_type', x ->> 'media_product_type',
         x ->> 'permalink', x ->> 'thumbnail_url', x ->> 'media_url',
         (x ->> 'timestamp')::timestamptz, coalesce((x ->> 'comments_count')::int, 0), now()
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x
  where x ->> 'id' ~ '^[0-9]{5,40}$'
  on conflict (ig_media_id) do update
    set caption = excluded.caption, media_type = excluded.media_type,
        media_product_type = excluded.media_product_type, permalink = excluded.permalink,
        thumbnail_url = excluded.thumbnail_url, media_url = excluded.media_url,
        posted_at = excluded.posted_at, comments_count = excluded.comments_count, synced_at = now()
    where p.client_id = excluded.client_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Webhook idempotency
-- ---------------------------------------------------------------------------
-- true the first time a key is seen, false for duplicates/retries.
create function public.webhook_first_seen(p_key text) returns boolean
language plpgsql volatile
set search_path = ''
as $$
begin
  insert into public.processed_webhooks (event_key) values (left(p_key, 200));
  return true;
exception when unique_violation then
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- The automation decision for one incoming comment.
-- ---------------------------------------------------------------------------
create function public.automation_decide(
  p_account_id text, p_media_id text, p_from_id text, p_from_username text,
  p_comment_id text, p_text text
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_client uuid;
  v_post uuid;
  v_caption text;
  v_norm text := app_private.norm_keyword(coalesce(p_text, ''));
  v_rule record;
  v_cooldown int;
  v_last timestamptz;
  v_excerpt text := left(coalesce(p_text, ''), 120);
  v_user text := left(coalesce(p_from_username, ''), 60);
  v_ig record;
begin
  select i.client_id, i.ig_user_id, i.token_ciphertext, i.token_iv into v_ig
  from public.ig_connections i where i.ig_user_id = p_account_id and i.status = 'ok';
  if not found then return jsonb_build_object('action', 'ignore', 'reason', 'unknown_account'); end if;
  v_client := v_ig.client_id;

  -- Never answer the account's own comments (this includes the bot's replies).
  if p_from_id is null or p_from_id = p_account_id then
    return jsonb_build_object('action', 'ignore', 'reason', 'own');
  end if;
  -- The single gate: subscription, account, admin, client switch, global stop.
  if not public.can_automate(v_client) then
    return jsonb_build_object('action', 'ignore', 'reason', 'blocked');
  end if;
  if v_norm = '' then return jsonb_build_object('action', 'ignore', 'reason', 'no_match'); end if;

  select p.id, p.caption into v_post, v_caption
  from public.ig_posts p where p.ig_media_id = p_media_id and p.client_id = v_client;

  -- Post-specific rules win over general rules; within a group the keyword
  -- that appears earliest in the comment wins.
  select r.id, r.public_reply, r.dm_text, r.link_url, k.keyword into v_rule
  from public.rules r
  join public.rule_keywords k on k.rule_id = r.id
  where r.client_id = v_client and r.enabled
    and strpos(v_norm, k.keyword_norm) > 0
    and (r.scope = 'all' or (v_post is not null and exists (
          select 1 from public.rule_posts rp where rp.rule_id = r.id and rp.post_id = v_post)))
  order by (r.scope = 'posts') desc, strpos(v_norm, k.keyword_norm), r.updated_at desc
  limit 1;
  if not found then return jsonb_build_object('action', 'ignore', 'reason', 'no_match'); end if;

  -- Safety ceiling per account (protects against Meta restrictions / loops).
  if (select count(*) from public.events e where e.client_id = v_client and e.kind = 'reply'
        and e.created_at > now() - interval '1 hour') >= 200 then
    if not exists (select 1 from public.events e where e.client_id = v_client and e.code = 'rate.limited'
                     and e.created_at > now() - interval '1 hour') then
      insert into public.events (client_id, kind, code, data) values (v_client, 'fail', 'rate.limited', '{}');
    end if;
    return jsonb_build_object('action', 'skip', 'reason', 'rate');
  end if;

  -- Cooldown per commenter (row lock serialises concurrent comments).
  select b.cooldown_hours into v_cooldown from public.bot_settings b where b.client_id = v_client;
  insert into public.reply_ledger (client_id, ig_user_id, last_reply_at)
  values (v_client, p_from_id, '-infinity') on conflict do nothing;
  select l.last_reply_at into v_last from public.reply_ledger l
  where l.client_id = v_client and l.ig_user_id = p_from_id for update;
  if v_last > now() - make_interval(hours => coalesce(v_cooldown, 24)) then
    insert into public.events (client_id, kind, code, data, rule_id, post_id)
    values (v_client, 'skip', 'reply.cooldown',
            jsonb_build_object('username', v_user, 'excerpt', v_excerpt, 'hours', v_cooldown, 'post', left(v_caption, 80)),
            v_rule.id, v_post);
    return jsonb_build_object('action', 'skip', 'reason', 'cooldown');
  end if;
  update public.reply_ledger set last_reply_at = now()
   where client_id = v_client and ig_user_id = p_from_id;

  return jsonb_build_object(
    'action', 'reply',
    'client_id', v_client,
    'rule_id', v_rule.id,
    'post_id', v_post,
    'post_caption', left(v_caption, 80),
    'keyword', v_rule.keyword,
    'public_reply', v_rule.public_reply,
    'dm_text', v_rule.dm_text,
    'link_url', v_rule.link_url,
    'ig_user_id', v_ig.ig_user_id,
    'token_ciphertext', encode(v_ig.token_ciphertext, 'base64'),
    'token_iv', encode(v_ig.token_iv, 'base64'),
    'username', v_user,
    'excerpt', v_excerpt);
end $$;

-- Records what happened after the server talked to Meta.
create function public.automation_record(
  p_client_id uuid, p_rule_id uuid, p_post_id uuid, p_kind text, p_code text, p_data jsonb
) returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  if p_kind not in ('reply', 'fail', 'skip') then raise exception 'invalid_input'; end if;
  insert into public.events (client_id, kind, code, data, rule_id, post_id)
  values (p_client_id, p_kind, left(p_code, 60), coalesce(p_data, '{}'::jsonb), p_rule_id, p_post_id);
end $$;

-- Disconnect now returns what the server needs to unsubscribe at Meta first.
create or replace function public.client_ig_disconnect(p_session_hash bytea) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_id uuid := app_private.session_client(p_session_hash);
begin
  update public.ig_connections
     set status = 'none', token_ciphertext = null, token_iv = null, token_expires_at = null,
         ig_user_id = null, username = null, updated_at = now()
   where client_id = v_id;
  insert into public.events (client_id, kind, code, data) values (v_id, 'set', 'ig.disconnected', '{}');
  perform app_private.audit('client', null, v_id, 'automation.ig_disconnected', '{}');
  return jsonb_build_object('ok', true, 'client_id', v_id);
end $$;

-- client_me exposes the connection date for the dashboard.
create or replace function public.client_me() returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid := public.auth_client_id();
  v_c record;
begin
  if v_id is null then raise exception 'client_auth_required'; end if;
  select c.id, c.public_id, c.name into v_c from public.clients c where c.id = v_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'id', v_c.id, 'public_id', v_c.public_id, 'name', v_c.name,
    'subscription', app_private.sub_summary(v_c.id),
    'ig', (select jsonb_build_object('status', i.status, 'username', i.username, 'updated_at', i.updated_at)
           from public.ig_connections i where i.client_id = v_c.id),
    'bot', (select jsonb_build_object('client_enabled', b.client_enabled)
            from public.bot_settings b where b.client_id = v_c.id));
end $$;

-- client_rules_get returns thumbnails/permalinks now.
create or replace function public.client_rules_get() returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare v_id uuid := public.auth_client_id();
begin
  if v_id is null then raise exception 'client_auth_required'; end if;
  return jsonb_build_object(
    'can_edit', app_private.client_can_edit(v_id),
    'cooldown_hours', (select b.cooldown_hours from public.bot_settings b where b.client_id = v_id),
    'rules', coalesce((select jsonb_agg(app_private.rule_json(r.id) order by r.updated_at desc)
                       from public.rules r where r.client_id = v_id), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'caption', coalesce(p.caption, ''), 'media_type', p.media_type,
               'posted_at', p.posted_at, 'comments_count', p.comments_count,
               'image', coalesce(p.thumbnail_url, case when p.media_type <> 'VIDEO' then p.media_url end),
               'permalink', p.permalink,
               'replied', (select count(*) from public.events e where e.post_id = p.id and e.kind = 'reply'))
             order by p.posted_at desc nulls last)
      from (select * from public.ig_posts p where p.client_id = v_id
            order by p.posted_at desc nulls last limit 60) p), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app_private to service_role;

grant execute on function public.auth_client_id() to authenticated;
grant execute on function public.client_me() to authenticated;
grant execute on function public.client_dashboard() to authenticated;
grant execute on function public.client_rules_get() to authenticated;
grant execute on function public.client_rule_save(uuid, boolean, text, uuid[], text[], text, text, text) to authenticated;
grant execute on function public.client_rule_delete(uuid) to authenticated;
grant execute on function public.client_set_cooldown(int) to authenticated;
grant execute on function public.client_set_bot_enabled(boolean) to authenticated;
grant execute on function public.client_activity(int) to authenticated;
grant execute on function app_private.sub_summary(uuid) to authenticated;
grant execute on function app_private.today() to authenticated;
grant execute on function app_private.norm_keyword(text) to authenticated;
grant execute on function app_private.keyword_clashes(uuid) to authenticated;
grant execute on function app_private.keyword_clashes_for(uuid, uuid, text, uuid[], text[]) to authenticated;
grant execute on function app_private.enforce_keyword_uniqueness() to authenticated;
grant execute on function app_private.set_keyword_norm() to authenticated;
grant execute on function app_private.check_rule_limits() to authenticated;
grant execute on function app_private.global_stop() to authenticated;
grant execute on function app_private.client_event(text, text, jsonb) to authenticated;
grant execute on function app_private.client_can_edit(uuid) to authenticated;
grant execute on function app_private.require_client_edit() to authenticated;
grant execute on function app_private.rule_json(uuid) to authenticated;
