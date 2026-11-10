"use client";

import { ArrowLeft, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ConfidenceBadge, DimensionBar, EvidenceStrength, ScoreRing } from "@/components/ui/score";
import { useApi } from "@/lib/api";
import type { OpportunityCard, OpportunityReport, ScoreDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = OpportunityCard & {
  score_detail: ScoreDetail | null;
  risks: OpportunityReport["risks"];
  existing_alternatives: OpportunityReport["existing_alternatives"];
  problem: OpportunityReport["problem"];
};

const ROWS = ["demand", "competition", "feasibility", "evidence_quality", "market_gap", "problem_severity", "growth_momentum"];

export function CompareView() {
  const params = useSearchParams();
  const ids = params.get("ids") ?? "";
  const { data, error, loading } = useApi<{ items: Item[] }>(ids ? `/opportunities/compare?ids=${encodeURIComponent(ids)}` : null);

  if (!ids || ids.split(",").length < 2)
    return (
      <PageContainer>
        <EmptyState icon={<GitCompareArrows />} title="Pick opportunities to compare" description="On any discovery results page, select 2–3 opportunity cards and press Compare."
          action={<ButtonLink href="/discover" variant="secondary">Go to Discover</ButtonLink>} />
      </PageContainer>
    );

  const items = data?.items ?? [];
  const best = (key: string) => {
    const vals = items.map((i) => i.score_detail?.dimensions.find((d) => d.key === key)?.score ?? -1);
    const max = Math.max(...vals);
    return vals.map((v) => v === max && max >= 0 && vals.filter((x) => x === max).length === 1);
  };

  return (
    <PageContainer>
      <button onClick={() => history.back()} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Back
      </button>
      <PageHeader title="Compare opportunities" description="Side by side on the same evidence-based dimensions. Higher competition score = less crowded." />
      {error && <Alert tone="danger" title="Couldn't load comparison">{error.message}</Alert>}
      {loading && !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[720px] gap-4" style={{ gridTemplateColumns: `160px repeat(${items.length}, minmax(0, 1fr))` }}>
            <div />
            {items.map((it) => (
              <Card key={it.id} className="p-4">
                <div className="flex items-start gap-3">
                  <ScoreRing score={it.score} confidence={it.confidence} size={48} stroke={4} />
                  <Link href={`/opportunities/${it.id}`} className="text-sm font-semibold leading-snug hover:text-primary">{it.title}</Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <ConfidenceBadge confidence={it.confidence} />
                </div>
              </Card>
            ))}

            <RowLabel>Evidence</RowLabel>
            {items.map((it) => (
              <Cell key={it.id}>
                <EvidenceStrength value={it.evidence_strength} />
                <div className="mt-1 text-xs text-muted">{it.supporting_count} supporting · {it.contradicting_count} contradicting</div>
              </Cell>
            ))}

            {ROWS.map((key) => {
              const label = items[0]?.score_detail?.dimensions.find((d) => d.key === key)?.label ?? key;
              const wins = best(key);
              return [
                <RowLabel key={`${key}-l`}>{label}</RowLabel>,
                ...items.map((it, i) => {
                  const d = it.score_detail?.dimensions.find((x) => x.key === key);
                  return (
                    <Cell key={`${key}-${it.id}`} highlight={wins[i]}>
                      <div className="mb-1.5 flex justify-between text-xs"><span className="tabular-nums font-medium">{d?.score ?? "–"}/10</span></div>
                      <DimensionBar value={d?.score ?? null} />
                      {d?.rationale && <p className="mt-2 line-clamp-3 text-xs text-muted" title={d.rationale}>{d.rationale}</p>}
                    </Cell>
                  );
                }),
              ];
            })}

            <RowLabel>Top risks</RowLabel>
            {items.map((it) => (
              <Cell key={it.id}>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                  {it.risks.slice(0, 3).map((r) => <li key={r.risk}>{r.risk}</li>)}
                </ul>
              </Cell>
            ))}

            <RowLabel>Existing solutions</RowLabel>
            {items.map((it) => (
              <Cell key={it.id}>
                <p className="text-xs text-muted">{it.existing_alternatives.length ? it.existing_alternatives.map((a) => a.name).join(", ") : "None named in sources"}</p>
              </Cell>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <div className="self-center text-xs font-semibold uppercase tracking-wide text-subtle">{children}</div>;
}

function Cell({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return <div className={cn("rounded-xl border border-border p-3", highlight && "border-success/40 bg-success-soft")}>{children}</div>;
}
