import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every page is dynamic (per-request auth + CSP nonce).
export default defineCloudflareConfig({});
