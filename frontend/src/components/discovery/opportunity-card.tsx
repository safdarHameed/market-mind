import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/ui/score";
import type { OpportunityCard as Opp } from "@/lib/types";
import { plural } from "@/lib/utils";

/** Compact opportunity card (Saved / Watchlist) — same look as the results cards. */
export function OpportunityCard({ opp, footer }: { opp: Opp; rank?: number; selectable?: boolean; selected?: boolean; onSelect?: () => void; footer?: React.ReactNode }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold leading-snug tracking-tight">
            <Link href={`/opportunities/${opp.id}`} className="hover:text-primary">{opp.title}</Link>
          </h2>
          <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted">{opp.summary}</p>
          <p className="mt-3 text-sm text-subtle">
            {opp.location_label} · {plural(opp.supporting_count, "source")} back this up
          </p>
        </div>
        <ScoreRing score={opp.score} confidence={opp.confidence} size={56} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
        <Link href={`/opportunities/${opp.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          View details <ArrowRight className="size-4" />
        </Link>
        {footer && <div className="ml-auto flex min-w-0 flex-1 justify-end">{footer}</div>}
      </div>
    </article>
  );
}

export function OpportunityCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-5 w-4/5" />
        </div>
        <div className="skeleton size-14 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-3.5 w-full" />
        <div className="skeleton h-3.5 w-11/12" />
        <div className="skeleton h-3.5 w-2/3" />
      </div>
    </Card>
  );
}
