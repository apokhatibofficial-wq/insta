import { StatusPage } from "@/components/StatusPage";

export default function NotFound() {
  return (
    <StatusPage
      robot="point"
      code="404"
      title="هذه الصفحة غير موجودة"
      body="ربما تغيّر الرابط أو كُتب بشكل خاطئ. لوحتك وبياناتك بخير."
      primary={{ label: "العودة إلى لوحتك", href: "/dashboard" }}
    />
  );
}
