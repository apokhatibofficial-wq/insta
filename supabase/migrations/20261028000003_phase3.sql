-- KHATIB platform — Phase 3: rules & keywords, client activity, account
-- settings, admin bots/audit/subscriptions views, global emergency stop and
-- the daily maintenance job (expiry + 180-day retention).

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------

-- Global emergency stop (single row).
create table public.app_settings (
  id boolean primary key default true check (id),
  global_stop boolean not null default false,
  global_stop_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;
create policy app_settings_service_role on public.app_settings for all to service_role using (true) with check (true);
revoke all on public.app_settings from public, anon, authenticated;
grant select, update on public.app_settings to service_role;

-- Client-visible events are stored as a code + data and rendered in the UI,
-- so wording stays in one place (and never contains secrets).
alter table public.events alter column summary drop not null;
alter table public.events
  add column code text check (char_length(code) <= 60),
  add column data jsonb not null default '{}'::jsonb,
  add column rule_id uuid references public.rules (id) on delete set null,
  add column post_id uuid references public.ig_posts (id) on delete set null;
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('reply', 'skip', 'fail', 'set', 'sys'));
create index events_client_kind_idx on public.events (client_id, kind, created_at desc);

-- Keyword order as the client typed them.
alter table public.rule_keywords add column ord smallint not null default 0;

-- Comment counts are filled from the Instagram API in Phase 4.
alter table public.ig_posts add column comments_count int not null default 0;

-- Bookkeeping for the daily job (idempotency).
alter table public.clients
  add column expiry_processed_for date,
  add column retention_warned_for date;

-- Clients read their own posts' new column too, and set their own cooldown
-- (RLS limits the row; the CHECK constraint limits the value to 1/6/24).
grant select on public.ig_posts to authenticated;
grant update (cooldown_hours) on public.bot_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Keyword normalisation — the single definition. lib/keywords.ts mirrors it
-- for the editor and tests assert both agree.
-- strip tashkeel (U+064B–U+065F, U+0670); أ إ آ → ا ; ى → ي ; ة → ه ; lower case.
-- ---------------------------------------------------------------------------
create function app_private.norm_keyword(p text) returns text
language sql immutable
set search_path = ''
as $$
  select translate(
    regexp_replace(lower(btrim(coalesce(p, ''))), '[ً-ٰٟ]', '', 'g'),
    'أإآىة', 'ااايه')
$$;

-- Words that appear in two rules whose scopes overlap (both general, or both
-- post-specific and sharing a post). Disabled rules count too.
create function app_private.keyword_clashes(p_client_id uuid) returns text[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct a.keyword_norm), '{}')
  from public.rule_keywords a
  join public.rule_keywords b
    on b.client_id = a.client_id and b.keyword_norm = a.keyword_norm and b.rule_id > a.rule_id
  join public.rules ra on ra.id = a.rule_id
  join public.rules rb on rb.id = b.rule_id
  where a.client_id = p_client_id
    and (
      (ra.scope = 'all' and rb.scope = 'all')
      or (ra.scope = 'posts' and rb.scope = 'posts' and exists (
            select 1 from public.rule_posts pa
            join public.rule_posts pb on pb.post_id = pa.post_id
            where pa.rule_id = ra.id and pb.rule_id = rb.id))
    )
$$;

-- Backstop: checked at commit for any write path, not only client_rule_save().
create function app_private.enforce_keyword_uniqueness() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if cardinality(app_private.keyword_clashes(new.client_id)) > 0 then
    raise exception 'keyword_clash';
  end if;
  return null;
end $$;

create constraint trigger rule_keywords_unique_in_scope
  after insert or update on public.rule_keywords
  deferrable initially deferred
  for each row execute function app_private.enforce_keyword_uniqueness();
create constraint trigger rule_posts_unique_in_scope
  after insert or update on public.rule_posts
  deferrable initially deferred
  for each row execute function app_private.enforce_keyword_uniqueness();
create constraint trigger rules_unique_in_scope
  after update of scope on public.rules
  deferrable initially deferred
  for each row execute function app_private.enforce_keyword_uniqueness();

-- keyword_norm is always derived on the server.
create function app_private.set_keyword_norm() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.keyword := btrim(new.keyword);
  new.keyword_norm := app_private.norm_keyword(new.keyword);
  return new;
end $$;
create trigger rule_keywords_norm before insert or update on public.rule_keywords
  for each row execute function app_private.set_keyword_norm();

-- ---------------------------------------------------------------------------
-- Bot state now includes the global emergency stop.
-- ---------------------------------------------------------------------------
create or replace function app_private.bot_state(p_client_id uuid) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_bot public.bot_settings%rowtype;
  v_ig public.ig_status;
  v_sub text;
begin
  select * into v_client from public.clients where id = p_client_id;
  if not found then return null; end if;
  select * into v_bot from public.bot_settings where client_id = p_client_id;
  select status into v_ig from public.ig_connections where client_id = p_client_id;
  v_sub := app_private.sub_summary(p_client_id) ->> 'state';

  if v_client.status <> 'active' then return 'disabled'; end if;
  if v_sub = 'paused' then return 'sub_paused'; end if;
  if v_sub <> 'active' then return 'sub_expired'; end if;
  if not coalesce(v_bot.admin_allowed, false) then return 'admin'; end if;
  if coalesce(v_ig, 'none') = 'none' then return 'wait'; end if;
  if v_ig = 'needs_reconnect' then return 'err'; end if;
  if not coalesce(v_bot.client_enabled, false) then return 'paused'; end if;
  if coalesce((select global_stop from public.app_settings), false) then return 'global'; end if;
  return 'run';
end $$;

-- Everyone authenticated may read the (non-sensitive) global stop flag.
create policy app_settings_read on public.app_settings for select to authenticated using (true);
grant select (global_stop) on public.app_settings to authenticated;

create function app_private.global_stop() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce((select global_stop from public.app_settings), false) $$;

-- ---------------------------------------------------------------------------
-- Helpers for client functions (run as the client's `authenticated` JWT)
-- ---------------------------------------------------------------------------

-- A client may add only its own 'set' events (changes it made itself).
create policy events_insert_own_settings on public.events for insert to authenticated
  with check (client_id = public.auth_client_id() and kind = 'set');
grant insert (client_id, kind, code, data) on public.events to authenticated;

-- Writes a client-visible event for the caller's own tenant only.
create function app_private.client_event(p_kind text, p_code text, p_data jsonb default '{}'::jsonb)
returns void
language sql volatile
set search_path = ''
as $$
  insert into public.events (client_id, kind, code, data)
  select public.auth_client_id(), p_kind, p_code, coalesce(p_data, '{}'::jsonb)
  where public.auth_client_id() is not null
$$;

-- Edits are allowed while the account is active and the subscription is
-- active or paused. An expired subscription is read-only.
create function app_private.client_can_edit(p_client_id uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.clients c where c.id = p_client_id and c.status = 'active')
     and (app_private.sub_summary(p_client_id) ->> 'state') in ('active', 'paused')
$$;

create function app_private.require_client_edit() returns uuid
language plpgsql stable
set search_path = ''
as $$
declare v_id uuid := public.auth_client_id();
begin
  if v_id is null then raise exception 'client_auth_required'; end if;
  if not app_private.client_can_edit(v_id) then raise exception 'read_only'; end if;
  return v_id;
end $$;

create function app_private.rule_json(p_rule_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'enabled', r.enabled,
    'scope', r.scope,
    'public_reply', coalesce(r.public_reply, ''),
    'dm_text', coalesce(r.dm_text, ''),
    'link_url', coalesce(r.link_url, ''),
    'updated_at', r.updated_at,
    'keywords', coalesce((select jsonb_agg(k.keyword order by k.ord, k.keyword)
                          from public.rule_keywords k where k.rule_id = r.id), '[]'::jsonb),
    'post_ids', coalesce((select jsonb_agg(p.post_id) from public.rule_posts p where p.rule_id = r.id), '[]'::jsonb))
  from public.rules r where r.id = p_rule_id
$$;

-- ---------------------------------------------------------------------------
-- Client: dashboard, rules, activity
-- ---------------------------------------------------------------------------
create function public.client_dashboard() returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid := public.auth_client_id();
  v_today_start timestamptz := (app_private.today()::timestamp at time zone 'Asia/Damascus');
begin
  if v_id is null then raise exception 'client_auth_required'; end if;
  return jsonb_build_object(
    'global_stop', app_private.global_stop(),
    'can_edit', app_private.client_can_edit(v_id),
    'replies_today', (select count(*) from public.events e
                      where e.client_id = v_id and e.kind = 'reply' and e.created_at >= v_today_start),
    'rules', coalesce((
      select jsonb_agg(app_private.rule_json(r.id) || jsonb_build_object(
               'today', (select count(*) from public.events e
                         where e.rule_id = r.id and e.kind = 'reply' and e.created_at >= v_today_start))
             order by r.updated_at desc)
      from public.rules r where r.client_id = v_id and r.enabled), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'code', e.code, 'data', e.data,
                                          'summary', e.summary, 'created_at', e.created_at)
             order by e.created_at desc)
      from (select * from public.events e where e.client_id = v_id order by e.created_at desc limit 6) e),
      '[]'::jsonb));
end $$;

create function public.client_rules_get() returns jsonb
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
               'replied', (select count(*) from public.events e where e.post_id = p.id and e.kind = 'reply'))
             order by p.posted_at desc nulls last)
      from (select * from public.ig_posts p where p.client_id = v_id
            order by p.posted_at desc nulls last limit 60) p), '[]'::jsonb));
end $$;

-- Words of a candidate rule that clash with the tenant's *other* rules.
create function app_private.keyword_clashes_for(
  p_client_id uuid, p_rule_id uuid, p_scope text, p_posts uuid[], p_norms text[]
) returns text[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct k.keyword_norm), '{}')
  from public.rule_keywords k
  join public.rules r on r.id = k.rule_id
  where k.client_id = p_client_id
    and (p_rule_id is null or k.rule_id <> p_rule_id)
    and k.keyword_norm = any (p_norms)
    and (
      (p_scope = 'all' and r.scope = 'all')
      or (p_scope = 'posts' and r.scope = 'posts' and exists (
            select 1 from public.rule_posts rp where rp.rule_id = r.id and rp.post_id = any (p_posts)))
    )
$$;

create function public.client_rule_save(
  p_id uuid, p_enabled boolean, p_scope text, p_post_ids uuid[], p_keywords text[],
  p_public_reply text, p_dm_text text, p_link_url text
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id uuid := app_private.require_client_edit();
  v_rule uuid := p_id;
  v_words text[] := '{}';
  v_norms text[] := '{}';
  w text;
  v_reply text := nullif(btrim(coalesce(p_public_reply, '')), '');
  v_dm text := nullif(btrim(coalesce(p_dm_text, '')), '');
  v_link text := nullif(btrim(coalesce(p_link_url, '')), '');
  v_posts uuid[] := coalesce(p_post_ids, '{}');
  v_clash text[];
begin
  -- Serialise rule edits per tenant so the clash check cannot race.
  perform pg_advisory_xact_lock(hashtextextended('rules:' || v_id::text, 0));

  if p_scope is null or p_scope not in ('all', 'posts') then raise exception 'invalid_input'; end if;
  foreach w in array coalesce(p_keywords, '{}') loop
    w := btrim(w);
    if w = '' or app_private.norm_keyword(w) = '' then continue; end if;
    if char_length(w) > 60 then raise exception 'invalid_input'; end if;
    if not (app_private.norm_keyword(w) = any (v_norms)) then
      v_words := v_words || w;
      v_norms := v_norms || app_private.norm_keyword(w);
    end if;
  end loop;
  if cardinality(v_words) = 0 or cardinality(v_words) > 30 then raise exception 'invalid_input'; end if;
  if v_reply is null and v_dm is null then raise exception 'invalid_input'; end if;
  if char_length(coalesce(v_reply, '')) > 1000 or char_length(coalesce(v_dm, '')) > 1000 then
    raise exception 'invalid_input';
  end if;
  if v_link is not null and (char_length(v_link) > 500 or v_link !~ '^https://[^\s/.]+\.[^\s]+$') then
    raise exception 'invalid_input';
  end if;
  if p_scope = 'posts' then
    v_posts := array(select distinct unnest(v_posts));
    if cardinality(v_posts) = 0 or cardinality(v_posts) > 100 then raise exception 'invalid_input'; end if;
    -- Every post must belong to this tenant (RLS hides the others).
    if (select count(*) from public.ig_posts p where p.id = any (v_posts) and p.client_id = v_id) <> cardinality(v_posts) then
      raise exception 'invalid_input';
    end if;
  else
    v_posts := '{}';
  end if;

  v_clash := app_private.keyword_clashes_for(v_id, v_rule, p_scope, v_posts, v_norms);
  if cardinality(v_clash) > 0 then
    return jsonb_build_object('ok', false, 'error', 'keyword_clash',
      'words', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(v_words) x
                where app_private.norm_keyword(x) = any (v_clash)));
  end if;

  if v_rule is null then
    insert into public.rules (client_id, enabled, scope, public_reply, dm_text, link_url)
    values (v_id, coalesce(p_enabled, true), p_scope::public.rule_scope, v_reply, v_dm, v_link)
    returning id into v_rule;
  else
    update public.rules
       set enabled = coalesce(p_enabled, true), scope = p_scope::public.rule_scope,
           public_reply = v_reply, dm_text = v_dm, link_url = v_link, updated_at = now()
     where id = v_rule and client_id = v_id;
    if not found then raise exception 'not_found'; end if;
    delete from public.rule_keywords where rule_id = v_rule;
    delete from public.rule_posts where rule_id = v_rule;
  end if;

  insert into public.rule_keywords (rule_id, client_id, keyword, keyword_norm, ord)
  select v_rule, v_id, kw, '', o::smallint from unnest(v_words) with ordinality as t(kw, o);
  insert into public.rule_posts (rule_id, post_id, client_id)
  select v_rule, pid, v_id from unnest(v_posts) as pid;

  perform app_private.client_event('set', case when p_id is null then 'rule.created' else 'rule.updated' end,
    jsonb_build_object('keywords', to_jsonb(v_words)));
  return jsonb_build_object('ok', true, 'rule', app_private.rule_json(v_rule));
end $$;

create function public.client_rule_delete(p_id uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id uuid := app_private.require_client_edit();
  v_words jsonb;
begin
  select coalesce(jsonb_agg(k.keyword order by k.ord), '[]'::jsonb) into v_words
  from public.rule_keywords k where k.rule_id = p_id and k.client_id = v_id;
  delete from public.rules where id = p_id and client_id = v_id;
  if not found then raise exception 'not_found'; end if;
  perform app_private.client_event('set', 'rule.deleted', jsonb_build_object('keywords', v_words));
  return jsonb_build_object('ok', true);
end $$;

create function public.client_set_cooldown(p_hours int) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_id uuid := app_private.require_client_edit();
begin
  if p_hours is null or p_hours not in (1, 6, 24) then raise exception 'invalid_input'; end if;
  update public.bot_settings set cooldown_hours = p_hours where client_id = v_id;
  perform app_private.client_event('set', 'cooldown.changed', jsonb_build_object('hours', p_hours));
  return jsonb_build_object('ok', true);
end $$;

-- The client's own on/off switch (column-level grant + RLS).
create function public.client_set_bot_enabled(p_enabled boolean) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_id uuid := app_private.require_client_edit();
begin
  update public.bot_settings set client_enabled = coalesce(p_enabled, false) where client_id = v_id;
  perform app_private.client_event('set', case when p_enabled then 'bot.on' else 'bot.off' end, '{}');
  return jsonb_build_object('ok', true);
end $$;

create function public.client_activity(p_days int) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid := public.auth_client_id();
  v_from timestamptz;
begin
  if v_id is null then raise exception 'client_auth_required'; end if;
  if p_days is null or p_days not in (1, 7, 30) then raise exception 'invalid_input'; end if;
  -- "Today" starts at midnight Damascus; 7 days = today + the 6 days before.
  v_from := ((app_private.today() - (p_days - 1))::timestamp at time zone 'Asia/Damascus');
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', e.kind, 'code', e.code, 'data', e.data,
                                        'summary', e.summary, 'created_at', e.created_at)
           order by e.created_at desc)
    from (select * from public.events e where e.client_id = v_id and e.created_at >= v_from
          order by e.created_at desc limit 1000) e), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Client account (server calls with service_role, scoped by the session)
-- ---------------------------------------------------------------------------
create function app_private.session_client(p_session_hash bytea) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare v uuid;
begin
  select s.client_id into v from public.client_sessions s
  join public.clients c on c.id = s.client_id
  where s.token_hash = p_session_hash and s.revoked_at is null and s.expires_at > now() and c.status = 'active';
  if v is null then raise exception 'client_auth_required'; end if;
  return v;
end $$;

create function public.client_devices(p_session_hash bytea) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare v_id uuid := app_private.session_client(p_session_hash);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'ua', s.ua_hint, 'last_seen_at', s.last_seen_at,
                                        'created_at', s.created_at, 'current', s.token_hash = p_session_hash)
           order by (s.token_hash = p_session_hash) desc, s.last_seen_at desc)
    from public.client_sessions s
    where s.client_id = v_id and s.revoked_at is null and s.expires_at > now()), '[]'::jsonb);
end $$;

-- p_session_id null = end every session except the current one.
create function public.client_devices_end(p_session_hash bytea, p_session_id uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_id uuid := app_private.session_client(p_session_hash);
  v_n int;
begin
  update public.client_sessions set revoked_at = now()
   where client_id = v_id and revoked_at is null and token_hash <> p_session_hash
     and (p_session_id is null or id = p_session_id);
  get diagnostics v_n = row_count;
  insert into public.events (client_id, kind, code, data)
  values (v_id, 'set', 'devices.ended', jsonb_build_object('count', v_n));
  return jsonb_build_object('ended', v_n);
end $$;

-- Disconnect Instagram: the token is deleted at once; rules are kept.
-- (Phase 4 also revokes the permission at Meta.)
create function public.client_ig_disconnect(p_session_hash bytea) returns jsonb
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
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: bots, audit log, global stop
-- ---------------------------------------------------------------------------
create function public.admin_bots_list(p_session_hash bytea) returns jsonb
language plpgsql stable
set search_path = ''
as $$
begin
  perform app_private.admin_auth(p_session_hash);
  return jsonb_build_object(
    'global_stop', app_private.global_stop(),
    'bots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'public_id', c.public_id, 'name', c.name,
               'username', i.username,
               'bot_state', app_private.bot_state(c.id),
               'admin_allowed', coalesce(b.admin_allowed, false),
               'subscription', app_private.sub_summary(c.id),
               'load_24h', (select count(*) from public.events e
                            where e.client_id = c.id and e.kind = 'reply' and e.created_at > now() - interval '24 hours'),
               'last_reply', (select max(e.created_at) from public.events e
                              where e.client_id = c.id and e.kind = 'reply'))
             order by c.name)
      from public.clients c
      left join public.bot_settings b on b.client_id = c.id
      left join public.ig_connections i on i.client_id = c.id
      where c.status <> 'archived'), '[]'::jsonb));
end $$;

create function public.admin_audit_list(p_session_hash bytea) returns jsonb
language plpgsql stable
set search_path = ''
as $$
begin
  perform app_private.admin_auth(p_session_hash);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'action', l.action, 'actor_type', l.actor_type, 'details', l.details,
             'created_at', l.created_at, 'client_name', c.name, 'client_public_id', c.public_id)
           order by l.id desc)
    from (select * from public.audit_log order by id desc limit 500) l
    left join public.clients c on c.id = l.client_id), '[]'::jsonb);
end $$;

create function public.admin_global_stop_set(p_session_hash bytea, p_stop boolean) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  update public.app_settings
     set global_stop = coalesce(p_stop, false),
         global_stop_at = case when p_stop then now() else null end,
         updated_at = now();
  perform app_private.audit('admin', v_admin, null,
    case when p_stop then 'automation.global_stop' else 'automation.global_resume' end, '{}');
  return jsonb_build_object('global_stop', coalesce(p_stop, false));
end $$;

-- Client-visible events for admin lifecycle actions: wrap the Phase 2
-- functions' effects by adding events in the same transaction.
create function app_private.sys_event(p_client_id uuid, p_code text, p_data jsonb default '{}'::jsonb)
returns void
language sql volatile
set search_path = ''
as $$
  insert into public.events (client_id, kind, code, data) values (p_client_id, 'sys', p_code, coalesce(p_data, '{}'))
$$;

create function app_private.audit_to_event() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.client_id is null then return null; end if;
  case new.action
    when 'subscription.renewed' then
      perform app_private.sys_event(new.client_id, 'subscription.renewed',
        jsonb_build_object('ends_on', app_private.sub_summary(new.client_id) ->> 'ends_on'));
    when 'subscription.paused' then perform app_private.sys_event(new.client_id, 'subscription.paused');
    when 'subscription.resumed' then perform app_private.sys_event(new.client_id, 'subscription.resumed');
    when 'subscription.ended' then perform app_private.sys_event(new.client_id, 'subscription.ended');
    when 'automation.blocked' then perform app_private.sys_event(new.client_id, 'automation.blocked');
    when 'automation.allowed' then perform app_private.sys_event(new.client_id, 'automation.allowed');
    else null;
  end case;
  return null;
end $$;

create trigger audit_log_client_events after insert on public.audit_log
  for each row execute function app_private.audit_to_event();

-- ---------------------------------------------------------------------------
-- Daily maintenance (Cloudflare Cron → service_role). Idempotent; the
-- automation gate never depends on it (can_automate() checks live state).
-- ---------------------------------------------------------------------------
create function public.run_daily_maintenance() returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_today date := app_private.today();
  r record;
  v_expired int := 0;
  v_warned int := 0;
  v_archived int := 0;
begin
  for r in
    select c.id, (app_private.sub_summary(c.id) ->> 'state') as state,
           (app_private.sub_summary(c.id) ->> 'ends_on')::date as last_end,
           c.expiry_processed_for, c.retention_warned_for
    from public.clients c where c.status <> 'archived'
  loop
    continue when r.state not in ('expired') or r.last_end is null;

    -- 1) Just expired: drop the Instagram token immediately, tell the client.
    if r.expiry_processed_for is distinct from r.last_end then
      update public.ig_connections
         set status = 'none', token_ciphertext = null, token_iv = null, token_expires_at = null, updated_at = now()
       where client_id = r.id;
      perform app_private.sys_event(r.id, 'subscription.expired',
        jsonb_build_object('ends_on', r.last_end, 'delete_on', r.last_end + 180));
      perform app_private.audit('system', null, r.id, 'subscription.expired',
        jsonb_build_object('ends_on', r.last_end));
      update public.clients set expiry_processed_for = r.last_end where id = r.id;
      v_expired := v_expired + 1;
    end if;

    -- 2) Seven days before deletion: warn once.
    if v_today >= r.last_end + 173 and r.retention_warned_for is distinct from r.last_end then
      perform app_private.sys_event(r.id, 'retention.warning', jsonb_build_object('delete_on', r.last_end + 180));
      update public.clients set retention_warned_for = r.last_end where id = r.id;
      v_warned := v_warned + 1;
    end if;

    -- 3) 180 days after expiry: delete tenant data, keep the client row
    --    (name, public_id, archived) and the audit log.
    if v_today >= r.last_end + 180 then
      delete from public.rules where client_id = r.id;
      delete from public.ig_posts where client_id = r.id;
      delete from public.events where client_id = r.id;
      delete from public.client_sessions where client_id = r.id;
      delete from public.access_codes where client_id = r.id;
      delete from public.reply_ledger where client_id = r.id;
      update public.ig_connections
         set status = 'none', token_ciphertext = null, token_iv = null, token_expires_at = null,
             ig_user_id = null, username = null, updated_at = now()
       where client_id = r.id;
      update public.clients set status = 'archived' where id = r.id;
      perform app_private.audit('system', null, r.id, 'account.archived',
        jsonb_build_object('expired_on', r.last_end));
      v_archived := v_archived + 1;
    end if;
  end loop;

  -- Housekeeping.
  delete from public.webauthn_challenges where expires_at < now() - interval '1 day';
  delete from public.login_attempts where window_start < now() - interval '1 day'
    and (locked_until is null or locked_until < now());
  delete from public.client_sessions where expires_at < now() - interval '30 days' or revoked_at < now() - interval '30 days';
  delete from public.admin_sessions where expires_at < now() - interval '30 days';
  delete from public.processed_webhooks where received_at < now() - interval '30 days';

  return jsonb_build_object('expired', v_expired, 'warned', v_warned, 'archived', v_archived, 'today', v_today);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges for the new functions
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
grant execute on function app_private.global_stop() to authenticated;
grant execute on function app_private.client_event(text, text, jsonb) to authenticated;
grant execute on function app_private.client_can_edit(uuid) to authenticated;
grant execute on function app_private.require_client_edit() to authenticated;
grant execute on function app_private.rule_json(uuid) to authenticated;
