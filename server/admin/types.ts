export type SubState = "active" | "paused" | "expired" | "none";

export type SubSummary = {
  state: SubState;
  starts_on?: string;
  ends_on?: string;
  days_left?: number;
  total_days?: number;
  today: string;
};

export type BotState = "disabled" | "sub_paused" | "sub_expired" | "admin" | "wait" | "err" | "paused" | "run";

export type ClientRow = {
  id: string;
  public_id: string;
  name: string;
  status: "active" | "disabled" | "archived";
  created_at: string;
  subscription: SubSummary;
  ig: { status: "ok" | "needs_reconnect" | "none"; username: string | null };
  bot_state: BotState;
  last_activity: string | null;
};

export type AuditEntry = {
  action: string;
  actor_type: "admin" | "system" | "client";
  details: Record<string, unknown>;
  created_at: string;
};

export type ClientDetail = ClientRow & {
  code: { status: "active" | "revoked"; created_at: string } | null;
  sessions: { active: number; last_login: string | null };
  bot: { admin_allowed: boolean; client_enabled: boolean } | null;
  ig_updated_at: string | null;
  log: AuditEntry[];
};
