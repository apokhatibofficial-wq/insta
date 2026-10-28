// Deploys the store's Telegram bot (telegram-bot/) to Cloudflare Workers and
// points the bot's webhook at it.
//
// Needs: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, TELEGRAM_BOT_TOKEN (from @BotFather).
// Optional: MANAGER_CHAT_ID (the manager gets it by sending /id to the bot).

import { execFileSync } from "node:child_process";
import { webhookSecret } from "../telegram-bot/secret.js";

const ROOT = new URL("..", import.meta.url).pathname;
// Secrets pasted into a UI often carry a trailing newline.
const envVar = (k) => process.env[k]?.trim() || undefined;
const need = (k) => {
  const v = envVar(k);
  if (!v) throw new Error(`Missing ${k}: add it as a repository secret`);
  return v;
};
const log = (...a) => console.log("•", ...a);

const token = need("TELEGRAM_BOT_TOKEN");
if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error("TELEGRAM_BOT_TOKEN does not look like a BotFather token (123456:ABC…)");
const manager = envVar("MANAGER_CHAT_ID");
if (manager && !/^-?\d+$/.test(manager)) throw new Error("MANAGER_CHAT_ID must be the number the bot shows for /id");

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

const wrangler = (args, input) =>
  execFileSync("npx", ["wrangler", ...args, "--config", "telegram-bot/wrangler.jsonc"], {
    cwd: ROOT,
    input,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: need("CLOUDFLARE_API_TOKEN"), CLOUDFLARE_ACCOUNT_ID: need("CLOUDFLARE_ACCOUNT_ID") },
    stdio: ["pipe", "pipe", "inherit"],
  }).toString();

const bot = await tg("getMe");
log(`bot @${bot.username}`);

log("deploying Worker…");
const url = wrangler(["deploy"]).match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
if (!url) throw new Error("could not read the workers.dev URL from wrangler output");

log("setting Worker secrets…");
wrangler(["secret", "bulk"], JSON.stringify({ TELEGRAM_BOT_TOKEN: token, ...(manager ? { MANAGER_CHAT_ID: manager } : {}) }));

log("setting webhook…");
await tg("setWebhook", { url, secret_token: await webhookSecret(token), allowed_updates: ["message"], drop_pending_updates: false });
await tg("setMyCommands", { commands: [{ command: "start", description: "القائمة الرئيسية" }] });

// Smoke checks: the Worker rejects unsigned calls, and Telegram reports no delivery error.
const unsigned = await fetch(url, { method: "POST", body: "{}" });
log(`${unsigned.status === 401 ? "ok  " : "FAIL"} unsigned webhook call → ${unsigned.status}`);
const info = await tg("getWebhookInfo");
const hookOk = info.url === url && !info.last_error_message;
log(`${hookOk ? "ok  " : "FAIL"} webhook ${info.url}${info.last_error_message ? ` (${info.last_error_message})` : ""}`);
if (unsigned.status !== 401 || !hookOk) process.exitCode = 1;

log(`bot ready: https://t.me/${bot.username}`);
log(manager ? "manager chat: set" : "manager chat: NOT set — send /id to the bot, save it as MANAGER_CHAT_ID, run again");
if (process.env.GITHUB_STEP_SUMMARY) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Telegram bot\n\nhttps://t.me/${bot.username}\n\nManager chat: ${manager ? "set" : "not set (send /id to the bot, add MANAGER_CHAT_ID, run again)"}\n`,
    { flag: "a" },
  );
}
