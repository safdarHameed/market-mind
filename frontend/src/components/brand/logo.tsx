import { useId } from "react";

import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * MarketMind mark — a bold "M" (Market) with a glowing idea-dot in its valley (Mind):
 * the market, with a thinking mind at its centre. On hover the idea-dot lights up.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string; animate?: boolean }) {
  const gid = `mm-bg-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("logo-mark shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2F5BD3" />
          <stop offset="1" stopColor="#6246EA" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
      <path d="M8 24V9.5l8 9 8-9V24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="8.6" r="2.6" fill="#7FE3FF" className="lm-idea" />
    </svg>
  );
}

/** Full logo: mark + wordmark ("Market" in text colour, "Mind" in brand blue). */
export function Logo({ className, size = 28 }: { className?: string; size?: number; animate?: boolean }) {
  const split = BRAND.name.match(/^(Market)(Mind)$/);
  return (
    <span className={cn("group/logo inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="text-[17px] font-bold tracking-tight text-text">
        {split ? (
          <>
            {split[1]}
            <span className="text-primary">{split[2]}</span>
          </>
        ) : (
          BRAND.name
        )}
      </span>
    </span>
  );
}
