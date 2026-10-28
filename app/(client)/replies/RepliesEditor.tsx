"use client";

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RobotImg } from "@/components/robot/RobotImg";
import { PostThumb } from "@/components/client/PostThumb";
import { IconCheck, IconChevronStart, IconPlus, IconX } from "@/components/ui/icons";
import { formatDayMonth } from "@/lib/dates";
import { DM_MAX, REPLY_MAX, isValidLink, normalizeKeyword } from "@/lib/keywords";
import { postKind, postTone, rulesCountLabel, type Post } from "@/lib/posts";
import { deleteRuleAction, saveRuleAction, setCooldownAction, type SavedRule } from "../actions";

type Rule = {
  key: string; // local key (server id once saved)
  id: string | null; // server id
  on: boolean;
  posts: string[];
  words: string[];
  reply: string;
  dm: string;
  link: string;
  scopeSpecific: boolean;
  dirty: boolean;
  fresh: boolean;
};

const fromServer = (r: SavedRule): Rule => ({
  key: r.id,
  id: r.id,
  on: r.enabled,
  posts: r.scope === "posts" ? r.post_ids : [],
  words: r.keywords,
  reply: r.public_reply,
  dm: r.dm_text,
  link: r.link_url,
  scopeSpecific: r.scope === "posts",
  dirty: false,
  fresh: false,
});

const isGeneral = (r: Rule) => !r.scopeSpecific && r.posts.length === 0;
const applies = (r: Rule, postId: string) => isGeneral(r) || r.posts.includes(postId);
const overlap = (a: Rule, b: Rule) =>
  isGeneral(a) && isGeneral(b) ? true : isGeneral(a) || isGeneral(b) ? false : a.posts.some((p) => b.posts.includes(p));

export function RepliesEditor({
  initialRules,
  posts,
  initialPost,
  cooldown: initialCooldown,
  readOnly,
  account,
}: {
  initialRules: SavedRule[];
  posts: Post[];
  initialPost: string;
  cooldown: number;
  readOnly: boolean;
  account: string | null;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(() => initialRules.map(fromServer));
  const [post, setPost] = useState(initialPost);
  const [sel, setSel] = useState<string | null>(null);
  const [kwInput, setKwInput] = useState("");
  const [cooldown, setCooldown] = useState(String(initialCooldown));
  const [picker, setPicker] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverClash, setServerClash] = useState<string[]>([]);
  const [error, setError] = useState("");

  const postById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const curPost = post === "all" ? null : (postById.get(post) ?? null);

  const visible = useMemo(() => {
    if (!curPost) return rules.filter(isGeneral);
    return rules
      .filter((r) => applies(r, curPost.id))
      .sort((a, b) => Number(!isGeneral(b) && b.posts.length > 0) - Number(!isGeneral(a) && a.posts.length > 0));
  }, [rules, curPost]);
  const r = visible.find((x) => x.key === sel) ?? visible[0] ?? null;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setPicker(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };
  const patch = (p: Partial<Rule>) => {
    if (!r || readOnly) return;
    setServerClash([]);
    setRules((all) => all.map((x) => (x.key === r.key ? { ...x, ...p, dirty: true } : x)));
  };
  const pickPost = (id: string) => {
    setPost(id);
    setSel(null);
    setKwInput("");
    router.replace(`/replies?post=${id}`, { scroll: false });
  };

  const countFor = (id: string) => rules.filter((x) => x.posts.includes(id)).length;
  const generalCount = rules.filter(isGeneral).length;

  const specificWords = new Set(
    curPost ? rules.filter((x) => x.posts.includes(curPost.id) && x.on).flatMap((x) => x.words.map(normalizeKeyword)) : [],
  );

  // ---- validation of the selected rule (mirrors the server) ----
  const clash = r
    ? r.words.filter(
        (w) =>
          serverClash.includes(w) ||
          rules.some((x) => x.key !== r.key && overlap(x, r) && x.words.some((v) => normalizeKeyword(v) === normalizeKeyword(w))),
      )
    : [];
  const overrides =
    r && !isGeneral(r) ? r.words.filter((w) => rules.some((x) => isGeneral(x) && x.words.some((v) => normalizeKeyword(v) === normalizeKeyword(w)))) : [];
  const linkBad = !!r?.link && !isValidLink(r.link);
  // Meta limits the private message (text + link) to 1000 UTF-8 bytes.
  const dmBytes = r ? new TextEncoder().encode([r.dm.trim(), r.link.trim()].filter(Boolean).join("\n")).length : 0;
  const dmOver = dmBytes > DM_MAX;
  const replyOver = (r?.reply.length ?? 0) > REPLY_MAX;
  const isSpecific = !!r && !isGeneral(r);
  const noPosts = isSpecific && r!.posts.length === 0;
  const empty = !r || r.words.length === 0 || (!r.reply.trim() && !r.dm.trim());
  const cantSave = readOnly || !r || busy || empty || linkBad || dmOver || replyOver || clash.length > 0 || noPosts || !r.dirty;

  const addKw = () => {
    if (!r) return;
    const v = kwInput.trim();
    if (!v) return;
    setKwInput("");
    if (v.length > 60 || r.words.some((w) => normalizeKeyword(w) === normalizeKeyword(v))) return;
    patch({ words: [...r.words, v] });
  };
  const onKwKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "،") {
      e.preventDefault();
      addKw();
    } else if (e.key === "Backspace" && !kwInput && r && r.words.length) {
      patch({ words: r.words.slice(0, -1) });
    }
  };
  const togglePost = (id: string) => {
    if (!r) return;
    const has = r.posts.includes(id);
    patch({ posts: has ? r.posts.filter((p) => p !== id) : [...r.posts, id], scopeSpecific: true });
  };

  const addRule = () => {
    if (readOnly) return;
    const key = `new-${Date.now()}`;
    setRules((all) => [
      { key, id: null, on: true, posts: curPost ? [curPost.id] : [], words: [], reply: "", dm: "", link: "", scopeSpecific: !!curPost, dirty: true, fresh: true },
      ...all,
    ]);
    setSel(key);
    setKwInput("");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (cantSave || !r) return;
    setBusy(true);
    setError("");
    const res = await saveRuleAction({
      id: r.id,
      enabled: r.on,
      scope: isSpecific ? "posts" : "all",
      postIds: isSpecific ? r.posts : [],
      keywords: r.words,
      publicReply: r.reply,
      dmText: r.dm,
      linkUrl: r.link,
    });
    setBusy(false);
    if (res.ok) {
      const saved = fromServer(res.data);
      setRules((all) => all.map((x) => (x.key === r.key ? saved : x)));
      setSel(saved.key);
      flash("حُفظت القاعدة");
    } else if (res.error === "keyword_clash") {
      setServerClash(res.words ?? []);
    } else if (res.error === "read_only") {
      setError("اشتراكك منتهٍ، لذا لا يمكن حفظ التغييرات الآن.");
    } else {
      setError("تعذّر حفظ القاعدة. تحقّق من الحقول وحاول مرة أخرى.");
    }
  };

  const remove = async () => {
    if (!r || readOnly) return;
    if (r.id) {
      setBusy(true);
      const res = await deleteRuleAction(r.id);
      setBusy(false);
      if (!res.ok) {
        setError("تعذّر حذف القاعدة.");
        return;
      }
    }
    setRules((all) => all.filter((x) => x.key !== r.key));
    setSel(null);
    flash("حُذفت القاعدة");
  };

  const changeCooldown = async (v: string) => {
    const prev = cooldown;
    setCooldown(v);
    const res = await setCooldownAction(Number(v));
    if (res.ok) flash("حُفظ");
    else {
      setCooldown(prev);
      setError("تعذّر حفظ إعداد منع التكرار.");
    }
  };

  let host = "";
  try {
    if (r?.link && !linkBad) {
      const u = new URL(r.link);
      host = u.host + u.pathname;
    }
  } catch {
    host = "";
  }
  const pv = r && r.posts.length ? (postById.get(r.posts[0]!) ?? null) : curPost;

  return (
    <>
      <div className="replies-head">
        <div className="page-title">
          <Link href="/posts" className="back-link">
            <IconChevronStart style={{ transform: "scaleX(-1)" }} />
            كل المنشورات
          </Link>
          <h1>الردود والكلمات</h1>
          <p>اختر منشورًا، ثم حدّد الكلمات التي يرد عليها البوت فيه. القواعد العامة تعمل على كل المنشورات.</p>
        </div>
        {!readOnly && (
          <button type="button" className="btn btn-primary" onClick={addRule} style={{ minHeight: 46, borderRadius: 14, gap: 8 }}>
            <IconPlus />
            {curPost ? "قاعدة لهذا المنشور" : "قاعدة عامة"}
          </button>
        )}
      </div>

      {readOnly && (
        <div role="note" className="callout callout-warning">
          اشتراكك منتهٍ: يمكنك عرض ردودك المحفوظة فقط، ويعود التعديل فور التجديد.
        </div>
      )}
      {error && (
        <div role="alert" className="callout callout-danger">
          {error}
        </div>
      )}

      <section aria-labelledby="posts-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 id="posts-h" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            المنشور
          </h2>
          <span style={{ fontSize: 13, color: "var(--muted-2)" }}>{posts.length ? "آخر منشوراتك من إنستغرام" : "ستظهر منشوراتك هنا بعد ربط إنستغرام"}</span>
        </div>
        <div role="listbox" aria-label="اختيار المنشور" className="post-strip">
          <button type="button" role="option" aria-selected={post === "all"} onClick={() => pickPost("all")} className="strip-item">
            <span className="strip-tile strip-all" data-on={post === "all" || undefined}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600 }}>كل المنشورات</span>
            </span>
            <span style={{ fontSize: 12, color: "var(--muted-2)" }}>{rulesCountLabel(generalCount, false)} عامة</span>
          </button>
          {posts.map((p) => {
            const n = countFor(p.id);
            return (
              <button key={p.id} type="button" role="option" aria-selected={post === p.id} onClick={() => pickPost(p.id)} className="strip-item">
                <span className="strip-tile" data-on={post === p.id || undefined} style={{ background: postTone(p.id) }}>
                  <PostThumb src={p.image} />
                  <span className="post-badge" style={{ top: 8, left: 8, height: 22, fontSize: 11, padding: "0 7px", borderRadius: 7 }}>
                    {postKind(p.media_type)}
                  </span>
                  <span className="strip-caption">{p.caption}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, lineHeight: 1.4, color: "var(--muted-2)", whiteSpace: "nowrap" }}>
                  <span>{p.posted_at ? formatDayMonth(p.posted_at) : ""}</span>
                  <span style={{ color: n ? "var(--text-2)" : "var(--muted-2)" }}>{rulesCountLabel(n, false)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="replies-body">
        <section aria-label="القواعد" className="rules-col">
          <span style={{ fontSize: 14, color: "var(--muted)" }}>
            {curPost ? `القواعد على «${curPost.caption}»` : "القواعد العامة — تعمل على كل المنشورات"}
          </span>
          {visible.map((x) => {
            const general = isGeneral(x);
            const shadowed = general && curPost && x.words.length > 0 && x.words.every((w) => specificWords.has(normalizeKeyword(w)));
            const parts = [x.reply.trim() ? "رد علني" : null, x.dm.trim() ? "رسالة خاصة" : null, x.link ? "رابط" : null].filter(Boolean);
            return (
              <button
                key={x.key}
                type="button"
                aria-pressed={x.key === r?.key}
                onClick={() => {
                  setSel(x.key);
                  setKwInput("");
                }}
                className="rule-item"
                style={{ opacity: shadowed ? 0.55 : 1 }}
              >
                <span className="dot" style={{ background: x.on ? "var(--success)" : "var(--border-hover)" }} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(x.words.length ? x.words : ["بلا كلمات"]).map((w) => (
                      <span key={w} className="word-chip">
                        {w}
                      </span>
                    ))}
                  </span>
                  <span className="ellipsis" style={{ fontSize: 13, color: "var(--muted-2)" }}>
                    {(x.on ? "" : "معطّلة · ") +
                      (shadowed ? "تحل محلها قاعدة هذا المنشور" : parts.join(" + ") || "لم تكتمل بعد") +
                      (x.dirty && !x.fresh ? " · غير محفوظة" : "")}
                  </span>
                </span>
                <span className={`scope-tag${general ? "" : " scope-tag-specific"}`}>
                  {general ? "عامة" : x.posts.length === 1 ? "منشور واحد" : `${x.posts.length} منشورات`}
                </span>
              </button>
            );
          })}
          {visible.length === 0 && (
            <div className="rules-empty">
              <RobotImg name="robot-point" className="" style={{ width: 96, filter: "var(--robot-filter)" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{curPost ? "لا توجد قواعد على هذا المنشور" : "لا توجد قواعد عامة بعد"}</span>
              {!readOnly && (
                <span style={{ fontSize: 13, color: "var(--muted-2)" }}>
                  {curPost ? "أضف قاعدة خاصة به من زر «قاعدة لهذا المنشور»." : "أضف قاعدة من زر «قاعدة عامة»."}
                </span>
              )}
            </div>
          )}
          <div className="card" style={{ gap: 10, padding: 18, borderRadius: 18, marginTop: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>منع التكرار</span>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-2)", flexWrap: "wrap" }}>
              لا ترد على نفس الشخص أكثر من مرة كل
              <select className="input select-sm" value={cooldown} disabled={readOnly} onChange={(e) => changeCooldown(e.target.value)}>
                <option value="1">ساعة</option>
                <option value="6">6 ساعات</option>
                <option value="24">24 ساعة</option>
              </select>
            </label>
            <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted-2)" }}>يحمي حسابك من أن يبدو كحساب مزعج، ويقلل خطر التقييد من Meta.</span>
          </div>
        </section>

        {r && (
          <section aria-label="تعديل القاعدة" className="editor-col">
            <form onSubmit={save} noValidate className="card editor-form">
              <fieldset disabled={readOnly} style={{ all: "unset", display: "contents" }}>
                <div className="card-title-row">
                  <h2>{r.fresh ? "قاعدة جديدة" : "تعديل القاعدة"}</h2>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-2)", cursor: "pointer" }}>
                    {r.on ? "مفعّلة" : "معطّلة"}
                    <button type="button" role="switch" aria-checked={r.on} aria-label="تفعيل القاعدة" className="switch switch-sm" onClick={() => patch({ on: !r.on })} />
                  </label>
                </div>

                <div className="field" style={{ gap: 10 }}>
                  <span className="field-label">يعمل على</span>
                  <div role="radiogroup" aria-label="نطاق القاعدة" className="segmented" style={{ alignSelf: "flex-start" }}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSpecific}
                     
                      onClick={() => patch({ scopeSpecific: true, posts: r.posts.length ? r.posts : curPost ? [curPost.id] : [] })}
                    >
                      منشورات محددة
                    </button>
                    <button type="button" role="radio" aria-checked={!isSpecific} onClick={() => patch({ scopeSpecific: false, posts: [] })}>
                      كل المنشورات
                    </button>
                  </div>
                  {isSpecific && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {r.posts.map((id) => {
                        const p = postById.get(id);
                        if (!p) return null;
                        return (
                          <span key={id} className="chosen-post">
                            <span style={{ flex: "none", width: 28, height: 28, borderRadius: 7, background: postTone(id) }} />
                            <span className="ellipsis">{p.caption}</span>
                            <button type="button" className="chip-x" onClick={() => togglePost(id)} aria-label={`إزالة ${p.caption}`}>
                              <IconX size={14} />
                            </button>
                          </span>
                        );
                      })}
                      <button type="button" className="btn dashed-btn" onClick={() => setPicker(true)} disabled={posts.length === 0}>
                        {r.posts.length ? "تعديل المنشورات" : "+ اختيار المنشورات"}
                      </button>
                    </div>
                  )}
                  {noPosts && <span className="field-error">اختر منشورًا واحدًا على الأقل، أو اجعلها لكل المنشورات.</span>}
                  <span className="field-hint">
                    {isSpecific
                      ? overrides.length
                        ? `على هذه المنشورات، تتقدم هذه القاعدة على القاعدة العامة لكلمة «${overrides.join("»، «")}».`
                        : "لا يرد البوت بهذه القاعدة إلا على تعليقات المنشورات المختارة."
                      : "تعمل على كل منشوراتك، بما فيها المنشورات الجديدة. القواعد الخاصة بمنشور معيّن تتقدم عليها."}
                  </span>
                </div>

                <div className="field" style={{ gap: 10 }}>
                  <span className="field-label">الكلمات المفتاحية</span>
                  <div className="kw-box" data-invalid={clash.length > 0 || undefined}>
                    {r.words.map((w) => (
                      <span key={w} className="kw-chip">
                        {w}
                        <button type="button" className="chip-x" onClick={() => patch({ words: r.words.filter((x) => x !== w) })} aria-label={`حذف ${w}`}>
                          <IconX size={14} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={kwInput}
                      onChange={(e) => setKwInput(e.target.value)}
                      onKeyDown={onKwKey}
                      onBlur={addKw}
                      placeholder="اكتب كلمة واضغط Enter"
                      aria-label="إضافة كلمة مفتاحية"
                      maxLength={60}
                    />
                  </div>
                  <span className="field-hint" style={{ color: clash.length ? "var(--danger)" : undefined }}>
                    {clash.length
                      ? `«${clash.join("»، «")}» مستخدمة في قاعدة أخرى على نفس المنشور. احذفها من إحداهما.`
                      : "نتجاهل التشكيل والهمزات وحالة الأحرف. مثلًا «سعر» تطابق «السعر؟» و«سعرها»."}
                  </span>
                </div>

                <label className="field">
                  <span className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      الرد العلني على التعليق <span style={{ color: "var(--muted-2)", fontWeight: 400 }}>(اختياري)</span>
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: replyOver ? "var(--danger)" : "var(--muted-2)" }}>
                      {r.reply.length}
                    </span>
                  </span>
                  <textarea rows={2} className="input" value={r.reply} onChange={(e) => patch({ reply: e.target.value })} placeholder="مثال: أرسلنا لك التفاصيل في الخاص 🤍" aria-invalid={replyOver} />
                </label>

                <label className="field">
                  <span className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>الرسالة الخاصة</span>
                    <span className="mono" style={{ fontSize: 12, color: dmOver ? "var(--danger)" : "var(--muted-2)" }}>
                      {dmBytes}/{DM_MAX}
                    </span>
                  </span>
                  <textarea rows={4} className="input" value={r.dm} onChange={(e) => patch({ dm: e.target.value })} placeholder="مثال: أهلًا! هذه أسعار مجموعتنا…" aria-invalid={dmOver} />
                  <span className="field-hint" style={{ color: dmOver ? "var(--danger)" : undefined }}>
                    {dmOver ? "الرسالة مع الرابط أطول من حد Meta. اختصرها قليلًا." : "حد Meta للرسالة مع الرابط 1000 بايت (الحرف العربي = 2، تقريبًا 480 حرفًا)."}
                  </span>
                </label>

                <label className="field">
                  <span className="field-label">
                    رابط المنتج أو الشراء <span style={{ color: "var(--muted-2)", fontWeight: 400 }}>(اختياري)</span>
                  </span>
                  <input
                    dir="ltr"
                    className="input mono"
                    value={r.link}
                    onChange={(e) => patch({ link: e.target.value.trim() })}
                    placeholder="https://"
                    inputMode="url"
                    aria-invalid={linkBad}
                    style={{ fontSize: 14, textAlign: "left", minHeight: 46 }}
                  />
                  {linkBad && <span className="field-error">يجب أن يبدأ الرابط بـ https://</span>}
                </label>

                {!readOnly && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="submit" className="btn btn-primary" disabled={cantSave} style={{ minHeight: 48, padding: "0 22px", borderRadius: 14, fontSize: 16 }}>
                      {busy && <span className="spinner" aria-hidden />}
                      حفظ
                    </button>
                    <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy} style={{ minHeight: 48, borderRadius: 14 }}>
                      حذف القاعدة
                    </button>
                    <span style={{ fontSize: 13, color: "var(--muted-2)" }}>
                      {!r.dirty
                        ? "كل التغييرات محفوظة"
                        : noPosts
                          ? "اختر منشورًا"
                          : empty
                            ? "أضف كلمة واحدة على الأقل، وردًا علنيًا أو رسالة خاصة"
                            : "لديك تغييرات غير محفوظة"}
                    </span>
                  </div>
                )}
              </fieldset>
            </form>

            <aside aria-label="معاينة" className="preview">
              <span style={{ fontSize: 13, letterSpacing: ".04em", color: "var(--muted-2)" }}>معاينة · هكذا سيبدو الأمر</span>
              <div className="preview-post">
                <span style={{ flex: "none", width: 40, height: 40, borderRadius: 9, background: pv ? postTone(pv.id) : "var(--chip)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: "var(--muted-2)" }}>على منشور</span>
                  <span className="ellipsis" style={{ fontSize: 14, fontWeight: 500 }}>
                    {pv ? pv.caption : "أي منشور من منشوراتك"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", background: "var(--border-strong)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span dir="ltr" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                      follower
                    </span>
                    <span style={{ fontSize: 15 }}>{r.words.length ? `${r.words[0]} هذا؟` : "اكتب كلمة لترى المعاينة"}</span>
                  </div>
                </div>
                {r.reply.trim() && (
                  <div style={{ display: "flex", gap: 10, marginRight: 42 }}>
                    <span style={{ flex: "none", width: 28, height: 28, borderRadius: "50%", background: "var(--text)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span dir="ltr" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                        {account ?? "your.account"}
                      </span>
                      <span style={{ fontSize: 15, color: "var(--text-2)" }}>{r.reply}</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 13, color: "var(--muted-2)" }}>في الرسائل الخاصة</span>
              <div className="dm-bubble">
                <span style={{ fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap", textWrap: "pretty" }}>
                  {r.dm.trim() || (r.link ? "" : "لا توجد رسالة خاصة لهذه القاعدة")}
                </span>
                {host && (
                  <span dir="ltr" className="dm-link mono">
                    {host}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "var(--muted-2)" }}>
                تُرسل الرسالة الخاصة مرة واحدة لكل تعليق، وفق قواعد Meta. إذا كانت الرسائل الخاصة مغلقة عند الشخص، يُكتفى بالرد العلني.
              </p>
            </aside>
          </section>
        )}
      </div>

      {picker && r && (
        <div className="overlay">
          <div className="overlay-bg" onClick={() => setPicker(false)} />
          <section role="dialog" aria-modal="true" aria-labelledby="pk-h" className="dialog picker">
            <header className="picker-head">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h2 id="pk-h" style={{ fontSize: 20 }}>
                  اختر المنشورات
                </h2>
                <span style={{ fontSize: 13, color: "var(--muted-2)" }}>تعمل القاعدة على التعليقات في المنشورات المختارة فقط.</span>
              </div>
              <button type="button" className="btn btn-icon" onClick={() => setPicker(false)} aria-label="إغلاق" style={{ width: 40, minHeight: 40 }}>
                <IconX />
              </button>
            </header>
            <div className="picker-grid">
              {posts.map((p) => {
                const on = r.posts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => togglePost(p.id)}
                    className="picker-tile"
                    data-on={on || undefined}
                    style={{ background: postTone(p.id) }}
                  >
                    <PostThumb src={p.image} />
                    <span className="picker-check">{on && <IconCheck size={14} sw={2.6} />}</span>
                    <span className="post-badge" style={{ top: 8, left: 8, height: 22, fontSize: 11, padding: "0 7px", borderRadius: 7 }}>
                      {postKind(p.media_type)}
                    </span>
                    <span className="strip-caption" style={{ WebkitLineClamp: 2 }}>
                      {p.caption}
                    </span>
                    <span style={{ fontSize: 11, color: "#b4b7bd" }}>{p.posted_at ? formatDayMonth(p.posted_at) : ""}</span>
                  </button>
                );
              })}
            </div>
            <footer className="picker-foot">
              <button type="button" className="btn btn-primary" onClick={() => setPicker(false)} style={{ minHeight: 48, padding: "0 24px", borderRadius: 14, fontSize: 16 }}>
                تم
              </button>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>
                {r.posts.length === 0
                  ? "لم تختر أي منشور"
                  : r.posts.length === 1
                    ? "منشور واحد مختار"
                    : r.posts.length === 2
                      ? "منشوران مختاران"
                      : `${r.posts.length} منشورات مختارة`}
              </span>
            </footer>
          </section>
        </div>
      )}

      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </>
  );
}
