"use client";

import { useEffect, useRef } from "react";
import { RobotImg } from "./robot/RobotImg";

// Expired subscription: eyes closed (eyeline duplicated), slow LED pulse, 3.2s float.
export function SleepingRobot() {
  const floatRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const ledRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const o: KeyframeAnimationOptions = { duration: 3200, iterations: Infinity, direction: "alternate", easing: "cubic-bezier(.45,0,.55,1)" };
    const a = [
      floatRef.current?.animate([{ transform: "translateY(0px)" }, { transform: "translateY(-4px)" }], o),
      shadowRef.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(.92)" }], o),
      ledRef.current?.animate([{ opacity: 0.35 }, { opacity: 0.7 }], {
        duration: 2600,
        iterations: Infinity,
        direction: "alternate",
        easing: "ease-in-out",
      }),
    ];
    return () => a.forEach((x) => x?.cancel());
  }, []);
  return (
    <div className="robot-box" style={{ width: 220 }} aria-hidden>
      <div
        ref={shadowRef}
        style={{
          position: "absolute",
          left: "20%",
          right: "20%",
          bottom: "-5%",
          height: 20,
          background: "radial-gradient(closest-side, rgba(255,255,255,.1), rgba(255,255,255,0))",
        }}
      />
      <div ref={floatRef} style={{ position: "absolute", inset: 0 }}>
        <div className="pose-wink">
          <RobotImg name="robot-wink-base" />
          <div ref={ledRef} style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
            <RobotImg name="robot-wink-eyeline" />
            <RobotImg name="robot-wink-eyeline" style={{ transform: "translateX(-22.1%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
