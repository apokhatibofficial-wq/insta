// Fails if anything secret (or server-only code) ended up in files the browser
// can download. Run after `next build`. Usage:
//   node scripts/check-bundle-secrets.mjs [--env-file .env.local]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SIGNING_KEY",
  "ACCESS_CODE_PEPPER",
  "SESSION_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "ADMIN_SETUP_TOKEN",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "DATABASE_URL",
  "CRON_SECRET",
];

const envFileArg = process.argv.indexOf("--env-file");
const values = { ...process.env };
if (envFileArg > 0) {
  for (const line of readFileSync(process.argv[envFileArg + 1], "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) values[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

const needles = [
  // Actual secret values (never printed).
  ...SECRET_VARS.filter((k) => (values[k] ?? "").length >= 8).map((k) => ({ label: `value of ${k}`, text: values[k] })),
  // Names of secrets and server-only internals.
  ...SECRET_VARS.map((k) => ({ label: `name ${k}`, text: k })),
  { label: "PEM private key", text: "-----BEGIN" },
  { label: "server db function", text: "admin_client_create" },
  { label: "server db function", text: "client_session_resolve" },
  { label: "server module", text: "createPgDb" },
  { label: "HMAC prefix", text: "admin-session:" },
];
const jwtLike = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./;

const roots = [".next/static", "public", ".open-next/assets"].filter(existsSync);
if (!roots.includes(".next/static")) {
  console.error("Run `next build` first (.next/static not found).");
  process.exit(2);
}

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let problems = 0;
let scanned = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    if (/\.(png|webp|jpe?g|gif|woff2?|ico)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    scanned++;
    for (const n of needles) {
      if (text.includes(n.text)) {
        problems++;
        console.error(`LEAK: ${n.label} found in ${file}`);
      }
    }
    if (jwtLike.test(text)) {
      problems++;
      console.error(`LEAK: JWT-like string in ${file}`);
    }
  }
}
console.log(`scanned ${scanned} browser-reachable files in ${roots.join(", ")}`);
if (problems) {
  console.error(`${problems} problem(s) found`);
  process.exit(1);
}
console.log("no secrets or server-only code found in client bundles");
