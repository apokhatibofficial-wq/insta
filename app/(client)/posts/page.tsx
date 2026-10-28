import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import type { Post } from "@/lib/posts";
import { getClientContext } from "@/server/client/context";
import { PostsView } from "./PostsView";

export const metadata: Metadata = { title: "المنشورات — KHATIB" };

type RulesData = { rules: { enabled: boolean; scope: "all" | "posts"; post_ids: string[] }[]; posts: Post[] };

export default async function PostsPage() {
  const { clientId, db, me } = await getClientContext();
  const data = await db.asClient<RulesData>(clientId, "client_rules_get");
  const ruleCount: Record<string, { total: number; enabled: number }> = {};
  for (const r of data.rules) {
    for (const id of r.post_ids) {
      const c = (ruleCount[id] ??= { total: 0, enabled: 0 });
      c.total++;
      if (r.enabled) c.enabled++;
    }
  }
  return (
    <ClientShell wide>
      <PostsView
        posts={data.posts}
        ruleCount={ruleCount}
        generalCount={data.rules.filter((r) => r.scope === "all").length}
        igConnected={me.ig?.status === "ok"}
      />
    </ClientShell>
  );
}
