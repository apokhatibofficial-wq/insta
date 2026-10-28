export type RpcArgs = Record<string, unknown>;

/**
 * The only way server code talks to the database.
 * - `service`: server/system calls with service_role (admin & auth flows).
 * - `asClient`: runs with the client's own short-lived JWT, so Postgres RLS
 *   limits every read/write to that tenant.
 * Every call is a single Postgres function = one atomic transaction.
 */
export interface Db {
  service<T>(fn: string, args?: RpcArgs): Promise<T>;
  asClient<T>(clientId: string, fn: string, args?: RpcArgs): Promise<T>;
}

/** Error raised by a database function, with its stable message code. */
export class DbError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DbError";
  }
}

const KNOWN = new Set([
  "admin_auth_required",
  "client_auth_required",
  "stepup_required",
  "not_found",
  "invalid_input",
  "setup_closed",
  "two_passkeys_required",
  "no_current_subscription",
  "renewal_too_far",
]);

export function toDbError(message: string | undefined): DbError {
  const m = (message ?? "").trim();
  return new DbError(KNOWN.has(m) ? m : "db_error");
}

export function assertFnName(fn: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error("bad function name");
}
