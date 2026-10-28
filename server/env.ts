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
