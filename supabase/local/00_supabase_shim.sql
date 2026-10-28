-- LOCAL DEVELOPMENT / TEST ONLY. Never run against a real Supabase project.
-- Recreates the small part of Supabase that our migrations and RLS policies
-- depend on, so they can be tested on a plain PostgreSQL server:
--   * roles anon / authenticated / service_role (service_role bypasses RLS)
--   * auth.jwt()  -> the claims PostgREST puts in request.jwt.claims
-- PostgREST itself does exactly this per request: SET LOCAL ROLE <role> and
-- set_config('request.jwt.claims', <verified claims>, true).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- Supabase grants these by default on the public schema; mirror that so the
-- migrations' explicit REVOKEs are tested against the same starting point.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
