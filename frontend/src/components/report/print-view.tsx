"use client";

import { CheckCircle2, CircleHelp, Printer, Store, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import * as React from "react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/ui/score";
import { useApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { Evidence, OpportunityReport } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

import { Overview } from "./report-body";
import { useSourceIndex } from "./report-view";

const GROUPS: { stance: Evidence["stance"]; title: string; icon: React.ElementType; color: string }[] = [
  { stance: "supporting", title: "For", icon: CheckCircle2, color: "text-success" },
  { stance: "contradicting", title: "Against", icon: XCircle, color: "text-danger" },
  { stance: "competitor", title: "Existing products", icon: Store, color: "text-warning" },
  { stance: "context", title: "Background", icon: CircleHelp, color: "text-subtle" },
];

/** Print / PDF route for a report the user owns (/print/:id). */
export function PrintOwnReport() {
  const { id } = useParams<{ id: string }>();
  return <PrintLoader path={`/opportunities/${id}`} />;
}

/** Print / PDF route for a shared report (/print/s/:token). */
export function PrintSharedReport() {
  const { token } = useParams<{ token: string }>();
  return <PrintLoader path={`/share/${token}`} />;
}

function PrintLoader({ path }: { path: string }) {
  const { data, error } = useApi<OpportunityReport>(path);
  const printed = React.useRef(false);

  // Paper is white: always print with the light theme (this tab only; saved preference is untouched).
  React.useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  // Open the print dialog once the full report has rendered.
  React.useEffect(() => {
    if (!data || printed.current) return;
    const t = setTimeout(() => {
      printed.current = true; // mark only when we actually print (effects may run twice in dev)
      window.print();
    }, 600);
    return () => clearTimeout(t);
  }, [data]);

  if (error) return <div className="p-10"><EmptyState icon={<Printer />} title="This report isn’t available" description={error.message} /></div>;
  if (!data) return <div className="mx-auto max-w-3xl space-y-4 p-10"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></div>;
  return <PrintReport r={data} />;
}

/** The whole report on one page, laid out for paper: every section, all evidence, full source links. */
function PrintReport({ r }: { r: OpportunityReport }) {
  const index = useSourceIndex(r);
  const refOf = new Map(r.sources.map((s) => [s.id, s.ref]));
  return (
    <div className="print-report mx-auto max-w-3xl bg-bg px-8 py-10 text-text print:max-w-none print:bg-white print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <p className="text-sm text-muted">Use “Save as PDF” in the print dialog to download this report.</p>
        <Button size="sm" onClick={() => window.print()}><Printer /> Print / Save PDF</Button>
      </div>

      <header className="avoid-break mb-8">
        <div className="mb-6 flex items-center justify-between text-sm text-muted">
          <span className="flex items-center gap-2 font-semibold text-text"><LogoMark size={22} /> {BRAND.name}</span>
          <span>Opportunity report · {formatDate(r.discovery.completed_at ?? r.discovery.created_at)}</span>
        </div>
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-subtle">{r.industry} · {r.location_label}</p>
            <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">{r.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{r.plain_summary || r.summary}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreRing score={r.score} confidence={r.confidence} size={64} />
            <span className="text-xs text-subtle">Score</span>
          </div>
        </div>
        <p className="mt-4 text-sm">
          <span className="text-success">{r.supporting_count} sources for</span> · <span className={r.contradicting_count ? "text-danger" : "text-muted"}>{r.contradicting_count} against</span>
        </p>
      </header>

      <section className="mb-10">
        <Overview r={r} index={index} expanded />
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Evidence</h2>
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = r.evidence.filter((e) => e.stance === g.stance);
            if (!items.length) return null;
            return (
              <div key={g.stance}>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <g.icon className={cn("size-4", g.color)} /> {g.title}
                </h3>
                <ol className="space-y-3">
                  {items.map((ev) => (
                    <li key={ev.id} className="avoid-break rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                      <p className="text-[14px] leading-relaxed">{ev.finding?.statement ?? ev.claim_supported}</p>
                      {ev.finding?.quote && <p className="mt-2 italic text-muted">“{ev.finding.quote}”</p>}
                      <p className="mt-2 text-muted">{ev.relevance}</p>
                      <p className="mt-2 text-xs text-subtle">
                        [{refOf.get(ev.source.id) ?? "S"}] {ev.source.domain}
                        {ev.source.published_at && ` · ${formatDate(ev.source.published_at)}`}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </section>

      <section className="avoid-break">
        <h2 className="mb-3 text-lg font-semibold">Sources</h2>
        <ol className="space-y-2 text-sm">
          {r.sources.map((s) => (
            <li key={s.id} className="avoid-break">
              <span className="font-medium">[{s.ref}] {s.title}</span>
              <span className="block text-xs text-muted">
                <span className="break-all">{s.verification_status === "sample" ? "Sample source (not real)" : s.url}</span>
                {s.published_at && ` · published ${formatDate(s.published_at)}`}
                {s.retrieved_at && ` · checked ${formatDate(s.retrieved_at)}`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-subtle">
        Made with {BRAND.name} from public sources. The score is a guide, not a promise of success — check the sources before deciding.
      </footer>
    </div>
  );
}
