"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import * as React from "react";

import { Card } from "@/components/ui/primitives";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/taxonomy";
import type { DiscoveryDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

function useElapsed(since: string | null, running: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!since) return null;
  const s = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Shows only real stage events recorded by the backend — no simulated progress. */
export function ResearchProgress({ d }: { d: DiscoveryDetail }) {
  const running = d.status === "running" || d.status === "queued";
  const elapsed = useElapsed(d.started_at ?? d.created_at, running);
  const events = new Map(d.progress.map((e) => [e.stage, e]));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          {running ? (
            <span className="relative grid size-8 place-items-center">
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
              <span className="relative size-3 rounded-full bg-primary" />
            </span>
          ) : null}
          <div>
            <div className="text-sm font-semibold">{running ? "Researching public sources" : "Research stopped"}</div>
            <div className="text-xs text-muted">
              {d.status === "queued" ? "Starting…" : "Typically takes 1–3 minutes depending on the sources."}
            </div>
          </div>
        </div>
        {elapsed && <span className="font-mono text-xs tabular-nums text-subtle">{elapsed}</span>}
      </div>

      <ol className="divide-y divide-border">
        {STAGE_ORDER.map((stage) => {
          const ev = events.get(stage);
          const status = ev?.status ?? "pending";
          return (
            <li key={stage} className={cn("flex items-start gap-3 px-5 py-3.5", status === "pending" && "opacity-50")}>
              <span className="mt-0.5">
                {status === "done" ? (
                  <span className="grid size-5 place-items-center rounded-full bg-success-soft text-success"><Check className="size-3" /></span>
                ) : status === "active" ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : status === "error" ? (
                  <AlertCircle className="size-5 text-danger" />
                ) : (
                  <span className="block size-5 rounded-full border border-border-strong" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{STAGE_LABELS[stage].label}</div>
                <div className={cn("text-xs", status === "error" ? "text-danger" : "text-muted")}>
                  {status === "done" || status === "error" ? ev?.message : STAGE_LABELS[stage].hint}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {d.query_plan && (
        <div className="border-t border-border bg-surface-2/50 px-5 py-4">
          <div className="mb-2 text-xs font-medium text-muted">What we’re looking for: {d.query_plan.interpretation}</div>
          <ul className="flex flex-wrap gap-1.5">
            {d.query_plan.queries.map((q) => (
              <li key={q.query} className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] text-muted" title={q.purpose}>
                {q.query}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
