"use client";

import { useEffect, useRef } from "react";
import { RobotImg } from "./RobotImg";

/**
 * Small living robot (login, dashboard hero): floats, blinks, can look toward
 * a field, and switches to the "point" pose for errors. Respects reduced motion.
 */
export function MiniRobot({
  width = 150,
  pose = "wink",
  look = [0, 0],
}: {
  width?: number;
  pose?: "wink" | "point";
  look?: [number, number];
}) {
  const floatRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const o: KeyframeAnimationOptions = {
      duration: 2100,
      iterations: Infinity,
      direction: "alternate",
      easing: "cubic-bezier(.45,0,.55,1)",
    };
    const a1 = floatRef.current?.animate([{ transform: "translateY(0px)" }, { transform: "translateY(-5px)" }], o);
    const a2 = shadowRef.current?.animate(
      [
        { transform: "scaleX(1)", opacity: 1 },
        { transform: "scaleX(.86)", opacity: 0.7 },
      ],
      o,
    );
    let t: ReturnType<typeof setTimeout>;
    const blink = () => {
      t = setTimeout(() => {
        floatRef.current?.querySelectorAll<HTMLElement>("[data-blink]").forEach((el) =>
          el.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.08)", offset: 0.45 }, { transform: "scaleY(1)" }], {
            duration: 220,
            easing: "cubic-bezier(.45,0,.55,1)",
          }),
        );
        blink();
      }, 2600 + Math.random() * 3000);
    };
    blink();
    return () => {
      a1?.cancel();
      a2?.cancel();
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="robot-box" style={{ width, flex: "none" }} aria-hidden>
      <div
        ref={shadowRef}
        style={{
          position: "absolute",
          left: "20%",
          right: "20%",
          bottom: "-6%",
          height: 16,
          background: "radial-gradient(closest-side, var(--halo-strong, rgba(255,255,255,.1)), rgba(255,255,255,0))",
        }}
      />
      <div ref={floatRef} style={{ position: "absolute", inset: 0 }}>
        <div className="pose-wink" style={{ opacity: pose === "wink" ? 1 : 0, transition: "opacity 300ms ease" }}>
          <RobotImg name="robot-wink-base" />
          <div
            ref={lookRef}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${look[0]}px, ${look[1]}px)`,
              transition: "transform 600ms cubic-bezier(.16,1,.3,1)",
            }}
          >
            <RobotImg name="robot-wink-eyeopen" data-blink="" style={{ transformOrigin: "38.7% 41.5%" }} />
            <RobotImg name="robot-wink-eyeline" />
            <RobotImg name="robot-wink-mouth" />
          </div>
        </div>
        <RobotImg
          name="robot-point"
          className="pose-point"
          style={{ opacity: pose === "point" ? 1 : 0, transition: "opacity 300ms ease" }}
        />
      </div>
    </div>
  );
}
