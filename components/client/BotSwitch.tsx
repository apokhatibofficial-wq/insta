"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBotEnabledAction } from "@/app/(client)/actions";

/** The client's instant on/off switch. Disabled until Instagram is connected. */
export function BotSwitch({ on, disabled }: { on: boolean; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [toast, setToast] = useState("");
  const [busy, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const next = !value;
      setValue(next);
      const r = await setBotEnabledAction(next);
      if (!r.ok) {
        setValue(!next);
        setToast("تعذّر تغيير حالة البوت");
      } else {
        setToast(next ? "عاد البوت للعمل" : "أُوقف البوت فورًا");
        router.refresh();
      }
      setTimeout(() => setToast(""), 2400);
    });
  return (
    <>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={value && !disabled}
        aria-label="تشغيل البوت"
        disabled={disabled || busy}
        onClick={toggle}
      />
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </>
  );
}
