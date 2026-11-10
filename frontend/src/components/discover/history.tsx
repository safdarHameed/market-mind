"use client";

import { AlertCircle, ArrowUpRight, CheckCircle2, FlaskConical, History, Loader2 } from "lucide-react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import type { DiscoverySummary } from "@/lib/types";
import { plural, timeAgo } from "@/lib/utils";

export function RecentDiscoveries({ hideHeading }: { hideHeading?: boolean } = {}) {
  const { data, loading, error } = useApi<{ items: DiscoverySummary[] }>("/discoveries?limit=6", {
    pollMs: (d) => (d?.items.some((x) => x.status === "running" || x.status === "queued") ? 4000 : null),
  });
  return (
    <section aria-labelledby="recent-h">
      <h2 id="recent-h" className={hideHeading ? "sr-only" : "mb-4 flex items-center gap-2 text-base font-semibold"}>
        <History className="size-4 text-subtle" /> Recent discoveries
      </h2>
      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-muted">{error.message}</p>
      ) : !data?.items.length ? (
        <p className="rounded-2xl border border-dashed border-border-strong px-5 py-8 text-center text-sm text-subtle">
          Nothing yet — your searches will show up here.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((d) => (
            <li key={d.id}>
              <Link
                href={`/discover/${d.id}`}
                className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop"
              >
                <div className="mb-3 flex items-center justify-between">
                  <StatusIcon status={d.status} demo={d.is_demo} />
                  <ArrowUpRight className="size-4 text-subtle transition-colors group-hover:text-primary" />
                </div>
                <div className="line-clamp-2 text-sm font-medium leading-snug">{d.query || d.title}</div>
                <div className="mt-auto pt-3 text-xs text-muted">
                  {d.location.label} ·{" "}
                  {d.status === "completed"
                    ? plural(d.opportunity_count, "opportunity", "opportunities")
                    : d.status === "failed"
                      ? "Failed — open to retry"
                      : "Researching…"}{" "}
                  · {timeAgo(d.created_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusIcon({ status, demo }: { status: DiscoverySummary["status"]; demo: boolean }) {
  if (demo) return <FlaskConical className="size-4 shrink-0 text-warning" aria-label="Sample data" />;
  if (status === "completed") return <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Completed" />;
  if (status === "failed") return <AlertCircle className="size-4 shrink-0 text-danger" aria-label="Failed" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Running" />;
}
