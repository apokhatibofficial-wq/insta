// LOCAL ONLY: drops and recreates a database on a plain PostgreSQL server,
// applies the Supabase compatibility shim and then every migration in order.
// Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/khatib_dev node scripts/db-local-reset.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/khatib_dev");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error("Refusing to reset a non-local database:", url.hostname);
  process.exit(1);
}
const dbName = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error("bad database name");

const admin = new URL(url);
admin.pathname = "/postgres";
const root = new pg.Client({ connectionString: admin.toString() });
await root.connect();
await root.query(`drop database if exists ${dbName} with (force)`);
await root.query(`create database ${dbName}`);
await root.end();

const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const dir = new URL("../supabase/", import.meta.url).pathname;
const files = [
  join(dir, "local/00_supabase_shim.sql"),
  ...readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, "migrations", f)),
];
for (const f of files) {
  await db.query(readFileSync(f, "utf8"));
  console.log("applied", f.slice(dir.length));
}
await db.end();
