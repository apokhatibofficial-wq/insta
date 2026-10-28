import type { Metadata } from "next";
import { ClientShell } from "@/components/client/ClientShell";
import type { Post } from "@/lib/posts";
import { getClientContext } from "@/server/client/context";
import type { SavedRule } from "../actions";
import { RepliesEditor } from "./RepliesEditor";

export const metadata: Metadata = { title: "الردود والكلمات — KHATIB" };

type RulesData = { can_edit: boolean; cooldown_hours: number; rules: SavedRule[]; posts: Post[] };

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  const { clientId, db, me } = await getClientContext();
  const data = await db.asClient<RulesData>(clientId, "client_rules_get");
  const q = (await searchParams).post;
  const initialPost = q && data.posts.some((p) => p.id === q) ? q : "all";
  return (
    <ClientShell wide>
      <RepliesEditor
        initialRules={data.rules}
        posts={data.posts}
        initialPost={initialPost}
        cooldown={data.cooldown_hours}
        readOnly={!data.can_edit}
        account={me.ig?.username ?? null}
      />
    </ClientShell>
  );
}
