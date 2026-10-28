"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshPostsAction } from "../actions";

export function RefreshPosts() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {msg && <span style={{ fontSize: 13, color: "var(--muted-2)" }}>{msg}</span>}
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshPostsAction();
            setMsg(r.ok ? "حُدّثت المنشورات" : "تعذّر التحديث الآن");
            if (r.ok) router.refresh();
          })
        }
      >
        {pending && <span className="spinner" aria-hidden />}
        تحديث من إنستغرام
      </button>
    </div>
  );
}
