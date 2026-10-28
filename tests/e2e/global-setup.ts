import { execFileSync } from "node:child_process";

export default function setup() {
  execFileSync("node", ["scripts/db-local-reset.mjs"], {
    env: { ...process.env, DATABASE_URL: "postgres://postgres:postgres@localhost:5432/khatib_e2e" },
    stdio: "inherit",
  });
}
