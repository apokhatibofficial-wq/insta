"use client";

import { useState } from "react";
import Link from "next/link";
import { RobotImg } from "@/components/robot/RobotImg";
import { PostThumb } from "@/components/client/PostThumb";
import { RefreshPosts } from "./RefreshPosts";
import { IconSearch } from "@/components/ui/icons";
import { formatDayMonth } from "@/lib/dates";
import { commentsLabel } from "@/lib/events";
import { postKind, postTone, rulesCountLabel, type Post } from "@/lib/posts";

type Filter = "all" | "with" | "without";

export function PostsView({
  posts,
  ruleCount,
  generalCount,
  igConnected,
}: {
  posts: Post[];
  ruleCount: Record<string, { total: number; enabled: number }>;
  generalCount: number;
  igConnected: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = query.trim();
  const list = posts.filter((p) => {
    const n = ruleCount[p.id]?.total ?? 0;
    if (filter === "with" && n === 0) return false;
    if (filter === "without" && n > 0) return false;
    return !q || p.caption.includes(q);
  });

  return (
    <>
      <div className="page-head">
        <div className="page-title">
          <h1>المنشورات</h1>
          <p>اختر منشورًا لتحدد الكلمات التي يرد عليها البوت في تعليقاته.</p>
        </div>
        {igConnected && <RefreshPosts />}
      </div>

      <div className="toolbar">
        <div className="search" style={{ maxWidth: 380, minWidth: 240 }}>
          <IconSearch />
          <input type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في نص المنشور" aria-label="بحث في المنشورات" />
        </div>
        <div role="tablist" aria-label="تصفية" className="segmented">
          {(
            [
              ["all", "الكل"],
              ["with", "عليها قواعد"],
              ["without", "بلا قواعد"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="post-grid">
        <Link href="/replies?post=all" className="post-card">
          <span className="post-general">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
            </svg>
            <span style={{ fontSize: 17, fontWeight: 600 }}>القواعد العامة</span>
            <span style={{ fontSize: 13, color: "var(--muted-2)", padding: "0 20px", textAlign: "center", lineHeight: 1.6 }}>تعمل على كل المنشورات، والجديدة أيضًا</span>
          </span>
          <span className="post-foot">
            <span style={{ color: "var(--text-2)" }}>{rulesCountLabel(generalCount, false)}</span>
            <span style={{ color: "var(--muted-2)" }}>فتح ←</span>
          </span>
        </Link>
        {list.map((p) => {
          const rc = ruleCount[p.id] ?? { total: 0, enabled: 0 };
          const pausedOnly = rc.total > 0 && rc.enabled === 0;
          return (
            <Link key={p.id} href={`/replies?post=${p.id}`} className="post-card" aria-label={`إعداد ردود منشور: ${p.caption}`}>
              <span className="post-tile" style={{ background: postTone(p.id) }}>
                <PostThumb src={p.image} />
                <span className="post-badge" style={{ left: 12 }}>
                  {postKind(p.media_type)}
                </span>
                {rc.enabled > 0 && (
                  <span className="post-badge" style={{ right: 12, color: "#4cc38a", gap: 6 }}>
                    <span className="dot" style={{ width: 6, height: 6, background: "#4cc38a" }} />
                    البوت يعمل هنا
                  </span>
                )}
                <span className="post-caption">{p.caption}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 16px 16px" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, whiteSpace: "nowrap" }}>
                  <span style={{ color: rc.enabled ? "var(--success)" : "var(--muted)" }}>
                    {pausedOnly ? "قاعدة خاصة (معطّلة)" : rulesCountLabel(rc.total)}
                  </span>
                  <span style={{ color: "var(--muted-2)" }}>{p.posted_at ? formatDayMonth(p.posted_at) : ""}</span>
                </span>
                <span style={{ fontSize: 12, color: "var(--muted-2)" }}>
                  {commentsLabel(p.comments_count)} · رد البوت على {p.replied}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {posts.length === 0 ? (
        <div className="empty">
          <RobotImg name="robot-wink" className="" style={{ width: 110, filter: "var(--robot-filter)" }} />
          <span className="empty-title">لا توجد منشورات بعد</span>
          <span className="empty-sub">
            {igConnected ? "ستظهر منشوراتك هنا بعد مزامنتها من إنستغرام." : "ستظهر منشوراتك هنا بعد ربط حساب إنستغرام. يمكنك الآن إعداد القواعد العامة."}
          </span>
        </div>
      ) : (
        list.length === 0 && (
          <div className="empty">
            <RobotImg name="robot-point" className="" style={{ width: 110, filter: "var(--robot-filter)" }} />
            <span className="empty-title">لا توجد منشورات تطابق البحث</span>
          </div>
        )
      )}
    </>
  );
}
