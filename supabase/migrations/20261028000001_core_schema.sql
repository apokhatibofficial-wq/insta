-- KHATIB platform — core schema (Phase 2)
-- All timestamps are timestamptz. Business dates (subscriptions) are `date`
-- values interpreted in Asia/Damascus (see app_today()).
-- Tenant = clients.id. Every tenant-owned table carries client_id.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.client_status as enum ('active', 'disabled', 'archived');
create type public.code_status as enum ('active', 'revoked');
create type public.subscription_status as enum ('active', 'paused', 'ended');
create type public.ig_status as enum ('ok', 'needs_reconnect', 'none');
create type public.rule_scope as enum ('all', 'posts');
create type public.actor_type as enum ('admin', 'system', 'client');

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create table public.admins (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'المدير' check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  setup_completed_at timestamptz
);

create table public.admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins (id) on delete cascade,
  credential_id text not null unique check (char_length(credential_id) between 16 and 1024),
  public_key bytea not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index admin_passkeys_admin_idx on public.admin_passkeys (admin_id);

create table public.admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins (id) on delete cascade,
  code_hash bytea not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins (id) on delete cascade,
  token_hash bytea not null unique,
  via_recovery boolean not null default false,
  stepup_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- Single-use WebAuthn challenges, bound to a purpose and short expiry.
create table public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('setup', 'register', 'login', 'stepup')),
  challenge text not null,
  admin_id uuid references public.admins (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Clients (tenants)
-- ---------------------------------------------------------------------------
create sequence public.client_public_seq;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    default ('KTS-' || lpad(nextval('public.client_public_seq')::text, 4, '0')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status public.client_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  code_hash bytea not null unique,
  status public.code_status not null default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- At most one active code per client.
create unique index access_codes_one_active on public.access_codes (client_id) where status = 'active';

create table public.client_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  token_hash bytea not null unique,
  ua_hint text check (char_length(ua_hint) <= 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index client_sessions_client_idx on public.client_sessions (client_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status public.subscription_status not null default 'active',
  note text check (char_length(note) <= 300),
  created_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_on date,
  -- 30 fixed days, inclusive.
  constraint subscriptions_30_days check (ends_on = starts_on + 29)
);
create index subscriptions_client_idx on public.subscriptions (client_id, ends_on desc);

-- ---------------------------------------------------------------------------
-- Instagram & automation (tables created now so tenant isolation is tested
-- from day one; their logic arrives in Phases 3–4)
-- ---------------------------------------------------------------------------
create table public.ig_connections (
  client_id uuid primary key references public.clients (id) on delete cascade,
  ig_user_id text,
  username text check (char_length(username) <= 60),
  token_ciphertext bytea,
  token_iv bytea,
  token_expires_at timestamptz,
  status public.ig_status not null default 'none',
  updated_at timestamptz not null default now()
);

create table public.bot_settings (
  client_id uuid primary key references public.clients (id) on delete cascade,
  client_enabled boolean not null default true,
  admin_allowed boolean not null default true,
  cooldown_hours int not null default 24 check (cooldown_hours in (1, 6, 24))
);

create table public.ig_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  ig_media_id text not null unique,
  caption text,
  media_type text,
  permalink text,
  thumbnail_url text,
  posted_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (id, client_id)
);
create index ig_posts_client_idx on public.ig_posts (client_id, posted_at desc);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  enabled boolean not null default true,
  scope public.rule_scope not null default 'posts',
  public_reply text check (char_length(public_reply) <= 1000),
  dm_text text check (char_length(dm_text) <= 1000),
  link_url text check (link_url is null or link_url ~ '^https://'),
  updated_at timestamptz not null default now(),
  unique (id, client_id)
);
create index rules_client_idx on public.rules (client_id);

-- Composite FKs guarantee a rule can only reference posts of the same tenant.
create table public.rule_posts (
  rule_id uuid not null,
  post_id uuid not null,
  client_id uuid not null,
  primary key (rule_id, post_id),
  foreign key (rule_id, client_id) references public.rules (id, client_id) on delete cascade,
  foreign key (post_id, client_id) references public.ig_posts (id, client_id) on delete cascade
);

create table public.rule_keywords (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null,
  client_id uuid not null,
  keyword text not null check (char_length(keyword) between 1 and 60),
  keyword_norm text not null check (char_length(keyword_norm) between 1 and 60),
  foreign key (rule_id, client_id) references public.rules (id, client_id) on delete cascade,
  unique (rule_id, keyword_norm)
);
create index rule_keywords_client_idx on public.rule_keywords (client_id, keyword_norm);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  summary text not null check (char_length(summary) <= 500),
  created_at timestamptz not null default now()
);
create index events_client_idx on public.events (client_id, created_at desc);

create table public.processed_webhooks (
  event_key text primary key check (char_length(event_key) <= 200),
  received_at timestamptz not null default now()
);

create table public.reply_ledger (
  client_id uuid not null references public.clients (id) on delete cascade,
  ig_user_id text not null,
  last_reply_at timestamptz not null,
  primary key (client_id, ig_user_id)
);

-- ---------------------------------------------------------------------------
-- Rate limiting (per hashed IP; never stores raw IPs)
-- ---------------------------------------------------------------------------
create table public.login_attempts (
  key bytea primary key,
  scope text not null check (scope in ('client', 'admin')),
  window_start timestamptz not null default now(),
  failures int not null default 0,
  locked_until timestamptz
);
create index login_attempts_scope_idx on public.login_attempts (scope, window_start);

-- ---------------------------------------------------------------------------
-- Audit log — append-only
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_type public.actor_type not null,
  actor_id uuid,
  client_id uuid references public.clients (id) on delete set null,
  action text not null check (action ~ '^(subscription|code|account|automation|security)\.[a-z_]+$'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_client_idx on public.audit_log (client_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

create function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant the minimum.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- service_role (server only): full DML except on the audit log (insert/select only).
grant select, insert, update, delete on all tables in schema public to service_role;
revoke update, delete, truncate on public.audit_log from service_role;
grant usage, select on all sequences in schema public to service_role;

-- authenticated (a client's short-lived JWT): read own tenant data; write only
-- rules, rule keywords/posts and the client's own bot on/off switch.
grant select on public.clients, public.bot_settings,
  public.ig_posts, public.rules, public.rule_posts, public.rule_keywords, public.events
  to authenticated;
-- The admin's payment note and author stay hidden from the client.
grant select (id, client_id, starts_on, ends_on, status, ended_on) on public.subscriptions to authenticated;
grant select (client_id, username, status, updated_at) on public.ig_connections to authenticated;
grant insert, update, delete on public.rules, public.rule_posts, public.rule_keywords to authenticated;
grant update (client_enabled) on public.bot_settings to authenticated;

-- anon: nothing at all.

-- ---------------------------------------------------------------------------
-- Row level security: enabled on every table. No policies for anon.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- The tenant id comes only from the verified JWT claim.
create function public.auth_client_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'client_id', '')::uuid
$$;
revoke execute on function public.auth_client_id() from public, anon;
grant execute on function public.auth_client_id() to authenticated, service_role;

create policy clients_select_own on public.clients for select to authenticated
  using (id = public.auth_client_id());

create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (client_id = public.auth_client_id());

create policy ig_connections_select_own on public.ig_connections for select to authenticated
  using (client_id = public.auth_client_id());

create policy bot_settings_select_own on public.bot_settings for select to authenticated
  using (client_id = public.auth_client_id());
create policy bot_settings_update_own on public.bot_settings for update to authenticated
  using (client_id = public.auth_client_id())
  with check (client_id = public.auth_client_id());

create policy ig_posts_select_own on public.ig_posts for select to authenticated
  using (client_id = public.auth_client_id());

create policy events_select_own on public.events for select to authenticated
  using (client_id = public.auth_client_id());

create policy rules_all_own on public.rules for all to authenticated
  using (client_id = public.auth_client_id())
  with check (client_id = public.auth_client_id());
create policy rule_posts_all_own on public.rule_posts for all to authenticated
  using (client_id = public.auth_client_id())
  with check (client_id = public.auth_client_id());
create policy rule_keywords_all_own on public.rule_keywords for all to authenticated
  using (client_id = public.auth_client_id())
  with check (client_id = public.auth_client_id());

-- service_role has BYPASSRLS in Supabase, but FORCE RLS applies to table
-- owners only; give service_role explicit policies too, so behaviour is
-- identical whether or not BYPASSRLS is present.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)',
                   t || '_service_role', t);
  end loop;
end $$;
