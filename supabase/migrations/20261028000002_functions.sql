-- KHATIB platform — business logic as database functions (Phase 2)
--
-- Why functions: every admin action must (a) re-check the admin session,
-- (b) change data and (c) write the audit entry atomically. PostgREST has no
-- multi-statement transactions, so each action is one function call.
--
-- Entry points live in `public` (reachable via the Data API) and are
-- executable by service_role only — except client_me(), which runs as the
-- client's own `authenticated` JWT under RLS. Helpers live in `app_private`,
-- which the Data API does not expose.
--
-- Errors are raised with stable machine-readable messages, e.g.
-- 'admin_auth_required', 'stepup_required', 'not_found', 'invalid_input'.

create schema app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app_private.today() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Damascus')::date $$;

create function app_private.audit(
  p_actor_type public.actor_type, p_actor_id uuid, p_client_id uuid,
  p_action text, p_details jsonb default '{}'::jsonb
) returns void
language sql volatile
set search_path = ''
as $$
  insert into public.audit_log (actor_type, actor_id, client_id, action, details)
  values (p_actor_type, p_actor_id, p_client_id, p_action, coalesce(p_details, '{}'::jsonb))
$$;

-- Subscription state "today" (Asia/Damascus), derived from all periods.
-- state: active | paused | expired | none
create function app_private.sub_summary(p_client_id uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_today date := app_private.today();
  v_cur record;
  v_final date;
  v_last date;
begin
  select s.starts_on, s.status into v_cur
  from public.subscriptions s
  where s.client_id = p_client_id and s.status <> 'ended'
    and s.starts_on <= v_today and s.ends_on >= v_today
  order by s.starts_on
  limit 1;

  if found then
    -- Renewals chain periods back to back; the effective end is the last one.
    select max(s.ends_on) into v_final
    from public.subscriptions s
    where s.client_id = p_client_id and s.status <> 'ended' and s.ends_on >= v_today;

    return jsonb_build_object(
      'state', case when v_cur.status = 'paused' then 'paused' else 'active' end,
      'starts_on', v_cur.starts_on,
      'ends_on', v_final,
      'days_left', v_final - v_today + 1,
      'total_days', v_final - v_cur.starts_on + 1,
      'today', v_today);
  end if;

  select max(coalesce(s.ended_on, s.ends_on)) into v_last
  from public.subscriptions s
  where s.client_id = p_client_id and s.starts_on <= v_today
    and (s.status <> 'ended' or s.ended_on is not null);

  if v_last is null then
    return jsonb_build_object('state', 'none', 'today', v_today);
  end if;

  return jsonb_build_object(
    'state', 'expired',
    'starts_on', (select max(s.starts_on) from public.subscriptions s
                  where s.client_id = p_client_id and s.starts_on <= v_today),
    'ends_on', v_last,
    'days_left', 0,
    'today', v_today);
end $$;

-- Why the bot is (not) running — first failing check wins.
-- disabled | sub_paused | sub_expired | admin | wait | err | paused | run
create function app_private.bot_state(p_client_id uuid) returns text
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
  return 'run';
end $$;

-- The single gate for every automation path (webhooks, jobs). Never cached.
create function public.can_automate(p_client_id uuid) returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(app_private.bot_state(p_client_id) = 'run', false) $$;

-- Validates an admin session; returns the admin id or raises.
create function app_private.admin_auth(p_session_hash bytea) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare v_admin uuid;
begin
  select s.admin_id into v_admin
  from public.admin_sessions s
  join public.admins a on a.id = s.admin_id
  where s.token_hash = p_session_hash
    and s.revoked_at is null and s.expires_at > now()
    and a.setup_completed_at is not null;
  if v_admin is null then
    raise exception 'admin_auth_required';
  end if;
  return v_admin;
end $$;

-- Destructive actions need a passkey re-verification from the last 3 minutes.
-- It is consumed by the action, so each destructive action needs its own.
create function app_private.consume_stepup(p_session_hash bytea) returns void
language plpgsql volatile
set search_path = ''
as $$
begin
  update public.admin_sessions
     set stepup_at = null
   where token_hash = p_session_hash
     and stepup_at > now() - interval '3 minutes';
  if not found then
    raise exception 'stepup_required';
  end if;
end $$;

-- Rate limiting: 5 failures within 15 minutes => locked for 15 minutes.
-- Plus a global ceiling per scope (protects against distributed guessing).
create function app_private.rate_row(p_key bytea, p_scope text) returns public.login_attempts
language plpgsql volatile
set search_path = ''
as $$
declare r public.login_attempts%rowtype;
begin
  insert into public.login_attempts (key, scope) values (p_key, p_scope)
  on conflict (key) do nothing;
  select * into r from public.login_attempts where key = p_key for update;
  if r.locked_until is not null and r.locked_until <= now() then
    update public.login_attempts set failures = 0, window_start = now(), locked_until = null
     where key = p_key returning * into r;
  elsif r.locked_until is null and r.window_start < now() - interval '15 minutes' then
    update public.login_attempts set failures = 0, window_start = now()
     where key = p_key returning * into r;
  end if;
  return r;
end $$;

create function app_private.rate_global_exceeded(p_scope text) returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(sum(failures), 0) >= case p_scope when 'client' then 300 else 30 end
  from public.login_attempts
  where scope = p_scope and window_start > now() - interval '15 minutes'
$$;

create function app_private.rate_fail(p_key bytea) returns public.login_attempts
language plpgsql volatile
set search_path = ''
as $$
declare r public.login_attempts%rowtype;
begin
  update public.login_attempts
     set failures = failures + 1,
         locked_until = case when failures + 1 >= 5 then now() + interval '15 minutes' else null end
   where key = p_key
  returning * into r;
  return r;
end $$;

create function app_private.rate_result(r public.login_attempts, p_global boolean default false) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'failures', r.failures,
    'max_failures', 5,
    'locked', p_global or (r.locked_until is not null and r.locked_until > now()),
    'retry_after_s', case
      when p_global then 300
      when r.locked_until is not null and r.locked_until > now()
        then ceil(extract(epoch from r.locked_until - now()))::int
      else 0 end)
$$;

-- ---------------------------------------------------------------------------
-- Client auth (called by the server with service_role)
-- ---------------------------------------------------------------------------
create function public.client_login(
  p_ip_key bytea, p_code_hash bytea, p_session_hash bytea, p_ua text default null
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  r public.login_attempts%rowtype;
  v_client uuid;
begin
  r := app_private.rate_row(p_ip_key, 'client');
  if r.locked_until is not null and r.locked_until > now() then
    return app_private.rate_result(r);
  end if;
  if app_private.rate_global_exceeded('client') then
    return app_private.rate_result(r, true);
  end if;

  select ac.client_id into v_client
  from public.access_codes ac
  join public.clients c on c.id = ac.client_id
  where ac.code_hash = p_code_hash and ac.status = 'active' and c.status = 'active';

  if v_client is null then
    r := app_private.rate_fail(p_ip_key);
    if r.locked_until is not null then
      perform app_private.audit('system', null, null, 'security.client_login_locked',
        jsonb_build_object('failures', r.failures));
    end if;
    return app_private.rate_result(r);
  end if;

  delete from public.login_attempts where key = p_ip_key;
  insert into public.client_sessions (client_id, token_hash, ua_hint, expires_at)
  values (v_client, p_session_hash, left(p_ua, 120), now() + interval '30 days');
  return jsonb_build_object('ok', true, 'client_id', v_client);
end $$;

-- Validates a client session cookie; slides its 30-day expiry.
create function public.client_session_resolve(p_session_hash bytea) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_s public.client_sessions%rowtype;
  v_c public.clients%rowtype;
begin
  select * into v_s from public.client_sessions
  where token_hash = p_session_hash and revoked_at is null and expires_at > now();
  if not found then return null; end if;

  select * into v_c from public.clients where id = v_s.client_id;
  if v_c.status <> 'active' then
    return jsonb_build_object('client_id', v_c.id, 'account', 'disabled');
  end if;

  if v_s.last_seen_at < now() - interval '5 minutes' then
    update public.client_sessions
       set last_seen_at = now(), expires_at = now() + interval '30 days'
     where id = v_s.id;
  end if;

  return jsonb_build_object('client_id', v_c.id, 'account', 'active');
end $$;

create function public.client_logout(p_session_hash bytea) returns void
language sql volatile
set search_path = ''
as $$
  update public.client_sessions set revoked_at = now()
  where token_hash = p_session_hash and revoked_at is null
$$;

-- ---------------------------------------------------------------------------
-- Client data (runs as the client's `authenticated` JWT; RLS applies)
-- ---------------------------------------------------------------------------
create function public.client_me() returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_id uuid := public.auth_client_id();
  v_c record;
begin
  if v_id is null then raise exception 'client_auth_required'; end if;
  -- RLS limits this to the caller's own row; the explicit filter is defence in depth.
  select c.id, c.public_id, c.name into v_c from public.clients c where c.id = v_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'id', v_c.id, 'public_id', v_c.public_id, 'name', v_c.name,
    'subscription', app_private.sub_summary(v_c.id),
    'ig', (select jsonb_build_object('status', i.status, 'username', i.username)
           from public.ig_connections i where i.client_id = v_c.id),
    'bot', (select jsonb_build_object('client_enabled', b.client_enabled)
            from public.bot_settings b where b.client_id = v_c.id));
end $$;

-- ---------------------------------------------------------------------------
-- Admin bootstrap (first run, guarded by ADMIN_SETUP_TOKEN in the server)
-- ---------------------------------------------------------------------------
create function public.admin_setup_state() returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'admin_exists', exists (select 1 from public.admins),
    'setup_complete', exists (select 1 from public.admins where setup_completed_at is not null),
    'passkeys', (select count(*) from public.admin_passkeys))
$$;

create function public.admin_setup_ensure_admin() returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare v_id uuid;
begin
  if exists (select 1 from public.admins where setup_completed_at is not null) then
    raise exception 'setup_closed';
  end if;
  select id into v_id from public.admins order by created_at limit 1;
  if v_id is null then
    insert into public.admins default values returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.admin_setup_add_passkey(
  p_admin_id uuid, p_credential_id text, p_public_key bytea, p_counter bigint,
  p_transports text[], p_device_type text, p_backed_up boolean
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
begin
  if exists (select 1 from public.admins where setup_completed_at is not null) then
    raise exception 'setup_closed';
  end if;
  insert into public.admin_passkeys
    (admin_id, credential_id, public_key, counter, transports, device_type, backed_up)
  values (p_admin_id, p_credential_id, p_public_key, p_counter,
          coalesce(p_transports, '{}'), p_device_type, coalesce(p_backed_up, false));
  perform app_private.audit('admin', p_admin_id, null, 'security.passkey_added',
    jsonb_build_object('during', 'setup'));
  return jsonb_build_object('passkeys',
    (select count(*) from public.admin_passkeys where admin_id = p_admin_id));
end $$;

create function public.admin_setup_complete(
  p_admin_id uuid, p_recovery_hashes bytea[], p_session_hash bytea
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
begin
  if exists (select 1 from public.admins where setup_completed_at is not null) then
    raise exception 'setup_closed';
  end if;
  if (select count(*) from public.admin_passkeys where admin_id = p_admin_id) < 2 then
    raise exception 'two_passkeys_required';
  end if;
  if coalesce(array_length(p_recovery_hashes, 1), 0) <> 10 then
    raise exception 'invalid_input';
  end if;
  insert into public.admin_recovery_codes (admin_id, code_hash)
  select p_admin_id, h from unnest(p_recovery_hashes) as h;
  update public.admins set setup_completed_at = now() where id = p_admin_id;
  insert into public.admin_sessions (admin_id, token_hash, expires_at)
  values (p_admin_id, p_session_hash, now() + interval '12 hours');
  perform app_private.audit('admin', p_admin_id, null, 'security.admin_setup_completed', '{}');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- WebAuthn challenges (single use, 5 minutes)
-- ---------------------------------------------------------------------------
create function public.webauthn_challenge_create(p_purpose text, p_challenge text, p_admin_id uuid default null)
returns uuid
language plpgsql volatile
set search_path = ''
as $$
declare v_id uuid;
begin
  delete from public.webauthn_challenges where expires_at < now() - interval '1 hour';
  insert into public.webauthn_challenges (purpose, challenge, admin_id)
  values (p_purpose, p_challenge, p_admin_id) returning id into v_id;
  return v_id;
end $$;

create function public.webauthn_challenge_consume(p_id uuid, p_purpose text) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v record;
begin
  update public.webauthn_challenges
     set used_at = now()
   where id = p_id and purpose = p_purpose and used_at is null and expires_at > now()
  returning challenge, admin_id into v;
  if not found then return null; end if;
  return jsonb_build_object('challenge', v.challenge, 'admin_id', v.admin_id);
end $$;

-- ---------------------------------------------------------------------------
-- Admin login
-- ---------------------------------------------------------------------------
create function public.admin_passkey_lookup(p_credential_id text) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'admin_id', p.admin_id,
    'public_key', encode(p.public_key, 'base64'),
    'counter', p.counter,
    'transports', to_jsonb(p.transports))
  from public.admin_passkeys p
  join public.admins a on a.id = p.admin_id
  where p.credential_id = p_credential_id
$$;

create function public.admin_login_check(p_ip_key bytea) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare r public.login_attempts%rowtype;
begin
  r := app_private.rate_row(p_ip_key, 'admin');
  if r.locked_until is not null and r.locked_until > now() then
    return app_private.rate_result(r);
  end if;
  if app_private.rate_global_exceeded('admin') then
    return app_private.rate_result(r, true);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Every failed admin login is audited (never with secrets).
create function public.admin_login_failed(p_ip_key bytea, p_method text) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare r public.login_attempts%rowtype;
begin
  perform app_private.rate_row(p_ip_key, 'admin');
  r := app_private.rate_fail(p_ip_key);
  perform app_private.audit('system', null, null, 'security.admin_login_failed',
    jsonb_build_object('method', left(p_method, 20), 'locked', r.locked_until is not null));
  return app_private.rate_result(r);
end $$;

create function public.admin_login_with_passkey(
  p_ip_key bytea, p_credential_id text, p_new_counter bigint, p_session_hash bytea
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid;
begin
  update public.admin_passkeys p
     set counter = greatest(p.counter, p_new_counter), last_used_at = now()
    from public.admins a
   where p.credential_id = p_credential_id and a.id = p.admin_id
     and a.setup_completed_at is not null
  returning p.admin_id into v_admin;
  if v_admin is null then raise exception 'admin_auth_required'; end if;

  delete from public.login_attempts where key = p_ip_key;
  insert into public.admin_sessions (admin_id, token_hash, expires_at)
  values (v_admin, p_session_hash, now() + interval '12 hours');
  perform app_private.audit('admin', v_admin, null, 'security.admin_login', jsonb_build_object('method', 'passkey'));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_login_with_recovery(
  p_ip_key bytea, p_code_hash bytea, p_session_hash bytea
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  r public.login_attempts%rowtype;
  v_admin uuid;
begin
  r := app_private.rate_row(p_ip_key, 'admin');
  if r.locked_until is not null and r.locked_until > now() then
    return app_private.rate_result(r);
  end if;
  if app_private.rate_global_exceeded('admin') then
    return app_private.rate_result(r, true);
  end if;

  update public.admin_recovery_codes rc
     set used_at = now()
    from public.admins a
   where rc.code_hash = p_code_hash and rc.used_at is null
     and a.id = rc.admin_id and a.setup_completed_at is not null
  returning rc.admin_id into v_admin;

  if v_admin is null then
    return public.admin_login_failed(p_ip_key, 'recovery');
  end if;

  delete from public.login_attempts where key = p_ip_key;
  insert into public.admin_sessions (admin_id, token_hash, via_recovery, expires_at)
  values (v_admin, p_session_hash, true, now() + interval '12 hours');
  perform app_private.audit('admin', v_admin, null, 'security.admin_login',
    jsonb_build_object('method', 'recovery_code',
      'recovery_codes_left', (select count(*) from public.admin_recovery_codes
                              where admin_id = v_admin and used_at is null)));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_session_resolve(p_session_hash bytea) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'admin_id', a.id,
    'display_name', a.display_name,
    'via_recovery', s.via_recovery,
    'expires_at', s.expires_at,
    'passkey_ids', (select coalesce(jsonb_agg(p.credential_id), '[]'::jsonb)
                    from public.admin_passkeys p where p.admin_id = a.id),
    'recovery_codes_left', (select count(*) from public.admin_recovery_codes rc
                            where rc.admin_id = a.id and rc.used_at is null))
  from public.admin_sessions s
  join public.admins a on a.id = s.admin_id
  where s.token_hash = p_session_hash
    and s.revoked_at is null and s.expires_at > now()
    and a.setup_completed_at is not null
$$;

create function public.admin_logout(p_session_hash bytea) returns void
language sql volatile
set search_path = ''
as $$
  update public.admin_sessions set revoked_at = now()
  where token_hash = p_session_hash and revoked_at is null
$$;

-- A logged-in admin registers an extra passkey (e.g. after a recovery login).
create function public.admin_add_passkey(
  p_session_hash bytea, p_credential_id text, p_public_key bytea, p_counter bigint,
  p_transports text[], p_device_type text, p_backed_up boolean
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  insert into public.admin_passkeys
    (admin_id, credential_id, public_key, counter, transports, device_type, backed_up)
  values (v_admin, p_credential_id, p_public_key, p_counter,
          coalesce(p_transports, '{}'), p_device_type, coalesce(p_backed_up, false));
  update public.admin_sessions set via_recovery = false where token_hash = p_session_hash;
  perform app_private.audit('admin', v_admin, null, 'security.passkey_added', '{}');
  return jsonb_build_object('ok', true);
end $$;

-- Records a fresh passkey verification on the current session (step-up).
create function public.admin_stepup(
  p_session_hash bytea, p_credential_id text, p_new_counter bigint
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  update public.admin_passkeys
     set counter = greatest(counter, p_new_counter), last_used_at = now()
   where credential_id = p_credential_id and admin_id = v_admin;
  if not found then raise exception 'stepup_required'; end if;
  update public.admin_sessions set stepup_at = now() where token_hash = p_session_hash;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: clients
-- ---------------------------------------------------------------------------
create function app_private.client_row(p_client_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'public_id', c.public_id,
    'name', c.name,
    'status', c.status,
    'created_at', c.created_at,
    'subscription', app_private.sub_summary(c.id),
    'ig', jsonb_build_object('status', coalesce(i.status, 'none'), 'username', i.username),
    'bot_state', app_private.bot_state(c.id),
    'last_activity', greatest(
      (select max(cs.last_seen_at) from public.client_sessions cs where cs.client_id = c.id),
      (select max(e.created_at) from public.events e where e.client_id = c.id)))
  from public.clients c
  left join public.ig_connections i on i.client_id = c.id
  where c.id = p_client_id
$$;

create function public.admin_clients_list(p_session_hash bytea) returns jsonb
language plpgsql stable
set search_path = ''
as $$
begin
  perform app_private.admin_auth(p_session_hash);
  return coalesce(
    (select jsonb_agg(app_private.client_row(c.id) order by c.created_at desc)
     from public.clients c where c.status <> 'archived'),
    '[]'::jsonb);
end $$;

create function public.admin_client_detail(p_session_hash bytea, p_client_id uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare v jsonb;
begin
  perform app_private.admin_auth(p_session_hash);
  v := app_private.client_row(p_client_id);
  if v is null then raise exception 'not_found'; end if;
  return v || jsonb_build_object(
    'code', (select jsonb_build_object('status', ac.status, 'created_at', ac.created_at)
             from public.access_codes ac where ac.client_id = p_client_id
             order by ac.created_at desc limit 1),
    'sessions', jsonb_build_object(
      'active', (select count(*) from public.client_sessions cs
                 where cs.client_id = p_client_id and cs.revoked_at is null and cs.expires_at > now()),
      'last_login', (select max(cs.created_at) from public.client_sessions cs
                     where cs.client_id = p_client_id)),
    'bot', (select jsonb_build_object('admin_allowed', b.admin_allowed, 'client_enabled', b.client_enabled)
            from public.bot_settings b where b.client_id = p_client_id),
    'ig_updated_at', (select i.updated_at from public.ig_connections i where i.client_id = p_client_id),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
               'action', l.action, 'actor_type', l.actor_type,
               'details', l.details, 'created_at', l.created_at) order by l.id desc)
      from (select * from public.audit_log al where al.client_id = p_client_id
            order by al.id desc limit 50) l), '[]'::jsonb));
end $$;

create function public.admin_client_create(
  p_session_hash bytea, p_name text, p_starts_on date, p_note text, p_code_hash bytea
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_admin uuid := app_private.admin_auth(p_session_hash);
  v_today date := app_private.today();
  v_c public.clients%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'invalid_input'; end if;
  if p_starts_on is null or p_starts_on > v_today or p_starts_on < v_today - 30 then
    raise exception 'invalid_input';
  end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'invalid_input'; end if;

  insert into public.clients (name) values (v_name) returning * into v_c;
  insert into public.access_codes (client_id, code_hash) values (v_c.id, p_code_hash);
  insert into public.subscriptions (client_id, starts_on, ends_on, note, created_by)
  values (v_c.id, p_starts_on, p_starts_on + 29, v_note, v_admin);
  insert into public.bot_settings (client_id) values (v_c.id);
  insert into public.ig_connections (client_id) values (v_c.id);

  perform app_private.audit('admin', v_admin, v_c.id, 'account.created',
    jsonb_build_object('starts_on', p_starts_on, 'ends_on', p_starts_on + 29));
  perform app_private.audit('admin', v_admin, v_c.id, 'code.generated', '{}');

  return jsonb_build_object('id', v_c.id, 'public_id', v_c.public_id, 'name', v_c.name,
                            'starts_on', p_starts_on, 'ends_on', p_starts_on + 29);
end $$;

create function public.admin_account_set_active(
  p_session_hash bytea, p_client_id uuid, p_active boolean
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  update public.clients
     set status = case when p_active then 'active'::public.client_status else 'disabled'::public.client_status end
   where id = p_client_id and status <> 'archived';
  if not found then raise exception 'not_found'; end if;
  if not p_active then
    update public.client_sessions set revoked_at = now()
     where client_id = p_client_id and revoked_at is null;
  end if;
  perform app_private.audit('admin', v_admin, p_client_id,
    case when p_active then 'account.enabled' else 'account.disabled' end, '{}');
  return app_private.client_row(p_client_id);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: subscriptions
-- ---------------------------------------------------------------------------
create function public.admin_subscription_renew(
  p_session_hash bytea, p_client_id uuid, p_note text
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_admin uuid := app_private.admin_auth(p_session_hash);
  v_today date := app_private.today();
  v_sum jsonb;
  v_state text;
  v_start date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_note is not null and char_length(v_note) > 300 then raise exception 'invalid_input'; end if;
  perform 1 from public.clients where id = p_client_id and status <> 'archived' for update;
  if not found then raise exception 'not_found'; end if;

  v_sum := app_private.sub_summary(p_client_id);
  v_state := v_sum ->> 'state';
  -- Active (or paused) => the new period starts the day after the current end,
  -- so no day is lost. Expired => it starts today.
  if v_state in ('active', 'paused') then
    v_start := (v_sum ->> 'ends_on')::date + 1;
  else
    v_start := v_today;
  end if;
  if v_start > v_today + 366 then raise exception 'renewal_too_far'; end if;

  insert into public.subscriptions (client_id, starts_on, ends_on, status, note, created_by)
  values (p_client_id, v_start, v_start + 29,
          case when v_state = 'paused' then 'paused'::public.subscription_status
               else 'active'::public.subscription_status end,
          v_note, v_admin);

  perform app_private.audit('admin', v_admin, p_client_id, 'subscription.renewed',
    jsonb_build_object('starts_on', v_start, 'ends_on', v_start + 29, 'note', v_note));
  return app_private.sub_summary(p_client_id);
end $$;

create function public.admin_subscription_set_paused(
  p_session_hash bytea, p_client_id uuid, p_paused boolean
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_admin uuid := app_private.admin_auth(p_session_hash);
  v_today date := app_private.today();
begin
  perform 1 from public.clients where id = p_client_id for update;
  if not found then raise exception 'not_found'; end if;
  update public.subscriptions
     set status = case when p_paused then 'paused'::public.subscription_status
                       else 'active'::public.subscription_status end
   where client_id = p_client_id and status <> 'ended' and ends_on >= v_today;
  if not found then raise exception 'no_current_subscription'; end if;
  perform app_private.audit('admin', v_admin, p_client_id,
    case when p_paused then 'subscription.paused' else 'subscription.resumed' end, '{}');
  return app_private.sub_summary(p_client_id);
end $$;

-- Ends the subscription now: automation stops today; data is kept.
create function public.admin_subscription_end(p_session_hash bytea, p_client_id uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_admin uuid := app_private.admin_auth(p_session_hash);
  v_today date := app_private.today();
begin
  perform 1 from public.clients where id = p_client_id for update;
  if not found then raise exception 'not_found'; end if;
  if (app_private.sub_summary(p_client_id) ->> 'state') not in ('active', 'paused') then
    raise exception 'no_current_subscription';
  end if;
  perform app_private.consume_stepup(p_session_hash);

  update public.subscriptions
     set status = 'ended', ended_at = now(),
         ended_on = case when starts_on <= v_today then least(ends_on, v_today - 1) else null end
   where client_id = p_client_id and status <> 'ended' and ends_on >= v_today;

  perform app_private.audit('admin', v_admin, p_client_id, 'subscription.ended', '{}');
  return app_private.sub_summary(p_client_id);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: access codes & sessions
-- ---------------------------------------------------------------------------
create function public.admin_code_regenerate(
  p_session_hash bytea, p_client_id uuid, p_code_hash bytea
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  perform 1 from public.clients where id = p_client_id and status <> 'archived' for update;
  if not found then raise exception 'not_found'; end if;
  perform app_private.consume_stepup(p_session_hash);

  update public.access_codes set status = 'revoked', revoked_at = now()
   where client_id = p_client_id and status = 'active';
  insert into public.access_codes (client_id, code_hash) values (p_client_id, p_code_hash);
  update public.client_sessions set revoked_at = now()
   where client_id = p_client_id and revoked_at is null;

  perform app_private.audit('admin', v_admin, p_client_id, 'code.regenerated', '{}');
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_code_revoke(p_session_hash bytea, p_client_id uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  perform 1 from public.access_codes where client_id = p_client_id and status = 'active' for update;
  if not found then raise exception 'not_found'; end if;
  perform app_private.consume_stepup(p_session_hash);

  update public.access_codes set status = 'revoked', revoked_at = now()
   where client_id = p_client_id and status = 'active';
  update public.client_sessions set revoked_at = now()
   where client_id = p_client_id and revoked_at is null;

  perform app_private.audit('admin', v_admin, p_client_id, 'code.revoked', '{}');
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_sessions_end(p_session_hash bytea, p_client_id uuid) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_admin uuid := app_private.admin_auth(p_session_hash);
  v_n int;
begin
  update public.client_sessions set revoked_at = now()
   where client_id = p_client_id and revoked_at is null and expires_at > now();
  get diagnostics v_n = row_count;
  perform app_private.audit('admin', v_admin, p_client_id, 'code.sessions_ended',
    jsonb_build_object('count', v_n));
  return jsonb_build_object('ended', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: automation kill switch (per client)
-- ---------------------------------------------------------------------------
create function public.admin_bot_set_allowed(
  p_session_hash bytea, p_client_id uuid, p_allowed boolean
) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare v_admin uuid := app_private.admin_auth(p_session_hash);
begin
  update public.bot_settings set admin_allowed = p_allowed where client_id = p_client_id;
  if not found then raise exception 'not_found'; end if;
  perform app_private.audit('admin', v_admin, p_client_id,
    case when p_allowed then 'automation.allowed' else 'automation.blocked' end, '{}');
  return jsonb_build_object('bot_state', app_private.bot_state(p_client_id));
end $$;

-- ---------------------------------------------------------------------------
-- Execute privileges: nothing for anon; service_role for server entry points;
-- authenticated only for client_me().
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;

grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app_private to service_role;

grant execute on function public.auth_client_id() to authenticated;
grant execute on function public.client_me() to authenticated;
grant execute on function app_private.sub_summary(uuid) to authenticated;
grant execute on function app_private.today() to authenticated;
