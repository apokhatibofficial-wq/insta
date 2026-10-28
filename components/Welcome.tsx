"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { RobotImg } from "./robot/RobotImg";

// Port of designs/Welcome 1a.dc.html (motion v5 · living character).
// Two fixed-size stages (desktop 1280×800, mobile 390×844) scaled to fit the
// viewport, so the composition stays pixel-close at any size.

const WORDS = ["أهلًا", "يا", "صديقي،", "أنا", "هنا", "لمساعدتك."];
const SENTENCE = "أهلًا يا صديقي، أنا هنا لمساعدتك.";
const EXPO = "cubic-bezier(.16,1,.3,1)";
const SOFT = "cubic-bezier(.65,0,.35,1)";
const SINE = "cubic-bezier(.45,0,.55,1)";

type Opts = {
  easing?: string;
  fill?: FillMode;
  iterations?: number;
  direction?: PlaybackDirection;
  instant?: boolean;
};
type Track = { x: number; y: number; lx: number; ly: number; tx: number; ty: number; last: number; wander: number };

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function Stage({ mobile, onSkip }: { mobile: boolean; onSkip: () => void }) {
  const W = mobile ? 390 : 1280;
  const H = mobile ? 844 : 800;
  return (
    <div
      data-stage=""
      className={`welcome-stage ${mobile ? "welcome-mobile" : "welcome-desktop"}`}
      style={{ width: W, height: H }}
    >
      <div data-a="reveal" className="welcome-reveal">
        <div data-a="cam" className="welcome-fill">
          <div
            data-a="light"
            className="welcome-light"
            style={{
              background: mobile
                ? "radial-gradient(ellipse 70% 34% at 50% 32%, rgba(255,255,255,.085), rgba(255,255,255,0) 70%)"
                : "radial-gradient(ellipse 40% 46% at 58% 48%, rgba(255,255,255,.085), rgba(255,255,255,0) 70%)",
            }}
          />
          <div className="welcome-robot-box" style={mobile ? { top: 150, left: 30, width: 330 } : { top: 150, right: 170, width: 540 }}>
            <div data-par="" className="welcome-fill">
              <div data-a="shadowWrap" className="welcome-shadow-wrap" style={{ height: mobile ? 26 : 42 }}>
                <div data-a="shadow" className="welcome-shadow" />
              </div>
              <div data-a="robot" data-hit="" className="welcome-robot">
                <div data-a="float" className="welcome-fill">
                  <div data-a="breathe" className="welcome-fill" style={{ transformOrigin: "50% 90%" }}>
                    <div data-a="tilt" className="welcome-fill" style={{ transformOrigin: "50% 85%" }}>
                      <div data-a="poseA" className="pose-wave">
                        <RobotImg name="robot-wave-base" alt="روبوت KHATIB يرحّب بك" />
                        <div data-a="led" className="welcome-fill">
                          <div data-look="" className="welcome-fill">
                            <RobotImg name="robot-wave-eye1" data-a="eye1" data-blink="" style={{ transformOrigin: "43.8% 44%" }} />
                            <RobotImg name="robot-wave-eye2" data-a="eye2" data-blink="" style={{ transformOrigin: "63% 37.1%" }} />
                            <RobotImg name="robot-wave-mouth" />
                          </div>
                        </div>
                      </div>
                      <div data-a="poseB" className="pose-wink" style={{ opacity: 0 }}>
                        <RobotImg name="robot-wink-base" />
                        <div data-a="ledGlow" className="welcome-fill">
                          <div data-look="" className="welcome-fill">
                            <RobotImg name="robot-wink-eyeopen" data-a="eyeopen" data-blink="" style={{ transformOrigin: "38.7% 41.5%" }} />
                            <RobotImg name="robot-wink-eyeline" />
                            <RobotImg name="robot-wink-mouth" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            data-a="bubble"
            role="status"
            aria-label={SENTENCE}
            className="welcome-bubble"
            style={
              mobile
                ? { top: 400, left: 24, right: 24, transformOrigin: "50% -20px" }
                : { top: 220, left: 150, width: 400, transformOrigin: "calc(100% + 20px) 61px" }
            }
          >
            <div data-a="bfloat" style={{ position: "relative" }}>
              <div data-bpar="" style={{ position: "relative" }}>
                <div className="welcome-bubble-frame" style={{ borderRadius: mobile ? 24 : 28 }}>
                  <div
                    data-a="ring"
                    className="welcome-ring"
                    style={mobile ? { width: 800, height: 800, margin: "-400px 0 0 -400px" } : undefined}
                  />
                  <div className="welcome-bubble-fill" style={{ borderRadius: mobile ? 23 : 27 }} />
                </div>
                {mobile ? (
                  <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden style={{ position: "absolute", top: -20, left: "50%", marginLeft: -17, overflow: "visible" }}>
                    <path d="M0 22 C7 15 13 9 17 1 C21 9 27 15 34 22 Z" fill="#121316" stroke="#2a2c31" strokeWidth="1" />
                    <rect x="0.6" y="19.4" width="32.8" height="4.6" fill="#121316" />
                  </svg>
                ) : (
                  <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden style={{ position: "absolute", right: -20, top: 44, overflow: "visible" }}>
                    <path d="M0 0 C7 7 13 13 21 17 C13 21 7 27 0 34 Z" fill="#121316" stroke="#2a2c31" strokeWidth="1" />
                    <rect x="-2" y="0.6" width="4.6" height="32.8" fill="#121316" />
                  </svg>
                )}
                <div style={{ position: "relative", padding: mobile ? "22px 24px" : "30px 34px" }}>
                  <div
                    data-a="dots"
                    className="welcome-dots"
                    style={mobile ? { top: 36, left: "50%", marginLeft: -22 } : { top: 44, right: 34 }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span key={i} data-a="dot" data-i={i} />
                    ))}
                  </div>
                  <p aria-hidden className="welcome-words" style={mobile ? { fontSize: 24, textAlign: "center" } : { fontSize: 30 }}>
                    {WORDS.map((w, i) => (
                      <span key={i} data-a="word" data-i={i}>
                        {w}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="welcome-scan" style={{ borderRadius: mobile ? 24 : 28 }} />
              </div>
            </div>
          </div>
        </div>

        <div className="welcome-top" style={mobile ? { padding: "56px 20px 0" } : { padding: "32px 48px" }}>
          <div data-a="brand" className="brand" style={{ fontSize: mobile ? 11 : 13, gap: mobile ? 6 : 10, letterSpacing: mobile ? ".14em" : ".16em" }}>
            <b>KHATIB</b>
            <span>TECHNICAL SOLUTIONS</span>
          </div>
          <button data-a="skip" type="button" className="welcome-skip" onClick={onSkip} style={{ height: mobile ? 44 : 40 }}>
            تخطَّ
          </button>
        </div>
        <div className="welcome-cta-wrap" style={mobile ? { bottom: 44, left: 20, right: 20, alignItems: "stretch", textAlign: "center" } : { bottom: 72, left: 0, right: 0 }}>
          <Link data-a="cta" href="/login" className="btn btn-primary btn-lg welcome-cta" style={mobile ? undefined : { padding: "0 36px" }}>
            الدخول إلى لوحتك
          </Link>
          <span data-a="cta2" style={{ fontSize: mobile ? 14 : 15, color: "#8f939a" }}>
            ستحتاج رمز الدخول الذي استلمته منّا.
          </span>
        </div>
      </div>
      <div data-a="line" className="welcome-line" />
    </div>
  );
}

export function Welcome() {
  const root = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ finish: () => void } | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // Shown once per browser session; later visits go straight to login.
    document.cookie = "kts_welcomed=1; Path=/; SameSite=Lax; Secure";

    let anims: Animation[] = [];
    let timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const tracks = new Map<HTMLElement, Track>();
    el.querySelectorAll<HTMLElement>("[data-stage]").forEach((st) =>
      tracks.set(st, { x: 0, y: 0, lx: 0, ly: 0, tx: 0, ty: 0, last: 0, wander: 0 }),
    );

    const fit = () => {
      el.querySelectorAll<HTMLElement>("[data-stage]").forEach((st) => {
        const w = st.offsetWidth;
        const h = st.offsetHeight;
        const s = Math.min(window.innerWidth / w, window.innerHeight / h);
        st.style.transform = `translate(-50%, -50%) scale(${s})`;
      });
    };
    fit();
    window.addEventListener("resize", fit);

    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      anims.forEach((a) => a.cancel());
      anims = [];
    };

    const A = (key: string, kf: Keyframe[], dur: number, delay: number | ((e: HTMLElement) => number), o: Opts = {}) => {
      el.querySelectorAll<HTMLElement>(`[data-a="${key}"]`).forEach((node) => {
        const d = typeof delay === "function" ? delay(node) : delay;
        anims.push(
          node.animate(kf, {
            duration: o.instant ? 0 : dur,
            delay: o.instant ? 0 : d,
            easing: o.easing ?? EXPO,
            fill: o.fill ?? "both",
            iterations: o.instant ? 1 : (o.iterations ?? 1),
            direction: o.direction ?? "normal",
          }),
        );
      });
    };

    const blink = (scope: ParentNode = el) =>
      scope.querySelectorAll<HTMLElement>("[data-blink]").forEach((n) =>
        n.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.08)", offset: 0.45 }, { transform: "scaleY(1)" }], {
          duration: 220,
          easing: SINE,
        }),
      );

    const hop = (st: Element | null) => {
      if (!st || reducedMotion()) return;
      st.querySelectorAll<HTMLElement>('[data-a="robot"]').forEach((n) =>
        n.animate(
          [
            { transform: "translateY(0px) scale(1,1)" },
            { transform: "translateY(5px) scale(1.05,.94)", offset: 0.18 },
            { transform: "translateY(-26px) scale(.97,1.04)", offset: 0.48 },
            { transform: "translateY(3px) scale(1.04,.96)", offset: 0.78 },
            { transform: "translateY(0px) scale(1,1)" },
          ],
          { duration: 720, easing: "cubic-bezier(.33,1,.68,1)", composite: "replace" },
        ),
      );
      blink(st);
    };

    const scheduleBlinks = () => {
      const next = () => {
        timers.push(
          setTimeout(() => {
            blink();
            if (Math.random() < 0.25) timers.push(setTimeout(() => blink(), 300));
            next();
          }, 2400 + Math.random() * 3200),
        );
      };
      next();
    };

    const startIdle = (delay: number) => {
      const o: Opts = { fill: "none", iterations: Infinity, direction: "alternate", easing: SINE };
      A("float", [{ transform: "translateY(0px)" }, { transform: "translateY(-9px)" }], 2100, delay, o);
      A("shadow", [{ transform: "scaleX(1)", opacity: 1 }, { transform: "scaleX(.88)", opacity: 0.72 }], 2100, delay, o);
      A("breathe", [{ transform: "scale(1,1)" }, { transform: "scale(1.008,1.014)" }], 1700, delay + 400, o);
      A("bfloat", [{ transform: "translateY(0px)" }, { transform: "translateY(-5px)" }], 2100, delay + 350, o);
      A("ledGlow", [{ filter: "brightness(1)" }, { filter: "brightness(1.18)" }], 1700, delay + 400, o);
      A("ring", [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], 9000, delay, {
        fill: "none",
        iterations: Infinity,
        easing: "linear",
      });
      timers.push(setTimeout(scheduleBlinks, delay));
    };

    const play = (instant: boolean) => {
      stop();
      const I = (o: Opts = {}): Opts => ({ ...o, instant });
      A("line", [{ opacity: 0, transform: "scaleX(0)" }, { opacity: 1, transform: "scaleX(1)", offset: 0.6 }, { opacity: 0, transform: "scaleX(1) scaleY(14)" }], 420, 0, I({ easing: SOFT }));
      A("reveal", [{ clipPath: "inset(50% 0% 50% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)" }], 520, 260, I());
      A("cam", [{ transform: "scale(1.035)" }, { transform: "scale(1)" }], 2200, 260, I({ easing: "cubic-bezier(.22,1,.36,1)" }));
      A("light", [{ opacity: 0 }, { opacity: 1 }], 1200, 300, I({ easing: "ease-out" }));
      A("brand", [{ opacity: 0, letterSpacing: ".42em" }, { opacity: 1 }], 1200, 350, I());
      A("skip", [{ opacity: 0 }, { opacity: 1 }], 400, 350, I({ easing: "ease-out" }));
      A(
        "robot",
        [
          { opacity: 0, transform: "translateY(90px) rotate(-8deg) scale(.72,.72)", filter: "blur(8px)", offset: 0 },
          { opacity: 1, filter: "blur(0px)", offset: 0.22 },
          { transform: "translateY(-18px) rotate(3deg) scale(.98,1.04)", offset: 0.42 },
          { transform: "translateY(5px) rotate(-1.5deg) scale(1.05,.94)", offset: 0.6 },
          { transform: "translateY(-4px) rotate(.6deg) scale(.99,1.01)", offset: 0.8 },
          { opacity: 1, transform: "translateY(0px) rotate(0deg) scale(1,1)", filter: "blur(0px)", offset: 1 },
        ],
        1150,
        300,
        I({ easing: "linear" }),
      );
      A(
        "shadowWrap",
        [
          { opacity: 0, transform: "scaleX(.4)" },
          { opacity: 0.6, transform: "scaleX(.75)", offset: 0.42 },
          { opacity: 1, transform: "scaleX(1.08)", offset: 0.6 },
          { opacity: 1, transform: "scaleX(1)" },
        ],
        1150,
        300,
        I({ easing: "linear" }),
      );
      A(
        "led",
        [
          { opacity: 0, clipPath: "inset(0% 0% 100% 0%)", filter: "brightness(2)" },
          { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", offset: 0.45 },
          { opacity: 0.4, offset: 0.58 },
          { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", filter: "brightness(1)" },
        ],
        420,
        820,
        I({ easing: "linear" }),
      );
      const blinkKf = [{ transform: "scaleY(1)" }, { transform: "scaleY(.08)", offset: 0.45 }, { transform: "scaleY(1)" }];
      A("eye1", blinkKf, 220, 1300, I({ easing: SOFT, fill: "none" }));
      A("eye2", blinkKf, 220, 1315, I({ easing: SOFT, fill: "none" }));
      A(
        "tilt",
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-6deg)", offset: 0.2 },
          { transform: "rotate(4deg)", offset: 0.42 },
          { transform: "rotate(-3deg)", offset: 0.62 },
          { transform: "rotate(1.2deg)", offset: 0.82 },
          { transform: "rotate(0deg)" },
        ],
        950,
        1150,
        I({ easing: SINE }),
      );
      A(
        "bubble",
        [
          { opacity: 0, transform: "scale(.3)", filter: "blur(8px)" },
          { opacity: 1, transform: "scale(1.035)", filter: "blur(0px)", offset: 0.55 },
          { transform: "scale(.992)", offset: 0.8 },
          { opacity: 1, transform: "scale(1)", filter: "blur(0px)" },
        ],
        700,
        1150,
        I({ easing: "cubic-bezier(.2,.7,.3,1)" }),
      );
      A("ring", [{ transform: "rotate(-60deg)" }, { transform: "rotate(300deg)" }], 1200, 1250, I({ easing: SOFT, fill: "none" }));
      A("dots", [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], 720, 1300, I({ easing: "linear" }));
      A(
        "dot",
        [
          { opacity: 0.25, transform: "translateY(0px)" },
          { opacity: 1, transform: "translateY(-4px)" },
          { opacity: 0.25, transform: "translateY(0px)" },
        ],
        360,
        (n) => 1360 + Number(n.dataset.i) * 110,
        I({ iterations: 2, fill: "none", easing: "ease-in-out" }),
      );
      A(
        "word",
        [
          { opacity: 0, transform: "translateY(.3em) scale(.96)", filter: "blur(5px)", textShadow: "0 0 0px rgba(255,255,255,0)" },
          { opacity: 1, textShadow: "0 0 22px rgba(255,255,255,.75)", offset: 0.4 },
          { opacity: 1, transform: "translateY(0em) scale(1)", filter: "blur(0px)", textShadow: "0 0 14px rgba(255,255,255,.28)" },
        ],
        620,
        (n) => {
          const i = Number(n.dataset.i);
          return 1960 + i * 85 + (i >= 3 ? 130 : 0);
        },
        I(),
      );
      A("cta", [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "translateY(0px)" }], 700, 1550, I());
      A("cta2", [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0px)" }], 700, 1650, I());
      const T = 2500;
      A("poseA", [{ opacity: 1 }, { opacity: 0 }], 140, T + 230, I({ easing: "linear" }));
      A("poseB", [{ opacity: 0 }, { opacity: 1 }], 140, T + 230, I({ easing: "linear" }));
      if (!instant) timers.push(setTimeout(() => el.querySelectorAll("[data-stage]").forEach(hop), T));
      if (!reducedMotion()) startIdle(instant ? 0 : 3200);
      el.dataset.done = instant ? "true" : "false";
      if (!instant) timers.push(setTimeout(() => (el.dataset.done = "true"), 3200));
    };

    const finish = () => play(true);
    ctl.current = { finish };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" && el.dataset.done !== "true" && !(e.target instanceof HTMLButtonElement)) finish();
    };
    const onMove = (e: PointerEvent) => {
      tracks.forEach((p, st) => {
        if (st.offsetParent === null) return;
        const r = st.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        const box = st.querySelector("[data-par]")!.getBoundingClientRect();
        const cx = box.left + box.width * 0.5;
        const cy = box.top + box.height * 0.45;
        p.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 0.45)));
        p.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 0.45)));
        p.last = performance.now();
      });
    };
    const onHit = (e: Event) => hop((e.currentTarget as HTMLElement).closest("[data-stage]"));
    const hits = el.querySelectorAll<HTMLElement>("[data-hit]");
    hits.forEach((h) => h.addEventListener("click", onHit));
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);

    const loop = (now: number) => {
      const live = !reducedMotion();
      tracks.forEach((p, st) => {
        if (live && now - p.last > 1800 && now > p.wander) {
          const r = Math.random();
          p.tx = r < 0.3 ? 0 : Math.random() * 1.4 - 0.7;
          p.ty = r < 0.3 ? 0 : Math.random() * 0.9 - 0.45;
          p.wander = now + 1600 + Math.random() * 2200;
        }
        const tx = live ? p.tx : 0;
        const ty = live ? p.ty : 0;
        p.x += (tx - p.x) * 0.045;
        p.y += (ty - p.y) * 0.045;
        p.lx += (tx - p.lx) * 0.12;
        p.ly += (ty - p.ly) * 0.12;
        const par = st.querySelector<HTMLElement>("[data-par]");
        if (par) par.style.transform = `translate3d(${(p.x * 9).toFixed(2)}px, ${(p.y * 5).toFixed(2)}px, 0) rotate(${(p.x * 3).toFixed(2)}deg)`;
        st.querySelectorAll<HTMLElement>("[data-look]").forEach((n) => {
          n.style.transform = `translate3d(${(p.lx * 7).toFixed(2)}px, ${(p.ly * 5).toFixed(2)}px, 0)`;
        });
        st.querySelectorAll<HTMLElement>("[data-bpar]").forEach((n) => {
          n.style.transform = `translate3d(${(p.x * -4).toFixed(2)}px, ${(p.y * -3).toFixed(2)}px, 0)`;
        });
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    play(reducedMotion());
    el.dataset.js = "true";

    return () => {
      stop();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
      hits.forEach((h) => h.removeEventListener("click", onHit));
    };
  }, []);

  const skip = () => ctl.current?.finish();

  return (
    <div ref={root} className="welcome force-dark" data-done="false">
      <Stage mobile={false} onSkip={skip} />
      <Stage mobile onSkip={skip} />
    </div>
  );
}
