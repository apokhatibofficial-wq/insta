import "server-only";
import { env } from "../env";
import type { Db } from "./types";

let db: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  db ??= (async () => {
    const e = env();
    if (e.DB_DRIVER === "pg") {
      if (process.env.KTS_PG_DRIVER !== "enabled") throw new Error("DB_DRIVER=pg is not available in this build");
      const { createPgDb } = await import("./pg");
      return createPgDb(e.DATABASE_URL!);
    }
    const { createSupabaseDb } = await import("./supabase");
    return createSupabaseDb({
      url: e.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      serviceKey: e.SUPABASE_SERVICE_ROLE_KEY!,
      signingKey: e.SUPABASE_JWT_SIGNING_KEY!,
    });
  })();
  return db;
}

export { DbError } from "./types";
