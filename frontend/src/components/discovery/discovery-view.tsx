"use client";

import { AlertTriangle, ArrowLeft, FlaskConical, RotateCcw, SearchX, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/layout/app-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/overlay";
import { Alert, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api, useApi } from "@/lib/api";
import type { DiscoveryDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";

import { AnswerCard } from "./answer-card";
import { ResearchProgress } from "./research-progress";
import { SourcesDialog } from "./sources-dialog";

export function DiscoveryView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: d, error } = useApi<DiscoveryDetail>(`/discoveries/${id}`, {
    pollMs: (x) => (x && (x.status === "running" || x.status === "queued") ? 1500 : null),
  });
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "retry" | "delete">(null);

  const retry = async () => {
    setBusy("retry");
    try {
      await api(`/discoveries/${id}/retry`, { method: "POST" });
      // Reload so polling restarts from the fresh "queued" state.
      window.location.reload();
    } catch (e) {
      toast({ title: "Couldn't retry", description: e instanceof Error ? e.message : undefined, tone: "danger" });
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this discovery and its reports?")) return;
    setBusy("delete");
    try {
      await api(`/discoveries/${id}`, { method: "DELETE" });
      router.push("/discover");
    } catch (e) {
      toast({ title: "Couldn't delete", description: e instanceof Error ? e.message : undefined, tone: "danger" });
      setBusy(null);
    }
  };

  if (error)
    return (
      <PageContainer>
        <EmptyState icon={<SearchX />} title={error.status === 404 ? "Discovery not found" : "Couldn't load this discovery"} description={error.message}
          action={<ButtonLink href="/discover" variant="secondary">Back to Discover</ButtonLink>} />
      </PageContainer>
    );
  if (!d) return <DiscoverySkeleton />;

  const running = d.status === "running" || d.status === "queued";
  const s = d.stats;

  return (
    <PageContainer>
      <Link href="/discover" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Home
      </Link>

      {d.is_demo && (
        <Alert tone="warning" icon={<FlaskConical />} className="mb-5" title="Sample data — not real research">
          Placeholder content to show how results look. Connect an AI in Settings to run real research.
        </Alert>
      )}

      <header className="mb-8">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {running ? "Researching…" : d.status === "failed" ? "Research didn’t finish" : d.query ? d.query.charAt(0).toUpperCase() + d.query.slice(1) : d.title}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {d.status === "completed" && d.opportunities.length > 0 ? (
            <>
              {d.opportunities.length} {d.opportunities.length === 1 ? "opportunity" : "opportunities"} · from {s.analyzed ?? 0} sources ·{" "}
              {!d.is_demo ? (
                <button onClick={() => setSourcesOpen(true)} className="text-primary hover:underline">view sources</button>
              ) : (
                d.location.label
              )}
            </>
          ) : (
            <>{d.location.label}{d.industries.length > 0 && ` · ${d.industries.join(", ")}`}</>
          )}
        </p>
      </header>

      {running && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ResearchProgress d={d} />
          <div className="space-y-3">
            <p className="text-sm text-muted">You can leave this page — research continues in the background and will appear in your recent discoveries.</p>
            {[0, 1].map((i) => <Card key={i} className="p-5"><Skeleton className="h-5 w-3/4" /><Skeleton className="mt-3 h-3.5 w-full" /><Skeleton className="mt-2 h-3.5 w-2/3" /></Card>)}
          </div>
        </div>
      )}

      {d.status === "failed" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Alert tone="danger" icon={<AlertTriangle />} title="Research failed">{d.error}</Alert>
            <div className="flex gap-2">
              {!d.is_demo && <Button onClick={retry} loading={busy === "retry"}>{busy !== "retry" && <RotateCcw />}Retry discovery</Button>}
              <Button variant="ghost" onClick={remove} loading={busy === "delete"}>{busy !== "delete" && <Trash2 />}Delete</Button>
            </div>
          </div>
          {d.progress.length > 0 && <ResearchProgress d={d} />}
        </div>
      )}

      {d.status === "completed" && (
        <>
          {s.note && <p className="mb-6 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{s.note}</p>}

          {d.opportunities.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title="No clear opportunities found"
              description="The sources we found didn’t back up any opportunity strongly enough. Try a broader place, a different industry, or a longer time period."
              action={<ButtonLink href="/discover">Try another search</ButtonLink>}
            />
          ) : (
            <div className={`grid gap-5 ${d.opportunities.length > 1 ? "xl:grid-cols-2" : ""}`}>
              {d.opportunities.map((o, i) => (
                <AnswerCard key={o.id} o={o} index={i} />
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-subtle">
            <span>
              Researched {formatDate(d.completed_at, { dateStyle: "medium", timeStyle: "short" })}
              {d.llm_model && !d.is_demo ? ` · ${d.llm_model}` : ""}
            </span>
            <div className="flex gap-2">
              {!d.is_demo && <Button size="sm" variant="ghost" onClick={retry} loading={busy === "retry"}>{busy !== "retry" && <RotateCcw />}Run again</Button>}
              <Button size="sm" variant="ghost" onClick={remove} loading={busy === "delete"}>{busy !== "delete" && <Trash2 />}Delete</Button>
            </div>
          </div>
          <SourcesDialog discoveryId={d.id} open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
        </>
      )}
    </PageContainer>
  );
}

export function DiscoverySkeleton() {
  return (
    <PageContainer>
      <Skeleton className="mb-6 h-4 w-28" />
      <Skeleton className="mb-2 h-5 w-64" />
      <Skeleton className="mb-8 h-8 w-80" />
      <Skeleton className="mb-6 h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}
      </div>
    </PageContainer>
  );
}
