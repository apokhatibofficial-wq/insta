import "server-only";
import pg from "pg";
import { assertFnName, toDbError, type Db, type RpcArgs } from "./types";

// LOCAL DEVELOPMENT / TESTS ONLY (DB_DRIVER=pg). Talks to a plain Postgres
// that has the migrations applied, emulating exactly what PostgREST does per
// request: SET LOCAL ROLE + request.jwt.claims, then call the function.

function argName(k: string): string {
  if (!/^p_[a-z0-9_]+$/.test(k)) throw new Error("bad argument name");
  return k;
}

export function createPgDb(connectionString: string): Db & { end(): Promise<void> } {
  const pool = new pg.Pool({ connectionString, max: 5 });

  async function call<T>(role: "service_role" | "authenticated", claims: object, fn: string, args: RpcArgs = {}) {
    assertFnName(fn);
    const keys = Object.keys(args).map(argName);
    const params = keys.map((k) => args[k]);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${role}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const res = await c.query(sql, params);
      await c.query("commit");
      return (res.rows[0]?.r ?? null) as T;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw toDbError(e instanceof Error ? e.message : undefined);
    } finally {
      c.release();
    }
  }

  return {
    service: (fn, args) => call("service_role", { role: "service_role" }, fn, args),
    asClient: (clientId, fn, args) =>
      call("authenticated", { role: "authenticated", client_id: clientId, aud: "authenticated" }, fn, args),
    end: () => pool.end(),
  };
}
