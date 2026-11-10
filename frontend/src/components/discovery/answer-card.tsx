import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score";
import type { OpportunityAnswer } from "@/lib/types";

/**
 * One opportunity as a direct answer. Meaning is carried by colour + icon, not labels:
 * green ✓ = what sources say in favour · amber ⚠ = the main risk.
 */
export function AnswerCard({ o, index }: { o: OpportunityAnswer; index: number }) {
  const proof = o.top_evidence.slice(0, 2);
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-subtle">#{index + 1}</div>
          <h2 className="mt-1 text-xl font-semibold leading-snug tracking-tight">
            <Link href={`/opportunities/${o.id}`} className="hover:text-primary">{o.title}</Link>
          </h2>
          <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted">{o.plain_summary || o.summary}</p>
        </div>
        <ScoreRing score={o.score} confidence={o.confidence} size={56} />
      </div>

      <ul className="mt-5 space-y-2">
        {proof.map((e, i) => (
          <li key={i} className="flex items-start gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm leading-relaxed">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2">{e.claim}</span>
              {!e.is_sample && (
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-muted hover:text-primary">
                  {e.domain} <ArrowUpRight className="size-3" />
                </a>
              )}
            </span>
          </li>
        ))}
        {o.main_risk && (
          <li className="flex items-start gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm leading-relaxed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span className="line-clamp-2">{o.main_risk}</span>
          </li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <ButtonLink href={`/opportunities/${o.id}`} size="sm">
          View details <ArrowRight />
        </ButtonLink>
        {!o.is_demo && (
          <ButtonLink href={`/opportunities/${o.id}?ask=1`} size="sm" variant="ghost">
            <MessageCircleQuestion /> Ask AI
          </ButtonLink>
        )}
      </div>
    </article>
  );
}
