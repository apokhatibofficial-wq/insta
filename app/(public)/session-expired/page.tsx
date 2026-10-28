import { StatusPage } from "@/components/StatusPage";

export default function SessionExpired() {
  return (
    <StatusPage
      robot="wink"
      code="SESSION"
      title="انتهت جلستك"
      body="سجّلنا خروجك للحماية. ادخل مرة أخرى برمز الدخول نفسه."
      primary={{ label: "الدخول من جديد", href: "/login" }}
    />
  );
}
