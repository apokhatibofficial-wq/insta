import { StatusPage } from "@/components/StatusPage";
import { env } from "@/server/env";

export default function AccountDisabled() {
  return (
    <StatusPage
      robot="point"
      code="ACCOUNT"
      title="حسابك موقوف حاليًا"
      body="أوقف فريق KHATIB هذا الحساب، والبوت متوقف معه. بياناتك محفوظة. تواصل معنا لمعرفة السبب وإعادة التفعيل."
      primary={{ label: "تواصل عبر واتساب", href: env().SUPPORT_WHATSAPP_URL, external: true }}
    />
  );
}
