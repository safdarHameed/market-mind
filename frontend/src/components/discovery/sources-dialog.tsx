"use client";

import { ExternalLink } from "lucide-react";
import * as React from "react";

import { Dialog } from "@/components/ui/overlay";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { SOURCE_TYPE_LABELS } from "@/lib/taxonomy";
import type { Source } from "@/lib/types";
import { formatDate } from "@/lib/utils";

import { VerificationBadge } from "@/components/report/source-meta";

/** Full transparency: every page retrieved, including excluded and duplicate ones. */
export function SourcesDialog({ discoveryId, open, onClose }: { discoveryId: string; open: boolean; onClose: () => void }) {
  const { data, loading } = useApi<{ items: Source[] }>(open ? `/discoveries/${discoveryId}/sources` : null);
  const [filter, setFilter] = React.useState<"all" | "used" | "excluded">("all");
  const items = (data?.items ?? []).filter((s) => {
    const usable = (s.verification_status === "verified" || s.verification_status === "snippet_only") && !s.duplicate_of_id;
    return filter === "all" || (filter === "used" ? usable : !usable);
  });
  return (
    <Dialog open={open} onClose={onClose} title="All retrieved sources" description="Every page the search returned, and what happened to it." className="max-w-3xl">
      <div className="mb-3 flex gap-1.5">
        {(["all", "used", "excluded"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize ${filter === f ? "border-primary bg-primary-soft" : "border-border text-muted"}`}
          >
            {f === "used" ? "Analyzed" : f === "excluded" ? "Excluded / duplicates" : "All"}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-sm font-medium hover:text-primary">
                    {s.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{s.domain}</span>·<span>{SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type}</span>
                    {s.published_at && <>·<span>{formatDate(s.published_at)}</span></>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.duplicate_of_id ? <Badge tone="warning">Duplicate</Badge> : <VerificationBadge status={s.verification_status} />}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Open original source" className="rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-text">
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
              {(s.duplicate_reason || s.verification_note) && (
                <p className="mt-1 text-xs text-subtle">{s.duplicate_reason ? `Set aside: ${s.duplicate_reason}.` : s.verification_note}</p>
              )}
              {s.search_query && <p className="mt-1 font-mono text-[11px] text-subtle">query: {s.search_query}</p>}
            </li>
          ))}
          {!items.length && <li className="py-8 text-center text-sm text-muted">No sources in this view.</li>}
        </ul>
      )}
    </Dialog>
  );
}
