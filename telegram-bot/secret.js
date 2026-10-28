// Webhook secret derived from the bot token, so it needs no extra configuration.
// Shared by the Worker and scripts/deploy-telegram-bot.mjs.
export async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`webhook:${token}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
