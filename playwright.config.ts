import { createHash } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the production build against a throwaway local
// Postgres database (DB_DRIVER=pg). Secrets here are test-only values.
const PORT = 3100;
export const E2E_SETUP_TOKEN = "e2e-setup-token-0123456789abcdef";
export const E2E_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/khatib_e2e";
export const E2E_PEPPER = "e2e-pepper-e2e-pepper-e2e-pepper-0001";
export const E2E_SESSION_SECRET = "e2e-session-e2e-session-e2e-session-01";
// Test-only secrets, derived at runtime (same value in every test process) so
// no secret-looking literal is committed.
const derive = (label: string) => createHash("sha256").update(`khatib-e2e:${label}`).digest();
export const E2E_META_SECRET = derive("meta-app-secret").toString("hex");
export const E2E_CRON_SECRET = derive("cron-secret").toString("hex");
const E2E_TOKEN_KEY = derive("token-encryption-key").toString("base64");
export const MOCK_META = "http://127.0.0.1:3299";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" } },
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, locale: "ar", timezoneId: "Asia/Damascus", colorScheme: "dark" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    { command: "node tests/e2e/mock-meta.mjs", url: `${MOCK_META}/__calls`, reuseExistingServer: false, timeout: 20_000 },
    {
    // Always a fresh Node build: a Cloudflare build (KTS_WORKER_BUILD=1) has the local DB driver compiled out.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DB_DRIVER: "pg",
      DATABASE_URL: E2E_DATABASE_URL,
      ACCESS_CODE_PEPPER: E2E_PEPPER,
      SESSION_SECRET: E2E_SESSION_SECRET,
      ADMIN_SETUP_TOKEN: E2E_SETUP_TOKEN,
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: `http://localhost:${PORT}`,
      SUPPORT_WHATSAPP_URL: "https://wa.me/4368181700732",
      META_APP_ID: "1234567890",
      META_APP_SECRET: E2E_META_SECRET,
      META_WEBHOOK_VERIFY_TOKEN: "e2e-verify-token-0123456789",
      TOKEN_ENCRYPTION_KEY: E2E_TOKEN_KEY,
      CRON_SECRET: E2E_CRON_SECRET,
      META_GRAPH_URL: MOCK_META,
      META_OAUTH_URL: MOCK_META,
      META_AUTHORIZE_URL: MOCK_META,
    },
    },
  ],
});
