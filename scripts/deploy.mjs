// Trial deployment: Supabase (free) + Cloudflare Workers (free, *.workers.dev).
//
// Needs (environment, never committed):
//   SUPABASE_ACCESS_TOKEN   personal access token (supabase.com → Account → Access Tokens)
//   SUPABASE_ORG_SLUG       organisation to create the project in (not secret)
//   CLOUDFLARE_API_TOKEN    "Edit Cloudflare Workers" template (+ Account Analytics: Read)
//   CLOUDFLARE_ACCOUNT_ID
// Optional: SUPABASE_PROJECT_REF (reuse an existing project), SUPABASE_REGION (default eu-central-1).
//
// Generated secrets and the project ref are kept in .deploy/state.json
// (gitignored, mode 600) so re-running never rotates the pepper or session
// secret (which would invalidate every access code and session).
// Nothing secret is printed. The one-time admin setup token is written to
// .deploy/ADMIN_SETUP_TOKEN.txt for the owner to open.

import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportJWK, generateKeyPair } from "jose";

const ROOT = new URL("..", import.meta.url).pathname;
const STATE_DIR = join(ROOT, ".deploy");
const STATE = join(STATE_DIR, "state.json");
const API = "https://api.supabase.com/v1";

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing environment variable ${k}`);
  return v;
};
const log = (...a) => console.log("•", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });

async function sb(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${need("SUPABASE_ACCESS_TOKEN")}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");

// ---------------------------------------------------------------------------
// 1. Supabase project
// ---------------------------------------------------------------------------
async function ensureProject() {
  state.projectRef ??= process.env.SUPABASE_PROJECT_REF;
  if (!state.projectRef) {
    state.dbPass ??= secret(24);
    save();
    log("creating Supabase project (free plan)…");
    const p = await sb("POST", "/projects", {
      name: "khatib-platform",
      organization_slug: need("SUPABASE_ORG_SLUG"),
      db_pass: state.dbPass,
      region_selection: { type: "specific", code: process.env.SUPABASE_REGION ?? "eu-central-1" },
    });
    state.projectRef = p.ref ?? p.id;
    save();
  }
  log(`project ${state.projectRef}: waiting until healthy…`);
  for (let i = 0; i < 90; i++) {
    const p = await sb("GET", `/projects/${state.projectRef}`);
    if (p.status === "ACTIVE_HEALTHY") return;
    await sleep(10_000);
  }
  throw new Error("project did not become healthy in 15 minutes");
}

// ---------------------------------------------------------------------------
// 2. Migrations (idempotent: tracked in a small table)
// ---------------------------------------------------------------------------
async function sql(query) {
  return sb("POST", `/projects/${state.projectRef}/database/query`, { query });
}

async function migrate() {
  // Own schema (not exposed by the Data API), so migration 1's "RLS on every public table" loop never touches it.
  await sql("create schema if not exists kts_meta; revoke all on schema kts_meta from public, anon, authenticated; create table if not exists kts_meta.migrations (name text primary key, applied_at timestamptz not null default now());");
  const done = new Set((await sql("select name from kts_meta.migrations")).map((r) => r.name));
  const dir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    log(`applying ${f}`);
    const body = readFileSync(join(dir, f), "utf8");
    await sql(`begin;\n${body}\ninsert into kts_meta.migrations (name) values ('${f.replace(/'/g, "")}');\ncommit;`);
  }
}

// ---------------------------------------------------------------------------
// 3. Our ES256 signing key (decision 1B) and API keys
// ---------------------------------------------------------------------------
async function ensureSigningKey() {
  if (!state.signingJwk) {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = await exportJWK(privateKey);
    state.signingJwk = { ...jwk, kid: randomUUID(), alg: "ES256", use: "sig", key_ops: ["sign", "verify"], ext: true };
    save();
  }
  const { keys } = await sb("GET", `/projects/${state.projectRef}/config/auth/signing-keys`);
  let mine = keys.find((k) => k.id === state.signingKeyId || k.public_jwk?.kid === state.signingJwk.kid);
  if (!mine) {
    log("importing ES256 signing key…");
    mine = await sb("POST", `/projects/${state.projectRef}/config/auth/signing-keys`, {
      algorithm: "ES256",
      status: "standby",
      private_jwk: state.signingJwk,
    });
    state.signingKeyId = mine.id;
    save();
  }
  if (mine.status !== "in_use") {
    log("activating signing key…");
    await sb("PATCH", `/projects/${state.projectRef}/config/auth/signing-keys/${mine.id}`, { status: "in_use" });
  }
}

async function apiKeys() {
  const list = await sb("GET", `/projects/${state.projectRef}/api-keys?reveal=true`);
  const find = (t) => list.find((k) => k.type === t && k.api_key);
  let pub = find("publishable");
  let sec = find("secret");
  if (!pub) pub = await sb("POST", `/projects/${state.projectRef}/api-keys?reveal=true`, { type: "publishable", name: "khatib_web" });
  if (!sec) sec = await sb("POST", `/projects/${state.projectRef}/api-keys?reveal=true`, { type: "secret", name: "khatib_server" });
  return { publishable: pub.api_key, secret: sec.api_key };
}

// ---------------------------------------------------------------------------
// 4. Cloudflare Worker
// ---------------------------------------------------------------------------
function wrangler(args, input) {
  return execFileSync("npx", ["wrangler", ...args], {
    cwd: ROOT,
    input,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: need("CLOUDFLARE_API_TOKEN"), CLOUDFLARE_ACCOUNT_ID: need("CLOUDFLARE_ACCOUNT_ID") },
    stdio: ["pipe", "pipe", "inherit"],
  }).toString();
}

async function deployWorker(keys) {
  log("building for Cloudflare…");
  execFileSync("npm", ["run", "cf:build"], { cwd: ROOT, stdio: "inherit" });
  log("deploying Worker…");
  const out = wrangler(["deploy"]);
  const url = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
  if (!url) throw new Error("could not read the workers.dev URL from wrangler output");
  state.url = url;

  state.secrets ??= {
    ACCESS_CODE_PEPPER: secret(32),
    SESSION_SECRET: secret(32),
    ADMIN_SETUP_TOKEN: secret(24),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: secret(32),
    META_WEBHOOK_VERIFY_TOKEN: secret(24),
  };
  save();
  const all = {
    ...state.secrets,
    NEXT_PUBLIC_SUPABASE_URL: `https://${state.projectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keys.publishable,
    SUPABASE_SERVICE_ROLE_KEY: keys.secret,
    SUPABASE_JWT_SIGNING_KEY: JSON.stringify(state.signingJwk),
    WEBAUTHN_RP_ID: new URL(url).hostname,
    WEBAUTHN_ORIGIN: url,
    SUPPORT_WHATSAPP_URL: "https://wa.me/4368181700732",
  };
  log("setting Worker secrets…");
  wrangler(["secret", "bulk"], JSON.stringify(all));
  writeFileSync(join(STATE_DIR, "ADMIN_SETUP_TOKEN.txt"), `${state.secrets.ADMIN_SETUP_TOKEN}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// 5. Smoke checks
// ---------------------------------------------------------------------------
async function smoke() {
  const u = state.url;
  const check = async (path, want, init) => {
    const r = await fetch(u + path, { redirect: "manual", ...init });
    const ok = want.includes(r.status);
    log(`${ok ? "ok  " : "FAIL"} ${init?.method ?? "GET"} ${path} → ${r.status}`);
    return { ok, r };
  };
  const results = [
    await check("/login", [200]),
    await check("/admin/login", [307, 308]),
    await check("/admin/setup", [200]),
    await check("/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1", [403]),
    await check("/api/jobs/daily", [401], { method: "POST" }),
    await check("/robot/robot-wink.webp", [200]),
  ];
  const h = (await fetch(u + "/login")).headers;
  const csp = h.get("content-security-policy") ?? "";
  log(`${csp.includes("frame-ancestors 'none'") ? "ok  " : "FAIL"} security headers`);
  if (results.some((x) => !x.ok)) process.exitCode = 1;
}

await ensureProject();
await migrate();
await ensureSigningKey();
const keys = await apiKeys();
await deployWorker(keys);
await smoke();
log(`deployed: ${state.url}`);
log("admin setup token: open .deploy/ADMIN_SETUP_TOKEN.txt (shown nowhere else)");
