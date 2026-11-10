"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Puzzle,
  Quote,
  Store,
  TrendingUp,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/primitives";
import type { Evidence, GroundedPoint, OpportunityReport } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

import { SourceChips, SourceFooter, type SourceIndex } from "./evidence";
import { ScorePanel } from "./score-panel";

export type AskFn = (question: string) => void;

type Tab = "overview" | "evidence" | "score" | "sources";

/** The report, as four simple tabs: Overview · Evidence · Score · Sources. */
export function ReportTabs({
  report: r,
  index,
  onAsk,
  onReassess,
  reassessing,
}: {
  report: OpportunityReport;
  index: SourceIndex;
  onAsk?: AskFn;
  onReassess?: () => void;
  reassessing?: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "evidence", label: "Evidence", count: r.evidence.length },
    { id: "score", label: "Score" },
    { id: "sources", label: "Sources", count: r.sources.length },
  ];
  return (
    <div>
      <div role="tablist" aria-label="Report sections" className="sticky top-14 z-10 -mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-border bg-bg/90 px-1 backdrop-blur md:top-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-subtle">{t.count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "overview" && <Overview r={r} index={index} />}
        {tab === "evidence" && <EvidenceTab evidence={r.evidence} onAsk={onAsk} />}
        {tab === "score" && <div className="max-w-2xl"><ScorePanel report={r} onReassess={onReassess} reassessing={reassessing} /></div>}
        {tab === "sources" && <SourcesTab r={r} />}
      </div>
    </div>
  );
}

/* ---------------- Overview ---------------- */
/* Colour = meaning: grey problem · green why it's promising · blue what to build · amber watch out. */

const TONES = {
  neutral: { box: "border-border bg-surface", icon: "bg-surface-2 text-muted" },
  green: { box: "border-success/20 bg-success-soft", icon: "bg-success/15 text-success" },
  blue: { box: "border-primary/20 bg-primary-soft", icon: "bg-primary/15 text-primary" },
  amber: { box: "border-warning/25 bg-warning-soft", icon: "bg-warning/15 text-warning" },
} as const;

function Block({ icon: Icon, title, tone, className, children }: { icon: React.ElementType; title: string; tone: keyof typeof TONES; className?: string; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <section className={cn("h-full rounded-2xl border p-5 sm:p-6", t.box, className)}>
      <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold">
        <span className={cn("grid size-7 place-items-center rounded-lg", t.icon)}><Icon className="size-4" /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Overview({ r, index, expanded }: { r: OpportunityReport; index: SourceIndex; onSeeEvidence?: () => void; expanded?: boolean }) {
  const why: GroundedPoint[] = [...r.evidence_connections, ...r.why_now].slice(0, 4);
  const risks = [...r.risks].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const steps = r.validation_steps.length ? r.validation_steps : r.unknowns.map((u) => u.how_to_validate);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Block icon={Puzzle} title="The problem" tone="neutral" className="lg:col-span-2">
        <p className="text-[15px] leading-relaxed">{r.problem.what}</p>
        <p className="mt-2 text-sm text-muted">Affects: {r.problem.who}</p>
      </Block>

      {why.length > 0 && (
        <Block icon={TrendingUp} title="Why it’s promising" tone="green">
          <ul className="space-y-2.5">
            {why.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-success" />
                <span>
                  {p.point}
                  <SourceChips ids={p.source_ids} index={index} className="ml-1" />
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block icon={Lightbulb} title="What you could build" tone="blue">
        <div className="space-y-2">
          {r.solutions.map((s) => <SolutionItem key={s.name} s={s} defaultOpen={expanded} />)}
        </div>
      </Block>

      <Block icon={AlertTriangle} title="Watch out" tone="amber">
        <ul className="space-y-2.5">
          {risks.map((k, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
              <AlertTriangle className="mt-1 size-4 shrink-0 text-warning" />
              <span>
                {k.risk}
                {k.source_ids.length > 0 && <SourceChips ids={k.source_ids} index={index} className="ml-1" />}
              </span>
            </li>
          ))}
          {r.existing_alternatives.map((a) => (
            <li key={a.name} className="flex gap-2.5 text-[15px] leading-relaxed">
              <Store className="mt-1 size-4 shrink-0 text-warning" />
              <span>
                Already exists: <span className="font-medium">{a.name}</span>
                <SourceChips ids={a.source_ids} index={index} className="ml-1" />
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {steps.length > 0 && (
        <Block icon={ListChecks} title="Next steps" tone="neutral">
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Block>
      )}
    </div>
  );
}

function SolutionItem({ s, defaultOpen }: { s: OpportunityReport["solutions"][number]; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className="rounded-xl bg-surface">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="flex-1">
          <span className="block font-medium">{s.name}</span>
          <span className="block text-sm text-muted">{s.what_it_does}</span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <dl className="grid gap-3 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
          <Detail label="For" value={s.who_uses_it} />
          <Detail label="Makes money by" value={s.revenue_model} />
          <Detail label="Why they’d want it" value={s.value_proposition} />
          <Detail label="Start with" value={s.mvp} />
        </dl>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

/* ---------------- Evidence ---------------- */

const GROUPS: { stance: Evidence["stance"]; title: string; icon: React.ElementType; color: string }[] = [
  { stance: "supporting", title: "For", icon: CheckCircle2, color: "text-success" },
  { stance: "contradicting", title: "Against", icon: XCircle, color: "text-danger" },
  { stance: "competitor", title: "Existing products", icon: Store, color: "text-warning" },
  { stance: "context", title: "Background", icon: CircleHelp, color: "text-subtle" },
];

function EvidenceTab({ evidence, onAsk }: { evidence: Evidence[]; index?: SourceIndex; onAsk?: AskFn }) {
  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const items = evidence.filter((e) => e.stance === g.stance);
        if (!items.length && g.stance !== "contradicting") return null;
        return (
          <section key={g.stance}>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <g.icon className={cn("size-4", g.color)} /> {g.title}
              <span className="font-normal text-subtle">{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted">No sources argued against this.</p>
            ) : (
              <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {items.map((ev) => <EvidenceItem key={ev.id} ev={ev} onAsk={onAsk} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EvidenceItem({ ev, onAsk }: { ev: Evidence; onAsk?: AskFn }) {
  const [open, setOpen] = React.useState(false);
  const s = ev.source;
  const sample = s.verification_status === "sample";
  const says = ev.finding?.statement ?? ev.claim_supported;
  return (
    <article className="px-5 py-4">
      <p className="text-[15px] leading-relaxed">{says}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {sample ? (
          <span className="text-subtle">{s.domain}</span>
        ) : (
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-primary">
            {s.domain} <ExternalLink className="size-3.5" />
          </a>
        )}
        <button onClick={() => setOpen((o) => !o)} className="text-muted hover:text-text" aria-expanded={open}>
          {open ? "Less" : "More"}
        </button>
        {onAsk && !sample && (
          <button
            onClick={() => onAsk(`Tell me more about this evidence from ${s.domain}: “${says}”. How reliable is it, and what does it mean for this opportunity?`)}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <MessageCircleQuestion className="size-3.5" /> Ask AI
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
          {ev.finding?.quote && (
            <p className="flex gap-2 italic"><Quote className="mt-0.5 size-3.5 shrink-0" /> “{ev.finding.quote}”</p>
          )}
          <p>{ev.relevance}</p>
          <p className="text-xs text-subtle">
            {s.title}
            {s.published_at && ` · ${formatDate(s.published_at)}`}
            {s.verification_status === "snippet_only" && " · page couldn’t be read, summary only"}
          </p>
        </div>
      )}
    </article>
  );
}

/* ---------------- Sources ---------------- */

function SourcesTab({ r }: { r: OpportunityReport }) {
  const stats = r.discovery.stats;
  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Every source used in this report.
        {stats.unique_urls ? ` We looked at ${stats.unique_urls} pages in total; duplicates and unreadable pages were left out.` : ""}
      </p>
      <div className="space-y-2">
        {r.sources.map((s) => (
          <div key={s.id} id={`src-${s.id}`} className="rounded-xl border border-border p-4 transition-shadow">
            <div className="mb-2 flex items-center gap-1.5">
              <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium", s.origin === "discovery" ? "bg-primary-soft text-primary" : "bg-success-soft text-success")}>{s.ref}</span>
              {s.origin !== "discovery" && <Badge tone="success">Found during chat</Badge>}
            </div>
            <SourceFooter source={s} sample={s.verification_status === "sample"} />
          </div>
        ))}
      </div>
    </div>
  );
}
