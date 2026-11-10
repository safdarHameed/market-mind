"use client";

import { ChevronDown, Info, RefreshCw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { Card, SectionLabel } from "@/components/ui/primitives";
import { ConfidenceBadge, DimensionBar, ScoreRing } from "@/components/ui/score";
import type { OpportunityReport } from "@/lib/types";
import { cn, formatDate, potentialLabel } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export function ScorePanel({
  report,
  onReassess,
  reassessing,
}: {
  report: OpportunityReport;
  onReassess?: () => void;
  reassessing?: boolean;
}) {
  const sc = report.score_detail;
  const [open, setOpen] = React.useState<string | null>(null);
  const [methodOpen, setMethodOpen] = React.useState(false);
  if (!sc) return null;
  const prev = report.score_history.length > 1 ? report.score_history[report.score_history.length - 2] : null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={sc.overall} confidence={sc.confidence} size={76} stroke={6} />
        <div className="min-w-0">
          <SectionLabel>Opportunity score</SectionLabel>
          <div className="mt-0.5 text-sm font-semibold">{potentialLabel(sc.overall)}</div>
          <ConfidenceBadge confidence={sc.confidence} className="mt-1.5" />
        </div>
      </div>

      {prev && (
        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Updated after your chat: <span className="tabular-nums">{prev.overall}</span> →{" "}
          <span className="font-semibold tabular-nums text-text">{sc.overall}</span>
          {sc.change_summary && <p className="mt-1">{sc.change_summary}</p>}
        </div>
      )}

      {sc.cap_reason && (
        <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-muted">
          {sc.cap_reason}
        </p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-muted">{sc.explanation}</p>

      <ul className="mt-4 space-y-1">
        {sc.dimensions.map((d) => (
          <li key={d.key}>
            <button
              onClick={() => setOpen(open === d.key ? null : d.key)}
              aria-expanded={open === d.key}
              className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{d.label}</span>
                <span className="flex items-center gap-1 tabular-nums text-muted">
                  {d.score ?? "–"}/10
                  <ChevronDown className={cn("size-3 transition-transform", open === d.key && "rotate-180")} />
                </span>
              </div>
              <DimensionBar value={d.score} />
            </button>
            {open === d.key && (
              <div className="px-2 pb-2 pt-1 text-xs leading-relaxed text-muted animate-fade-in">
                {d.rationale}
                <div className="mt-1 text-subtle">{d.description} Weight {Math.round(d.weight * 100)}%.</div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {sc.limitations.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <SectionLabel className="mb-1.5">Main limitations</SectionLabel>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            {sc.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <button onClick={() => setMethodOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Info className="size-3.5" /> How is this scored?
        </button>
        {onReassess && (
          <Button size="sm" variant="secondary" onClick={onReassess} loading={reassessing} title="Score again using your chat and any new sources">
            {!reassessing && <RefreshCw />}Update score
          </Button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        {formatDate(sc.created_at)} · A guide, not a promise of success.
      </p>

      <Dialog open={methodOpen} onClose={() => setMethodOpen(false)} title="How the score works">
        <div className="space-y-3 text-sm text-muted">
          <p>The AI rates each part from 0 to 10 based on the sources. {BRAND.name} adds them up using these weights:</p>
          <ul className="space-y-1">
            {sc.dimensions.map((d) => (
              <li key={d.key} className="flex justify-between gap-4 border-b border-border py-1">
                <span><span className="font-medium text-text">{d.label}</span> — {d.description}</span>
                <span className="tabular-nums">{Math.round(d.weight * 100)}%</span>
              </li>
            ))}
          </ul>
          <p>
            <span className="font-medium text-text">Few sources, lower score.</span> With only 1 source the score stays at 45 or below, with 2 at 65, with 3 at 80. So a score can’t look better than its proof.
          </p>
          <p>
            A <span className="font-medium text-text">broken ring</span> means we’re not very sure yet.
          </p>
          <p>Use the score to compare ideas — it doesn’t predict success.</p>
        </div>
      </Dialog>
    </Card>
  );
}
