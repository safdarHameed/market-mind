"use client";

import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Link2Off,
  MessageCircleQuestion,
  Printer,
  SearchX,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/layout/app-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, useToast } from "@/components/ui/overlay";
import { Alert, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/ui/score";
import { api, useApi } from "@/lib/api";
import type { OpportunityReport, ScoreDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

import { DebatePanel } from "./debate-panel";
import type { SourceIndex } from "./evidence";
import { ReportTabs } from "./report-body";

export function useSourceIndex(report: OpportunityReport | undefined): SourceIndex {
  return React.useMemo(() => new Map((report?.sources ?? []).map((s) => [s.id, s])), [report]);
}

const CONFIDENCE_TEXT = { high: "Very sure", moderate: "Fairly sure", low: "Not sure yet" } as const;

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const toast = useToast();
  const { data: r, error, refresh, setData } = useApi<OpportunityReport>(`/opportunities/${id}`);
  const index = useSourceIndex(r);
  const [debateOpen, setDebateOpen] = React.useState(params.get("ask") === "1");
  const [askPrompt, setAskPrompt] = React.useState<{ text: string; id: number } | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [reassessing, setReassessing] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "save" | "watch">(null);

  if (error)
    return (
      <PageContainer>
        <EmptyState icon={<SearchX />} title={error.status === 404 ? "Opportunity not found" : "Couldn't load this report"} description={error.message}
          action={<ButtonLink href="/discover" variant="secondary">Back to Discover</ButtonLink>} />
      </PageContainer>
    );
  if (!r) return <ReportSkeleton />;

  const isDemo = r.discovery.is_demo;
  const sc = r.score_detail;

  const ask = (text: string) => {
    setAskPrompt({ text, id: Date.now() });
    setDebateOpen(true);
  };

  const toggle = async (kind: "save" | "watch") => {
    setBusy(kind);
    const on = kind === "save" ? r.is_saved : r.is_watched;
    try {
      await api(`/${kind === "save" ? "saved" : "watchlist"}/${r.id}`, { method: on ? "DELETE" : "PUT" });
      setData({ ...r, ...(kind === "save" ? { is_saved: !on } : { is_watched: !on }) });
      toast({
        title: kind === "save" ? (on ? "Removed from Saved" : "Saved") : on ? "Removed from Watchlist" : "Added to Watchlist",
        tone: "success",
      });
    } catch (e) {
      toast({ title: "Something went wrong", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const reassess = async () => {
    setReassessing(true);
    try {
      const res = await api<{ score: ScoreDetail }>(`/opportunities/${r.id}/reassess`, { method: "POST" });
      const prev = r.score_detail?.overall;
      await refresh();
      toast({
        title: `Score updated: ${prev ?? "–"} → ${res.score.overall}`,
        description: res.score.change_summary ?? undefined,
        tone: "success",
      });
    } catch (e) {
      toast({ title: "Couldn't update the score", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setReassessing(false);
    }
  };

  return (
    <PageContainer>
      <Link href={r.discovery.id ? `/discover/${r.discovery.id}` : "/discover"} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text" data-print-hide>
        <ArrowLeft className="size-4" /> Back to results
      </Link>

      {isDemo && (
        <Alert tone="warning" icon={<FlaskConical />} className="mb-6" title="Sample data — not real research">
          Everything on this page is illustrative. Sources are placeholders and can’t be opened.
        </Alert>
      )}

      <header className="mb-8">
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{r.title}</h1>
            <p className="mt-3 max-w-4xl text-[16px] leading-relaxed text-muted">{r.plain_summary || r.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
            <ScoreRing score={r.score} confidence={r.confidence} size={64} />
            <span className="text-xs text-subtle" title={sc ? CONFIDENCE_TEXT[sc.confidence] : undefined}>Score</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2" data-print-hide>
          {!isDemo && (
            <Button onClick={() => setDebateOpen(true)}>
              <MessageCircleQuestion /> Ask AI
            </Button>
          )}
          <IconAction label={r.is_saved ? "Saved" : "Save"} active={!!r.is_saved} loading={busy === "save"} onClick={() => toggle("save")}>
            {r.is_saved ? <BookmarkCheck /> : <Bookmark />}
          </IconAction>
          <IconAction label={r.is_watched ? "Watching" : "Watch"} active={!!r.is_watched} loading={busy === "watch"} onClick={() => toggle("watch")}>
            {r.is_watched ? <EyeOff /> : <Eye />}
          </IconAction>
          {!isDemo && (
            <IconAction label="Share" onClick={() => setShareOpen(true)}>
              <Share2 />
            </IconAction>
          )}
          <span className="ml-auto text-sm text-muted">
            <span className="text-success">{r.supporting_count} for</span> · <span className={r.contradicting_count ? "text-danger" : ""}>{r.contradicting_count} against</span>
          </span>
        </div>
      </header>

      <ReportTabs report={r} index={index} onAsk={isDemo ? undefined : ask} onReassess={isDemo ? undefined : reassess} reassessing={reassessing} />

      {r.siblings && r.siblings.length > 0 && (
        <div className="mt-14 border-t border-border pt-8" data-print-hide>
          <h2 className="mb-3 text-sm font-semibold">Other opportunities from this search</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {r.siblings.map((x) => (
              <Link key={x.id} href={`/opportunities/${x.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm hover:border-border-strong">
                <span className="line-clamp-1">{x.title}</span>
                <span className="shrink-0 tabular-nums text-subtle">{x.score}/100</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!isDemo && (
        <button
          onClick={() => setDebateOpen(true)}
          className={cn("fixed bottom-20 right-4 z-20 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-fg shadow-pop md:hidden", debateOpen && "hidden")}
          data-print-hide
        >
          <MessageCircleQuestion className="size-4" /> Ask AI
        </button>
      )}

      <DebatePanel
        open={debateOpen}
        onClose={() => setDebateOpen(false)}
        report={r}
        index={index}
        onNewEvidence={() => refresh()}
        onReassess={reassess}
        reassessing={reassessing}
        initialPrompt={askPrompt}
      />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} report={r} onChange={(token) => setData({ ...r, share_token: token })} />
    </PageContainer>
  );
}

function IconAction({ label, active, loading, onClick, children }: { label: string; active?: boolean; loading?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="secondary" size="icon" onClick={onClick} loading={loading} aria-pressed={active} aria-label={label} title={label} className={cn("size-10", active && "text-primary")}>
      {!loading && children}
    </Button>
  );
}

function ShareDialog({ open, onClose, report, onChange }: { open: boolean; onClose: () => void; report: OpportunityReport; onChange: (t: string | null) => void }) {
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const url = report.share_token && typeof window !== "undefined" ? `${window.location.origin}/share/${report.share_token}` : null;

  const create = async () => {
    setLoading(true);
    try {
      const r = await api<{ token: string }>(`/opportunities/${report.id}/share`, { method: "POST" });
      onChange(r.token);
    } catch (e) {
      toast({ title: "Couldn't create link", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setLoading(false);
    }
  };
  const revoke = async () => {
    setLoading(true);
    try {
      await api(`/opportunities/${report.id}/share`, { method: "DELETE" });
      onChange(null);
    } finally {
      setLoading(false);
    }
  };
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Share this report" description="A read-only page with the findings, score and all source links. Your debates stay private.">
      {url ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input readOnly value={url} className="h-10 flex-1 rounded-lg border border-border bg-surface-2 px-3 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Share link" />
            <Button onClick={copy} variant="secondary">{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={revoke} loading={loading}>{!loading && <Link2Off />}Disable link</Button>
            <div className="flex gap-2">
              <ButtonLink href={`/share/${report.share_token}`} external variant="secondary">Open</ButtonLink>
              <ButtonLink href={`/print/${report.id}`} external variant="secondary"><Printer />Save as PDF</ButtonLink>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Anyone with the link will be able to view this report. You can disable it at any time.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} loading={loading}>{!loading && <Share2 />}Create share link</Button>
            <ButtonLink href={`/print/${report.id}`} external variant="secondary"><Printer />Save as PDF</ButtonLink>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function ReportSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="mb-6 h-4 w-48" />
      <Skeleton className="mb-3 h-5 w-56" />
      <Skeleton className="mb-4 h-9 w-3/4" />
      <Skeleton className="mb-8 h-12 w-96" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    </PageContainer>
  );
}
