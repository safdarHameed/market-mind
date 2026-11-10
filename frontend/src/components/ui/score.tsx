import { useId } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ShieldAlert, ShieldCheck, ShieldHalf } from "lucide-react";

import type { Confidence, OpportunityCard } from "@/lib/types";
import { cn, scoreTone } from "@/lib/utils";

import { Badge } from "./primitives";

const toneColor = { high: "var(--success)", mid: "var(--primary)", low: "var(--subtle)" };

/** Circular score. Dashed ring when confidence is low, so it never looks more certain than it is. */
export function ScoreRing({
  score,
  confidence,
  size = 56,
  stroke = 5,
  className,
}: {
  score: number | null;
  confidence?: Confidence | null;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const color = toneColor[scoreTone(score)];
  const maskId = `sr-${useId().replace(/:/g, "")}`;
  const low = confidence === "low";
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score ?? "not available"} out of 100${low ? ", low confidence" : ""}`}
      title={low ? "Low confidence — the ring is broken to show the score is uncertain" : undefined}
    >
      <svg width={size} height={size} className="-rotate-90">
        {low && (
          <mask id={maskId}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth={stroke + 2} strokeDasharray={`${stroke * 0.9} ${stroke * 0.7}`} />
          </mask>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap={low ? "butt" : "round"}
          strokeDasharray={`${c * pct} ${c}`}
          mask={low ? `url(#${maskId})` : undefined}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-semibold tabular-nums" style={{ fontSize: size * 0.3 }}>
          {score ?? "–"}
        </span>
      </div>
    </div>
  );
}

export function ConfidenceBadge({ confidence, className }: { confidence: Confidence | null | undefined; className?: string }) {
  if (!confidence) return null;
  const map = {
    high: { tone: "success" as const, icon: <ShieldCheck />, label: "Very sure" },
    moderate: { tone: "primary" as const, icon: <ShieldHalf />, label: "Fairly sure" },
    low: { tone: "warning" as const, icon: <ShieldAlert />, label: "Not sure yet" },
  }[confidence];
  return (
    <Badge tone={map.tone} className={className}>
      {map.icon}
      {map.label}
    </Badge>
  );
}

export function EvidenceStrength({ value }: { value: OpportunityCard["evidence_strength"] }) {
  const bars = value === "strong" ? 3 : value === "moderate" ? 2 : 1;
  const label = value === "strong" ? "Strong" : value === "moderate" ? "Moderate" : "Limited";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title="Based on how many different sources back it up">
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-1 rounded-sm", i <= bars ? "bg-accent" : "bg-surface-3")}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      {label} evidence
    </span>
  );
}

export function GrowthBadge({ direction }: { direction: OpportunityCard["growth_direction"] }) {
  if (!direction) return null;
  const m = {
    rising: { icon: <ArrowUpRight />, label: "Rising", tone: "success" as const },
    stable: { icon: <ArrowRight />, label: "Stable", tone: "neutral" as const },
    declining: { icon: <ArrowDownRight />, label: "Declining", tone: "danger" as const },
  }[direction];
  return (
    <Badge tone={m.tone} title="Based on dated figures found in the sources">
      {m.icon}
      {m.label}
    </Badge>
  );
}

export function DimensionBar({ value, max = 10 }: { value: number | null; max?: number }) {
  const pct = ((value ?? 0) / max) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}
