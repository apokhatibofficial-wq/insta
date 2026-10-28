// Icons copied from the design files (stroke icons, currentColor).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, sw = 1.8): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: sw,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const IconUsers = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.6 3 5.2" />
  </svg>
);
export const IconCalendar = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const IconBot = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <rect x="4" y="7" width="16" height="12" rx="4" />
    <path d="M12 7V4M9 12.5v1M15 12.5v1" />
  </svg>
);
export const IconLog = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <path d="M5 4h14v16H5z" />
    <path d="M9 9h6M9 13h6M9 17h3" />
  </svg>
);
export const IconCheck = ({ size = 18, sw = 2.2, ...p }: P & { sw?: number }) => (
  <svg {...base(size, sw)} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconX = ({ size = 20, sw = 1.8, ...p }: P & { sw?: number }) => (
  <svg {...base(size, sw)} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPlus = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 2)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconSearch = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.8)} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);
export const IconKebab = ({ size = 18, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <circle cx="12" cy="5.5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="18.5" r="1.6" />
  </svg>
);
export const IconWarning = ({ size = 20, ...p }: P) => (
  <svg {...base(size, 1.8)} {...p}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </svg>
);
export const IconInfo = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.8)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </svg>
);
export const IconClock = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.8)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconEye = ({ size = 22, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconEyeOff = ({ size = 22, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 3.9M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 7 9.5 7c1.6 0 3-.4 4.3-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
export const IconChevronStart = ({ size = 14, ...p }: P) => (
  <svg {...base(size, 2)} {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </svg>
);
export const IconArrowEnd = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 2)} {...p}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const IconLinkBroken = ({ size = 22, ...p }: P) => (
  <svg {...base(size, 1.8)} {...p}>
    <path d="M9.5 14.5l5-5M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
  </svg>
);
export const IconPasskey = ({ size = 34, ...p }: P) => (
  <svg {...base(size, 1.6)} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5 1.3 0 2.5.3 3.4.9" />
    <circle cx="17.5" cy="13.5" r="2.5" />
    <path d="M17.5 16v4.5M17.5 18.5h1.8" />
  </svg>
);
export const IconLock = ({ size = 16, ...p }: P) => (
  <svg {...base(size, 1.8)} {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
  </svg>
);
export const IconSun = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </svg>
);
export const IconMoon = ({ size = 18, ...p }: P) => (
  <svg {...base(size, 1.7)} {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);
