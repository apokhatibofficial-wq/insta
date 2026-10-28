# Architecture & Security Plan (Phase 2 → 6)

Status legend: **[Decided]** approved by owner · **[Proposed]** needs owner OK before building · **[Verify]** must be checked against current official docs before relying on it (limits/policies change).

## 1. Stack
- **[Decided]** Next.js (App Router, TypeScript, strict) deployed to **Cloudflare Workers** (free plan) via the OpenNext Cloudflare adapter. **[Verify]** current free limits (requests/day, CPU ms per request) and that the adapter supports the Next version you pick.
- **[Decided]** **Supabase** (Postgres + RLS), free plan. **[Verify]** limits (DB size, egress, project pause after ~7 days inactivity — webhooks/cron traffic should keep it awake; document the risk).
- Validation: Zod on every server input. Tests: Vitest (unit/integration), Playwright (e2e, RTL, mobile viewports), pgTAP or SQL tests for RLS.
- One app, clear modules: `app/(public)`, `app/(client)`, `app/(admin)`, `server/auth`, `server/tenancy`, `server/subscriptions`, `server/instagram`, `server/webhooks`, `server/jobs`, `server/audit`.
- No secret ever reaches the browser. `service_role` key only in Worker secrets, ideally only for admin/system jobs.

## 2. Data model (all timestamps `timestamptz`, business rules evaluated in `Asia/Damascus`)
- `admins(id, display_name, created_at)` · `admin_passkeys(id, admin_id, credential_id, public_key, counter, transports, created_at, last_used_at)` · `admin_recovery_codes(admin_id, code_hash, used_at)`
- `clients(id uuid pk, public_id text unique 'KTS-0001', name, status enum[active,disabled], created_at)` — the tenant.
- `access_codes(id, client_id fk, code_hash bytea unique, status enum[active,revoked], created_at, revoked_at)` — one active per client.
- `client_sessions(id, client_id, token_hash, created_at, last_seen_at, expires_at, revoked_at, ua_hint)`
- `subscriptions(id, client_id, starts_on date, ends_on date, status enum[active,paused,ended], note text, created_by, created_at)` — one row per period; current = latest not ended.
- `ig_connections(client_id pk, ig_user_id, username, token_ciphertext, token_iv, token_expires_at, status enum[ok,needs_reconnect,none], updated_at)`
- `bot_settings(client_id pk, client_enabled bool, admin_allowed bool, cooldown_hours int)`
- `ig_posts(id, client_id, ig_media_id unique, caption, media_type, permalink, thumbnail_url, posted_at, synced_at)` — synced from the API (cron + on-demand refresh).
- `rules(id, client_id, enabled, scope enum[all,posts], public_reply text null, dm_text text null, link_url text null, updated_at)` · `rule_posts(rule_id, post_id, client_id, pk(rule_id, post_id))` · `rule_keywords(rule_id, client_id, keyword, keyword_norm)`.
- Matching on a comment for media M: candidate rules = enabled ∧ (scope=all ∨ M ∈ rule_posts). If any `posts`-scoped rule matches a keyword, it wins over `all`-scoped rules. Uniqueness of `keyword_norm` is enforced in the server (and a trigger) per overlapping scope: unique among `all` rules, and unique per post among `posts` rules.
- `events(id, client_id, kind, summary, created_at)` — client-visible activity.
- `processed_webhooks(event_key text pk, received_at)` — idempotency.
- `reply_ledger(client_id, ig_user_id, last_reply_at)` — cooldown/duplicate prevention.
- `audit_log(id, actor_type, actor_id, client_id null, action, details jsonb, created_at)` — append-only (no UPDATE/DELETE grants).
- `login_attempts(key text, window_start, count)` or Cloudflare rate-limiting binding **[Verify availability on free plan]**.

## 3. Tenant isolation **[Decided]**
- RLS **enabled on every table**, with **no policies for `anon`** (anon key useless even if leaked).
- After client login, the server mints a short-lived (≤5 min) JWT with `role=authenticated`, `client_id=<uuid>` and uses it for that request's Supabase client. Policies: `client_id = (auth.jwt() ->> 'client_id')::uuid` for SELECT, and for writes only on `rules`, `rule_keywords`, `bot_settings.client_enabled`. Clients can never write `subscriptions`, `clients`, `access_codes`, `ig_connections`, `audit_log`.
- **[Verify]** how to sign custom JWTs with the project's current Supabase signing keys (legacy JWT secret vs. asymmetric keys).
- Server code also scopes every query by `client_id` from the session (defence in depth). Never accept `client_id` from the request body/URL for client routes.
- Admin routes use a separate server path with service role + explicit admin session check on **every** action.

## 4. Client auth (static code) **[Decided: code only]**
- Code: 12 chars from a 55-char alphabet (no 0/O/1/I/l) ≈ 69 bits, generated with CSPRNG on the server.
- Stored as `HMAC-SHA256(PEPPER, code)` (pepper in Worker secret). Deterministic hash allows indexed lookup; high entropy makes slow hashing unnecessary. Shown once to the admin; never logged.
- Login: constant-time compare via hash lookup; generic error; rate-limit per IP (5 failures → 15 min) **and** a global ceiling. Note: without a username, lockout is per IP/device, not per account — document this.
- Session: random 32-byte token in cookie `__Host-kts_s` (HttpOnly, Secure, SameSite=Lax, Path=/), stored hashed; 30-day sliding expiry; revoked on code regeneration, account disable, or admin "end sessions".
- Every request re-checks: session valid → client active → subscription state (server-side, Damascus date).
- Known residual risk: a leaked code = full access until revoked. Mitigation available later without UX change: new-device notification in the dashboard.

## 5. Admin auth **[Decided: Passkey]**
- WebAuthn via `@simplewebauthn/server` + `/browser`. First-run bootstrap with a one-time `ADMIN_SETUP_TOKEN` env var, then disabled.
- Require registering 2 passkeys + 10 single-use recovery codes (hashed).
- Separate cookie `__Host-kts_a`, SameSite=Strict, 12h absolute expiry; re-verify passkey for destructive actions (end subscription, regenerate code) **[Proposed]**.
- CSRF: SameSite + Origin header check on all mutating routes; Server Actions also verify Origin.

## 6. Subscriptions **[Decided: 30 fixed days, Asia/Damascus]**
- Active on dates `starts_on … ends_on` inclusive (ends_on = starts_on + 29). Renewal while active: next period starts `ends_on + 1`; renewal when expired: starts today.
- Automation allowed only if: client active ∧ subscription active today ∧ admin_allowed ∧ client_enabled ∧ IG ok. Single server function `canAutomate(clientId)` used by webhook handler and every job.
- Daily cron (Cloudflare Cron Trigger) marks expired periods and writes events; but checks never rely on the cron alone.
- **[Decided]** Retention: on expiry delete the IG token immediately (status none). Client sees "data deleted on <date>" (ends_on + 180 days, Damascus) and gets an event + banner 7 days before. Daily cron hard-deletes rules, rule_keywords, rule_posts, ig_posts, events, sessions, access_codes for clients expired ≥180 days; keeps `clients` row (name, public_id, status=archived) and `audit_log` (append-only). Renewal before day 180 restores everything (except IG link → reconnect). Test: cron deletes only eligible tenants.

## 7. Instagram (Phase 4) **[Verify everything here before building]**
- Use Meta's official **Instagram API with Instagram Login** (professional accounts: Business/Creator). Expected permissions: `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`. App Review + Business Verification needed for non-test users. Never ask for or store IG passwords.
- OAuth with `state` (CSRF) bound to the client session; exchange code server-side; store long-lived token encrypted (AES-256-GCM, key in secret); refresh before expiry via cron; mark `needs_reconnect` on auth errors.
- Webhooks: verify `X-Hub-Signature-256` (HMAC-SHA256 with app secret, raw body, constant-time) → 401 if invalid; handle the verify-token handshake; dedupe by event/comment id in `processed_webhooks`; respond fast, process with `ctx.waitUntil`.
- Private replies to comments and DM rules (24h window, one private reply per comment, time limits, rate limits) — confirm exact current rules and surface failures as plain-language events (UI already designed).
- Never auto-reply to the account's own comments; respect cooldown ledger.

## 8. Threat model (summary)
Assets: access codes, sessions, IG tokens, app secret/pepper/service key, client data, audit log.
Actors: anonymous attacker, curious/malicious client, compromised client device, stolen admin device, forged Meta webhooks.
Key threats → controls:
- Code guessing → 69-bit codes + IP rate-limit + global ceiling + generic errors.
- Code leak → instant revoke/regenerate, session kill, audit.
- Cross-tenant access (IDOR) → RLS with JWT claim + server scoping + tests that try other IDs.
- Session theft → HttpOnly/Secure/__Host cookies, hashed tokens, CSP, no third-party scripts.
- XSS → React escaping, no `dangerouslySetInnerHTML`, strict CSP (nonce), sanitise rule text before sending to IG.
- CSRF → SameSite + Origin checks.
- Forged/replayed webhooks → signature verification + idempotency table.
- OAuth token theft → encrypted at rest, never sent to browser, `state` param.
- Subscription bypass → `canAutomate` server-side in every path; client has no write access to subscription tables.
- Admin abuse/compromise → passkeys, recovery codes, step-up, append-only audit.
- Automation abuse/spam → cooldown, per-account rate limits, admin kill switch.
- Secret leakage → `.env.example` only in git, secret scanning (gitleaks) in CI, no secrets in logs.
Headers: HSTS, CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, restrictive CORS (same origin only).

## 9. Tests that must exist before declaring phases done
Client A cannot read/modify client B (direct API + forged IDs + RLS SQL tests) · client cannot change subscription/status · client cannot reach admin routes · expired/paused/disabled ⇒ no automation and webhook events ignored · revoked code ⇒ login fails and sessions die · rate limit triggers after N failures · invalid webhook signature ⇒ 401 · duplicate webhook ⇒ processed once · no secrets in client bundle (build-output grep) · RTL + mobile Playwright snapshots · reduced-motion renders final welcome state · typecheck, lint, build pass.

## 10. Environment variables (`.env.example`, names only)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SIGNING_KEY=
ACCESS_CODE_PEPPER=
SESSION_SECRET=
TOKEN_ENCRYPTION_KEY=
ADMIN_SETUP_TOKEN=
WEBAUTHN_RP_ID=
WEBAUTHN_ORIGIN=
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
APP_TIMEZONE=Asia/Damascus
```

## 11. Cost notes (verify before go-live)
Development: free. Hosting: Cloudflare Workers free plan (commercial use allowed; daily request cap). DB: Supabase free (size cap, pause on inactivity, no PITR backups — plan a weekly `pg_dump` via GitHub Actions). Meta APIs: no fee, but App Review/Business Verification required. Domain name: paid (optional but recommended for passkeys/branding).
