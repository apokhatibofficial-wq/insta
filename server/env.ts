import "server-only";
import { z } from "zod";

// Secrets are read on the server only and validated once per isolate.
// Values are never logged; errors name the variable, never its content.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_JWT_SIGNING_KEY: z.string().min(20).optional(),
  ACCESS_CODE_PEPPER: z.string().min(32, "ACCESS_CODE_PEPPER must be at least 32 characters"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ADMIN_SETUP_TOKEN: z.string().min(24).optional(),
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_ORIGIN: z.string().url(),
  SUPPORT_WHATSAPP_URL: z.string().url().default("https://wa.me/4368181700732"),
  // Meta / Instagram (Phase 4). Without them the connect button stays disabled.
  META_APP_ID: z.string().regex(/^[0-9]{5,30}$/).optional(),
  META_APP_SECRET: z.string().min(16).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  // Shared secret for the internal daily job route (called by the Worker cron).
  CRON_SECRET: z.string().min(32).optional(),
  // Overridable only for local tests against a mock Meta server.
  META_GRAPH_URL: z.string().url().default("https://graph.instagram.com"),
  META_OAUTH_URL: z.string().url().default("https://api.instagram.com"),
  META_AUTHORIZE_URL: z.string().url().default("https://www.instagram.com"),
  META_GRAPH_VERSION: z.string().regex(/^v[0-9]+\.[0-9]+$/).default("v26.0"),
  DB_DRIVER: z.enum(["supabase", "pg"]).default("supabase"),
  DATABASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  const e = parsed.data;
  if (e.DB_DRIVER === "supabase") {
    for (const k of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_JWT_SIGNING_KEY",
    ] as const) {
      if (!e[k]) throw new Error(`Missing environment variable: ${k}`);
    }
  } else if (!e.DATABASE_URL) {
    throw new Error("Missing environment variable: DATABASE_URL");
  }
  cached = e;
  return e;
}

/** True when everything needed to talk to Meta is configured. */
export function metaConfigured(): boolean {
  const e = env();
  return !!(e.META_APP_ID && e.META_APP_SECRET && e.META_WEBHOOK_VERIFY_TOKEN && e.TOKEN_ENCRYPTION_KEY);
}
