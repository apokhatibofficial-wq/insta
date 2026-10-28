# KHATIB TECHNICAL SOLUTIONS — منصة أتمتة إنستغرام

منصة متعددة العملاء (multi-tenant): المدير ينشئ حسابات العملاء ويدير اشتراكاتهم الشهرية يدويًا، وكل عميل يدخل برمز ثابت لإدارة أتمتة إنستغرام الخاصة به. الواجهة عربية RTL، داكنة أولًا مع وضع فاتح.

- التصميم والقرارات: [`design_handoff_khatib_platform/`](design_handoff_khatib_platform/) (README، `docs/DECISIONS.md`، `docs/ARCHITECTURE.md`).
- المرحلة الحالية: **المرحلة 2 — الأساس**.

## التقنيات

| الطبقة | الاختيار |
|---|---|
| التطبيق | Next.js 16 (App Router، TypeScript strict) |
| الاستضافة | Cloudflare Workers عبر `@opennextjs/cloudflare` |
| قاعدة البيانات | Supabase (Postgres + RLS)، كل منطق العمل في دوال SQL ذرّية |
| دخول المدير | Passkey (WebAuthn، SimpleWebAuthn) + 10 رموز استرداد + تحقق إضافي للعمليات الخطرة |
| دخول العميل | رمز من 12 حرفًا (~69 بت)، مخزّن كـ HMAC-SHA256 مع pepper |
| عزل العملاء | JWT قصير (5 دقائق، ES256) بمطالبة `client_id` → RLS، إضافة إلى فلترة الخادم |
| الاختبارات | Vitest (وحدات + تكامل على Postgres حقيقي)، Playwright (e2e بمفتاح WebAuthn افتراضي) |

## هيكل المجلدات

```
app/(public)        الترحيب، دخول العميل، صفحات الحالة
app/(client)        لوحة العميل (المرحلة 2: مبسّطة + صفحة انتهاء الاشتراك)
app/admin           دخول المدير، الإعداد الأول، الأمان، العملاء، تفاصيل العميل
components/         الروبوت، المشهد الترحيبي، أيقونات، عناصر مشتركة
server/             env، db (supabase | pg محلي)، auth، admin، http
lib/                الرموز والتجزئة، التواريخ (دمشق)، النصوص العربية
supabase/           migrations/ و local/ (محاكاة Supabase للاختبار المحلي فقط)
tests/              unit/ و integration/ و e2e/
scripts/            إعادة بناء القاعدة المحلية، فحص الأسرار في الحزمة، أصول الروبوت
```

## التشغيل محليًا

المتطلبات: Node 22، PostgreSQL 16 محلي (لا حاجة إلى Docker).

```bash
npm ci
```

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/khatib_dev npm run db:local:reset
```

أنشئ `.env.local` (لا يُرفع إلى git) بالقيم التالية، مع توليد الأسرار عشوائيًا:

```
DB_DRIVER=pg
DATABASE_URL=postgres://postgres:postgres@localhost:5432/khatib_dev
ACCESS_CODE_PEPPER=<32+ حرفًا عشوائيًا>
SESSION_SECRET=<32+ حرفًا عشوائيًا>
ADMIN_SETUP_TOKEN=<24+ حرفًا عشوائيًا>
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
```

```bash
npm run build && npm start
```

ثم افتح `http://localhost:3000/admin/setup` لإعداد دخول المدير (رمز الإعداد + مفتاحا Passkey + حفظ رموز الاسترداد).

`DB_DRIVER=pg` للتطوير والاختبار فقط: يحاكي ما يفعله Supabase في كل طلب (`SET LOCAL ROLE` + `request.jwt.claims`) على Postgres عادي، فتُختبر سياسات RLS نفسها. بناء Cloudflare يحذف هذا المشغّل تمامًا.

## الاختبارات

```bash
npm run lint && npm run typecheck
```

```bash
npm test
```

```bash
npx playwright test
```

```bash
npm run build && npm run check:bundle-secrets -- --env-file .env.local
```

## النشر (يحتاج إعدادًا خارجيًا من المالك)

1. **Supabase**: إنشاء مشروع مجاني، ثم تطبيق `supabase/migrations/*` بالترتيب (عبر SQL Editor أو `npx supabase db push`). **لا تطبّق** `supabase/local/`.
2. **مفتاح توقيع JWT (قرار 1B)**: ولّد مفتاح ES256:
   ```bash
   npx supabase gen signing-key --algorithm ES256
   ```
   استورده من لوحة Supabase ← Project Settings ← JWT Signing Keys كمفتاح احتياطي، ثم اضغط **Rotate** لتفعيله. ضع الـ JWK الخاص نفسه (مع `kid`) في السر `SUPABASE_JWT_SIGNING_KEY`.
3. **Cloudflare**: `npx wrangler login`، ثم أضف كل سر بـ `npx wrangler secret put <NAME>` (القائمة في `.env.example`، و`DB_DRIVER` يبقى `supabase`).
4. `WEBAUTHN_RP_ID` = نطاق اللوحة (مثل `app.example.com`)، و`WEBAUTHN_ORIGIN` = `https://app.example.com`.
5. ```bash
   npm run cf:deploy
   ```
6. بعد إكمال إعداد المدير يمكن حذف `ADMIN_SETUP_TOKEN` من الأسرار (صفحة الإعداد تُغلق نهائيًا بعد الاكتمال على أي حال).

## حالة المرحلة 2

| البند | الحالة |
|---|---|
| مخطط القاعدة + RLS على كل جدول + صلاحيات دنيا + سجل تدقيق غير قابل للتعديل | مختبَر (تكامل) |
| دخول العميل بالرمز، جلسات منزلقة 30 يومًا، حد المحاولات (5 ← 15 دقيقة) + سقف عام | مختبَر (تكامل + e2e) |
| دخول المدير بـ Passkey، إعداد أول بمفتاحين، رموز استرداد، تحقق إضافي للعمليات الخطرة | مختبَر (e2e بمفتاح افتراضي) |
| العملاء: إنشاء/عرض/تعطيل، توليد/إبطال الرمز، إنهاء الجلسات | مختبَر |
| الاشتراكات (30 يومًا، دمشق): تجديد/إيقاف/استئناف/إنهاء، `can_automate` | مختبَر |
| شاشات: الترحيب، دخول العميل، دخول المدير، العملاء، تفاصيل العميل، صفحات الأخطاء، انتهاء الاشتراك | منفّذ ومختبَر (e2e + لقطات) |
| ترويسات الأمان + CSP بـ nonce | مختبَر |
| لا أسرار في حزمة المتصفح | مختبَر (سكربت فحص) |
| بناء Cloudflare Worker + تشغيله محليًا على workerd | مختبَر محليًا |
| الاتصال الفعلي بـ Supabase (JWT ES256 ← RLS عبر PostgREST) | منفّذ — غير مختبَر، يحتاج مشروع Supabase |
| النشر على Cloudflare | يحتاج إعدادًا خارجيًا |

## ملاحظات أمنية

- رمز العميل يظهر للمدير مرة واحدة فقط، ولا يُخزَّن إلا كـ HMAC. لا تُسجَّل الرموز أو التجزئات في السجلات.
- الحظر بعد المحاولات الفاشلة يكون حسب عنوان IP (يُخزَّن مجزّأً) لأن الدخول بلا اسم مستخدم؛ هذا موثّق في ARCHITECTURE.
- كل دالة إدارية تتحقق من جلسة المدير داخل قاعدة البيانات في نفس المعاملة، ثم تكتب سجل التدقيق.
- لا عملاء وهميون في القاعدة: الاختبارات تنشئ بياناتها في قواعد مؤقتة خاصة بها.
