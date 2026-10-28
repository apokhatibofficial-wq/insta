import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-500.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "KHATIB — لوحة الأتمتة",
  description: "لوحة KHATIB TECHNICAL SOLUTIONS لأتمتة الردود على إنستغرام.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("kts_theme")?.value;
  return (
    <html lang="ar" dir="rtl" data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body>{children}</body>
    </html>
  );
}
