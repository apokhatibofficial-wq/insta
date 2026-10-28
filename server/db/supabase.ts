import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintClientJwt } from "../auth/jwt";
import { assertFnName, toDbError, type Db, type RpcArgs } from "./types";

type Config = { url: string; anonKey: string; serviceKey: string; signingKey: string };

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function createSupabaseDb(cfg: Config): Db {
  const service: SupabaseClient = createClient(cfg.url, cfg.serviceKey, noSession);

  async function run<T>(client: SupabaseClient, fn: string, args: RpcArgs = {}): Promise<T> {
    assertFnName(fn);
    const { data, error } = await client.rpc(fn, args);
    if (error) throw toDbError(error.message);
    return data as T;
  }

  return {
    service: (fn, args) => run(service, fn, args),
    async asClient(clientId, fn, args) {
      // A fresh ≤5-minute JWT per call: role=authenticated + client_id claim.
      const jwt = await mintClientJwt(cfg.signingKey, clientId);
      const scoped = createClient(cfg.url, cfg.anonKey, {
        ...noSession,
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      return run(scoped, fn, args);
    },
  };
}
