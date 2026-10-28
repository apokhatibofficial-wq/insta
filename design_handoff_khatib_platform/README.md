# Handoff: KHATIB TECHNICAL SOLUTIONS — Instagram Automation Platform (Phase 1 designs)

## Overview
A multi-tenant platform where the **admin** (owner) creates client accounts, manages manual monthly subscriptions, and each **client** logs in with a static access code to manage their own Instagram automation (keyword → public comment reply + private DM + product link). Arabic-first, RTL, dark UI. The white robot mascot (supplied by the owner) is the core brand element.

Read together with:
- `docs/ARCHITECTURE.md` — stack, data model, RLS, auth, threat model, test plan (Phase 2+).
- `docs/DECISIONS.md` — decisions already approved by the owner.
- `CLAUDE_CODE_KICKOFF.md` — how to start and the working rules the owner requires.

## About the Design Files
The files in `designs/` are **design references created in HTML** (self-contained "Design Component" files; open any `.dc.html` directly in a browser — `support.js` must sit next to them). They are prototypes showing intended look, copy and behavior — **not production code**. Recreate them in the chosen stack (Next.js App Router + TypeScript, see ARCHITECTURE.md) using proper components. All data in the mocks is fake; all "server" behavior (code check, lockout, renew) is simulated client-side and **must be implemented server-side**.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy and motion. Recreate pixel-close. Copy (Arabic) is final unless the owner changes it.

## Global
- `dir="rtl"`, `lang="ar"` on `<html>`. Use logical CSS properties (`margin-inline-start`, `inset-inline-end`).
- Fonts: **IBM Plex Sans Arabic** (400/500/600/700) for all UI; **IBM Plex Mono** (400/500/600) for codes, IDs, numbers, brand wordmark. Self-host in production (next/font).
- Brand wordmark: `KHATIB` (600) + `TECHNICAL SOLUTIONS` (400, muted), IBM Plex Mono 12–13px, letter-spacing .16em, always `dir="ltr"`.
- Dates: `Intl.DateTimeFormat('ar-SY-u-nu-latn', {day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Damascus'})` → «21 تشرين الثاني 2026». Latin digits everywhere.
- Every animation must respect `prefers-reduced-motion: reduce` (render final state, no loops).
- No sound anywhere. No TTS.
- Min hit target 44px. Visible focus rings (2px solid #f2f2f0, offset 3px on primary buttons; border-color #8f939a + 4px rgba(255,255,255,.06–.08) ring on inputs).

## Design Tokens
Colors
- bg `#0a0b0d` · deep bg (screen-off) `#050506`
- surface-1 `#0d0e10` · surface-2 `#0f1012` · surface-3 (inputs, bubbles) `#121316` · hover/selected `#17181c` · chip `#1d1f23`
- border-subtle `#16171a` · border `#1d1f23` · border-strong `#2a2c31` · border-hover `#45484e`
- text `#f2f2f0` · text-2 `#c4c7cc` · text-3 `#b4b7bd` · muted `#9a9da4` · muted-2 `#8f939a` · placeholder `#5f626a` · disabled text `#6b6e75`
- success `#4cc38a` · warning `#e6c27a` (text on tint `#ecd3a0`) · danger text `#ff9592` · danger solid `#e5484d` · danger heading `#ffb4b1`
- Status chip = text color + background `color + 1f` alpha hex (≈12%). Danger callout bg `rgba(229,72,77,.08)` border `rgba(229,72,77,.32)`. Warning callout bg `rgba(230,194,122,.08)` border `rgba(230,194,122,.28)`.
- Primary button: bg `#f2f2f0` / hover `#fff` / text `#0a0b0d`. Disabled: bg `#1d1f23`, text `#6b6e75`, cursor not-allowed.
- Switch: on `#4cc38a` + knob `#0a0b0d`; off `#2a2c31` + knob `#8f939a`; 52×30 (46×26 small), knob 24, travel 22px, transition 260ms cubic-bezier(.16,1,.3,1).

Radius: 8 (chips/badges) · 10 (nav items) · 12 (inputs, small buttons) · 14 (buttons) · 16 (big buttons, inner cards) · 18–22 (cards) · 24–28 (speech bubbles) · 999 (pills).
Spacing: 4 / 8 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 48 / 64.
Type scale: 12 / 13 / 14 / 15 / 16 / 17 / 18 / 21–22 / 28–30 / 34 (numbers, mono). Body line-height 1.6–1.75.
Shadows: cards none (borders only); dialogs `0 40px 80px -30px rgba(0,0,0,.7)`; toast `0 20px 40px -16px rgba(0,0,0,.6)`.
LED text effect (robot speech bubbles): `text-shadow: 0 0 14px rgba(255,255,255,.28)` + scanline overlay `repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0,0,0,.2) 2px 3px)` clipped to bubble radius.
Easings: EXPO `cubic-bezier(.16,1,.3,1)` (entrances) · SOFT `cubic-bezier(.65,0,.35,1)` · idle sine `cubic-bezier(.45,0,.55,1)`.

## Assets (`designs/assets/`, original in `brand/robot-original.png`)
The owner's robot sheet (2005×626, 3 poses) was split and cleaned. **Do not redraw or alter the robot.**
- `robot-wave.png` 640×392, `robot-wink.png` 544×373, `robot-point.png` 627×378 — full poses, baked white floor/shadow removed (shadow is drawn in CSS).
- `*-base.png` — same pose with face LEDs removed (screen off, inpainted).
- `*-led.png` — white LED layer only (alpha). `base + led` == original pose.
- `robot-wave-eye1/eye2/mouth.png`, `robot-wink-eyeopen/eyeline/mouth.png` — individual LED parts, full-canvas, so they stack with `position:absolute; inset:0`. Blink = `scaleY(.08)` with transform-origin: wave eye1 `43.8% 44%`, eye2 `63% 37.1%`; wink open eye `38.7% 41.5%`.
- Pose placement inside a 700×430 box (body centres aligned for cross-fades): wave `left .29% top 5.58% width 91.43%`; wink `left 11% top 3.72% width 77.71%`; point `left 5.71% top 10.23% width 89.57%`.
- Pose meaning: wave = greeting; wink = idle/happy; point = attention/error/guidance. Sleeping (expired) = wink base + eyeline image duplicated at `translateX(-22.1%)` at ~50% opacity, slow pulse.
- Production: export as WebP + PNG fallback; preload the welcome set.

## Screens

### 1. Welcome — `designs/Welcome 1a.dc.html`
Full-viewport dark stage. Desktop reference 1280×800, mobile 390×844.
Layout (desktop): brand top-start (32px/48px padding), «تخطَّ» ghost button top-end; robot box 540px wide at right:170 top:150; speech bubble 400px at left:150 top:220 with curved tail pointing to robot; CTA centered bottom:72 «الدخول إلى لوحتك» + helper «ستحتاج رمز الدخول الذي استلمته منّا.». Mobile: robot top centered (330px), bubble below (tail up), CTA full-width bottom.
Bubble copy (exact, written, never spoken): «أهلًا يا صديقي، أنا هنا لمساعدتك.» — rendered word-by-word (6 spans) so Arabic letters always stay joined; `role="status"` + `aria-label` with full sentence.
Timeline (ms, total ≈3s, then idle):
- 0 light line scaleX 0→1 → opens vertically (clip-path inset 50%→0) at 260, 520ms; camera scale 1.035→1 over 2200.
- 300 robot jumps in: from translateY(90) rotate(-8°) scale(.72) blur(8) → overshoot -18 → squash 1.05/.94 → settle; 1150ms linear keyframes. Shadow scales with height.
- 820 LEDs boot: clip from top + brightness 2→1 + one flicker, 420ms.
- 1150 greeting wiggle rotate -6/4/-3/1.2/0 (950ms). 1300 blink.
- 1150 bubble springs from tail: scale .3→1.035→.992→1 with blur 8→0 (700ms); border light sweep (conic gradient rotating) 1250; 3 typing dots 1300–2020; words 1960 + i×85 (+130 after the comma), each opacity/blur/translateY with a bloom text-shadow.
- 1550 CTA in. 2500 hop + switch to wink pose.
- Idle (≥3200, infinite, `alternate`): float translateY 0→-9 (2.1s), shadow scaleX 1→.88, breathe scale 1.008/1.014 (1.7s), bubble float -5 with 350ms lag, LED glow brightness 1→1.18, bubble border light rotates 9s; random blinks every 2.4–5.6s (25% double).
- Pointer: eyes follow (±7px x, ±5px y, lerp .12); body leans (±9px, ±3°, lerp .045); bubble counter-parallax ±4px. Idle without pointer >1.8s → robot "looks around" at random targets. Click robot → hop (squash/stretch 720ms) + blink.
- Skip button, Esc and Enter jump to final state. Never block login on animation. Show once per session (sessionStorage); later visits go straight to login.

### 2. Client login — `designs/LoginScreen.dc.html` (board: `Login Board.dc.html`)
Centered column max-width 440. Top: small live robot (150px, wink pose, floats & blinks; eyes shift (-4px,4px) toward the field on input focus) + LED bubble with state copy:
- idle «أدخل رمزك، وسأفتح لك لوحتك.» · loading «لحظة، أتحقّق من الرمز…» · error «لم ينجح الأمر هذه المرة. لنجرّب مرة أخرى.» (robot → point pose) · locked «لنأخذ استراحة قصيرة، ثم نحاول مجددًا.»
Title «الدخول إلى لوحتك», subtitle «أدخل رمز الدخول الذي استلمته عند تفعيل اشتراكك.». Field label «رمز الدخول»: type=password, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"`, `dir="ltr"`, mono 21px, letter-spacing .12em, 60px tall, show/hide eye button (44×44). Whitespace stripped. Hint «الرمز حسّاس لحالة الأحرف. لا تشاركه مع أحد.»
- Error (generic, never reveals if code exists/revoked/expired): «تعذّر الدخول. تحقّق من الرمز وحاول مرة أخرى.» + from attempt 3 «تبقّت محاولتان./تبقّت محاولة واحدة.»
- Locked after 5 failures: «محاولات كثيرة متتالية. يمكنك المحاولة بعد mm:ss.» 15-min countdown; input & button disabled; button label «متاح بعد mm:ss».
- Submit «دخول» disabled when empty; loading shows spinner + «جارٍ التحقق…».
- Footer «لا تملك رمزًا؟ تواصل مع فريق KHATIB لتفعيل اشتراكك.»
- Entrance: form children stagger 80ms, translateY 14 + blur 4 → 0, 900ms EXPO.

### 3. Admin — clients list — `designs/Admin Clients.dc.html`
Shell: 248px sidebar on the right (RTL start), border-inline-start #1d1f23; nav العملاء / الاشتراكات / البوتات / سجل العمليات; admin card bottom «المدير · دخول بـ Passkey» + «تسجيل الخروج». Main padding 32/40.
- Header «العملاء», sub «N عميلًا · التواريخ بتوقيت دمشق», primary «عميل جديد».
- 4 stat buttons (also filters, aria-pressed): نشط (green), ينتهي خلال 7 أيام (amber), منتهٍ (red), يحتاج ربط إنستغرام (gray). Mono 32px numbers.
- Search (name / internal ID / IG handle) + segmented tabs: الكل / نشط / ينتهي قريبًا / منتهٍ / موقوف.
- Table (grid columns 1.6/1.2/1.2/1/.8fr/48px; min-width 980, horizontal scroll inside rounded wrapper): العميل (name + mono ID like `KTS-0142`), الاشتراك (chip + date line), إنستغرام (dot + @handle LTR | «غير مربوط» | «يحتاج إعادة ربط»), البوت (يعمل | أوقفه العميل | بانتظار الربط | متوقف: خلل في الربط | متوقف: الاشتراك منتهٍ | متوقف: إيقاف إداري), آخر نشاط, kebab menu. Row click → client detail.
- Empty search state: point robot + «لا يوجد عملاء يطابقون بحثك» + «مسح البحث والتصفية».
- New-client drawer (480px from the left/end, slide 24px + fade 420ms, Esc closes): name (required ≥2 chars, error «اكتب اسمًا من حرفين على الأقل.»), start date (default today), computed end (start + 29 days, read-only, dashed box), note «لا تكتب أرقام بطاقات أو بيانات مصرفية.». Submit «إنشاء العميل وتوليد الرمز» → step 2: code shown **once** (12 chars, alphabet without 0/O/1/I/l, grouped 4-4-4, mono 30px) + «نسخ الرمز» + warning callout (code stored only as hash; lost → regenerate, old one stops).

### 4. Admin — client detail — `designs/Admin Client Detail.dc.html`
Breadcrumb, header (name, status chip, ID, client-since, IG handle) + «تعطيل الحساب»/«إعادة تفعيل الحساب». Danger alert when IG token invalid (explains client must reconnect; no secrets). Cards (auto-fit minmax 380):
- **الاشتراك**: days-left `left/total` mono 28, progress bar = remaining fraction, start/end; «تجديد 30 يومًا» → dialog current→new end + rule text + payment note; «إيقاف مؤقت»/«استئناف الاشتراك»; «إنهاء الاشتراك» (danger confirm; data kept). Renewal rule: active → new period starts the day after current end (no lost days); expired → starts today.
- **رمز الدخول والجلسات**: masked code, created, last login, active sessions; «توليد رمز جديد» (confirm → one-time reveal; revokes old + kills sessions), «إنهاء كل الجلسات», «إبطال الرمز».
- **الأتمتة**: admin kill switch + 4-check list (الحساب مفعّل / الاشتراك فعّال / مسموح من الأدمن / ربط إنستغرام صالح). Bot state text derives from first failing check.
- **سجل التغييرات**: append-only timeline (actor · time). Every action above writes an entry. Toast confirmations bottom-center.

### 5. Client dashboard — `designs/Client Dashboard.dc.html`
Sticky top bar (brand, tabs الرئيسية / الردود والكلمات / السجل, «خروج»), content max-width 1120.
- Hero: live robot (190px) + LED bubble «أهلًا، {name}» + one-sentence status (ok / paused / not connected / reconnect variants — see `headline` in file).
- If not connected / needs reconnect: guided card with 3 steps (professional IG account → official Meta page → approve permissions), CTA «ربط حساب إنستغرام»/«إعادة الربط», reassurance «لن نطلب منك كلمة مرور إنستغرام أبدًا.».
- Status tiles: subscription days left + end date, Instagram status, bot switch (instant stop; disabled until connected).
- «الكلمات المفعّلة» (chips + what it does + today's count) and «آخر الأحداث» (plain-language log incl. Meta 24h-window failures).

### 6a. Posts — `designs/Client Posts.dc.html`
Grid (auto-fill minmax 220) of the client's Instagram posts (thumbnail from the API; mock uses tone tiles), kind badge (ريلز/صورة/متعدد), caption (3 lines), «البوت يعمل هنا» badge when the post has an enabled specific rule, rule count, date, «N تعليقًا · رد البوت على M». Search by caption, tabs الكل / عليها قواعد / بلا قواعد. First card «القواعد العامة» → `Client Replies?post=all`. Clicking a post → `Client Replies?post=<id>`. Client nav: الرئيسية / المنشورات / الردود العامة / السجل.

### 6. Replies & keywords — `designs/Client Replies.dc.html`
Opened with `?post=<id>` or `?post=all`; back link «كل المنشورات». A horizontal post strip at the top allows switching post in place. The rule list shows rules applying to the selected post (post-specific first, then general ones tagged «عامة»; a general rule whose keywords are all covered by a specific rule on this post is dimmed with «تحل محلها قاعدة هذا المنشور»).
Editor adds **«يعمل على»**: «منشورات محددة» (chosen posts as chips + picker dialog with checkbox tiles) or «كل المنشورات» (includes future posts). New rule defaults to the selected post. Precedence: a post-specific rule beats a general rule for the same keyword on that post. Keyword clash only when scopes overlap (both general, or sharing a post). Must pick ≥1 post when specific.
Rule list (start column, flex 1 1 300px) + editor (flex 999 1 600px) + sticky live preview (shows target post).
- Rule: enabled switch, keywords chip input (Enter / «،» / «,» adds; Backspace on empty removes last; dedupe), public reply (optional), DM (counter n/1000), product link (optional, must be `https://`), Save (disabled unless dirty & valid), delete.
- Matching normalisation: strip tashkeel `[\u064B-\u065F\u0670]`, أإآ→ا, ى→ي, ة→ه, lowercase; substring match. A keyword may belong to only one rule (clash error lists the words).
- Global cooldown select: 1 / 6 / 24 h per person.
- Preview: sample comment, public reply, DM bubble with link host/path.

### 7. Subscription expired — `designs/Client Expired.dc.html`
Sleeping robot (eyes closed, slow LED pulse, 3.2s float). «انتهى اشتراكك، والبوت في استراحة», explanation (date, what stopped, data kept), renewal steps, «تواصل عبر واتساب» (`https://wa.me/4368181700732`, opens in new tab; read from env `SUPPORT_WHATSAPP_URL`), «عرض ردودي المحفوظة» (read-only). Server must still block all automation & mutations.

### 8. Client activity — `designs/Client Activity.dc.html`
3 counters (replies sent / skipped by cooldown / needs attention), filters (الكل / الردود / تحتاج انتباهك / التغييرات) + range (اليوم / 7 أيام / 30 يومًا), events grouped by day (Damascus), each with plain-language reason; failures show an amber "what happened instead" note. Empty state with wink robot.

### 9. Client account — `designs/Client Settings.dc.html`
Subscription summary + WhatsApp renewal link; Instagram connection with «فصل الحساب» (confirm dialog → revoke token, stop bot, keep rules); signed-in devices list («هذا الجهاز», end one / end others). The client cannot change their own access code.

### 10. Admin login — `designs/Admin Login.dc.html`
Single «الدخول بـ Passkey» button (states: idle / busy / error / done) + recovery-code path (12 chars, single use, prompts new passkey). Note: client codes never work here; every attempt is audited.

### 11. Admin bots — `designs/Admin Bots.dc.html`
Status counters (filterable), per-client state + reason + last-24h load + admin allow switch (instant, audited); «إيقاف كل البوتات» global emergency stop with confirm + red banner until resumed.

### 12. Admin subscriptions — `designs/Admin Subscriptions.dc.html`
Counters (active / ending ≤7 days / expired / paused), list sorted by urgency with remaining days bar, «تجديد 30 يومًا» dialog (current → new end, rule text, payment note) + toast.

### 13. Admin audit log — `designs/Admin Audit Log.dc.html`
Append-only table: time, client, tagged action (اشتراك / رمز دخول / حساب / أتمتة / أمان) + details, actor (المدير / النظام). Search by name or ID. Never contains codes, tokens or banking data.

### 14. Error pages — `designs/Error Pages.dc.html`
404, 500 (with server-generated reference id), session expired, account disabled (WhatsApp), maintenance. Only claim "bot keeps running during maintenance" if the worker is deployed independently of the dashboard.

## Light theme
Every app screen has a `* Light.dc.html` twin. Welcome and Subscription-expired stay dark in both themes (brand moments built around the LED face). Implement as CSS variables switched by `[data-theme]` + `prefers-color-scheme` default, user toggle stored in a cookie.
Light tokens (dark → light): bg #0a0b0d→#f6f6f3 · surface #0f1012→#ffffff · #0d0e10→#efefeb · #121316→#f1f1ed · #17181c→#e9e9e4 · border #1d1f23→#e2e2dc · #2a2c31→#d4d4cd · #45484e→#a9aba5 · text #f2f2f0→#141518 · #c4c7cc→#3b3e44 · #9a9da4→#5b5f66 · #8f939a→#62666d · success #4cc38a→#1b7f52 · warning #e6c27a→#94650f · danger text #ff9592→#c0302f · primary button inverts (bg #141518, text #f6f6f3, hover #000). Robot images get `drop-shadow(0 6px 16px rgba(0,0,0,.2))` on light backgrounds; LED bubble text glow is removed.

## Sample data
The handoff files contain **no sample clients, names or Instagram accounts**. Lists start empty (showing their empty states) and single-record screens use the neutral placeholders «اسم العميل», `@username`, `KTS-0000`-style IDs. **Do not seed fake clients in the database**; for tests, create fixtures inside the test suite and delete them afterwards.

## Not designed yet
Admin "new client" polish for zero-clients state (current empty copy says «لا يوجد عملاء يطابقون بحثك»; use «لا يوجد عملاء بعد» + «عميل جديد» when there is no search).

## Files
`designs/*.dc.html` + `designs/* Light.dc.html` (open in a browser), `designs/support.js` (runtime for the mocks only), `designs/assets/*`, `brand/robot-original.png`.
