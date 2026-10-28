import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Welcome } from "@/components/Welcome";

export default async function WelcomePage() {
  // The welcome scene plays once per browser session.
  if ((await cookies()).get("kts_welcomed")) redirect("/login");
  return <Welcome />;
}
