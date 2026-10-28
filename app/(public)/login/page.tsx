import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getClientSession } from "@/server/auth/client";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "الدخول إلى لوحتك — KHATIB" };

export default async function LoginPage() {
  const s = await getClientSession();
  if (s?.account === "active") redirect("/dashboard");
  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden />
      <header className="login-header">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="login-main">
        <LoginForm />
      </main>
    </div>
  );
}
