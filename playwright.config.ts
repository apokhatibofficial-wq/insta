import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the production build against a throwaway local
// Postgres database (DB_DRIVER=pg). Secrets here are test-only values.
const PORT = 3100;
export const E2E_SETUP_TOKEN = "e2e-setup-token-0123456789abcdef";

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
  webServer: {
    // Always a fresh Node build: a Cloudflare build (KTS_WORKER_BUILD=1) has the local DB driver compiled out.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DB_DRIVER: "pg",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/khatib_e2e",
      ACCESS_CODE_PEPPER: "e2e-pepper-e2e-pepper-e2e-pepper-0001",
      SESSION_SECRET: "e2e-session-e2e-session-e2e-session-01",
      ADMIN_SETUP_TOKEN: E2E_SETUP_TOKEN,
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: `http://localhost:${PORT}`,
      SUPPORT_WHATSAPP_URL: "https://wa.me/4368181700732",
    },
  },
});
