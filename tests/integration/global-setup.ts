import { execFileSync } from "node:child_process";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/khatib_test";

// Recreates the local test database from the migrations before every run.
export default function setup() {
  execFileSync("node", ["scripts/db-local-reset.mjs"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
