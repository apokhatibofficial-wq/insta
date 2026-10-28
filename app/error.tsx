"use client";

import { StatusPage } from "@/components/StatusPage";

// `digest` is generated on the server for the failed request; it lets support
// find the matching server log line without exposing any error details.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = error.digest ? `ERR-${error.digest.slice(0, 4).toUpperCase()}-${error.digest.slice(4, 8).toUpperCase()}` : undefined;
  return (
    <StatusPage
      robot="point"
      code="500"
      title="حدث خطأ من جهتنا"
      body="لم يكتمل طلبك، ولم يتغيّر أي شيء في إعداداتك. جرّب مرة أخرى بعد قليل."
      primary={{ label: "العودة إلى لوحتك", href: "/dashboard" }}
      secondary={
        <button type="button" className="btn" onClick={reset}>
          إعادة المحاولة
        </button>
      }
      reference={ref}
    />
  );
}
