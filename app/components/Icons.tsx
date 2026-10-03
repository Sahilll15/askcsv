import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="9" fill="#0f0f14" />
    <rect x="8" y="16" width="4" height="8" rx="1.5" fill="#bdb8fb" />
    <rect x="14" y="11" width="4" height="13" rx="1.5" fill="#f6c7ef" />
    <rect x="20" y="7" width="4" height="17" rx="1.5" fill="#7c82f4" />
  </svg>
);

export const Compose = (p: P) => (
  <svg {...base(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
export const Search = (p: P) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const Chat = (p: P) => (
  <svg {...base(p)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
);
export const Database = (p: P) => (
  <svg {...base(p)}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
);
export const Info = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>
);
export const Paperclip = (p: P) => (
  <svg {...base(p)}><path d="m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>
);
export const ArrowUp = (p: P) => (
  <svg {...base(p)}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
);
export const Chevron = (p: P) => (
  <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>
);
export const Dots = (p: P) => (
  <svg {...base(p)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
);
export const Cpu = (p: P) => (
  <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>
);
export const Menu = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
);
export const Close = (p: P) => (
  <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}><path d="m5 12 5 5 9-10" /></svg>
);
export const Alert = (p: P) => (
  <svg {...base(p)}><path d="M12 3 2 20h20Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
);
export const Play = (p: P) => (
  <svg {...base(p)}><path d="M7 4v16l13-8Z" /></svg>
);
export const Download = (p: P) => (
  <svg {...base(p)}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
);
export const Upload = (p: P) => (
  <svg {...base(p)}><path d="M12 20V9" /><path d="m7 14 5-5 5 5" /><path d="M5 4h14" /></svg>
);
export const Lock = (p: P) => (
  <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const Trash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
);
export const Refresh = (p: P) => (
  <svg {...base(p)}><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 20v-4h-4" /></svg>
);
export const Sparkle = (p: P) => (
  <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>
);
export const Clock = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
