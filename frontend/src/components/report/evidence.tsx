"use client";

import { CalendarDays, Download, ExternalLink, Sparkle } from "lucide-react";
import * as React from "react";

import { ButtonLink } from "@/components/ui/button";
import type { Source } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export type SourceIndex = Map<string, Source & { ref: string }>;

export function scrollToSource(id: string) {
  const el = document.getElementById(`src-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-[var(--ring)]");
  setTimeout(() => el.classList.remove("ring-2", "ring-[var(--ring)]"), 1600);
}

/** Inline [S#] chip that jumps to the source card. */
export function SourceChip({ source, isNew, href }: { source: Source & { ref?: string }; isNew?: boolean; href?: string }) {
  const cls = cn(
    "mx-0.5 inline-flex translate-y-[-1px] items-center gap-0.5 rounded-md px-1.5 py-px align-middle font-mono text-[11px] font-medium transition-colors",
    isNew ? "bg-success-soft text-success hover:bg-success/20" : "bg-accent-soft text-accent hover:bg-accent/20",
  );
  const title = `${source.title} — ${source.domain}${isNew ? " (newly retrieved)" : ""}`;
  const body = (
    <>
      {source.ref ?? "S"}
      {isNew && <Sparkle className="size-2.5" />}
    </>
  );
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={cls}>
        {body}
      </a>
    );
  return (
    <button type="button" onClick={() => scrollToSource(source.id)} title={title} className={cls}>
      {body}
    </button>
  );
}

export function SourceChips({ ids, index, className }: { ids: string[]; index: SourceIndex; className?: string }) {
  const srcs = ids.map((i) => index.get(i)).filter(Boolean) as (Source & { ref: string })[];
  if (!srcs.length)
    return (
      <span className={cn("ml-1 rounded bg-surface-3 px-1.5 py-px text-[11px] text-muted", className)} title="The AI's own reasoning — not taken from a specific source">
        AI’s view
      </span>
    );
  return (
    <span className={className}>
      {srcs.map((s) => (
        <SourceChip key={s.id} source={s} isNew={s.origin !== "discovery"} href={s.verification_status !== "sample" ? s.url : undefined} />
      ))}
    </span>
  );
}

export function SourceFooter({ source: s, sample }: { source: Source; sample?: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="line-clamp-2 text-sm font-medium">{s.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {s.publisher && s.publisher !== s.domain && <span>{s.publisher}</span>}
          <span className="font-mono">{s.domain}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            {s.published_at ? `Published ${formatDate(s.published_at)}` : "Publication date not available"}
          </span>
          {s.retrieved_at && (
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" />
              Retrieved {formatDate(s.retrieved_at)}
            </span>
          )}
        </div>
        {s.verification_note && s.verification_status !== "verified" && <p className="mt-1 text-[11px] text-subtle">{s.verification_note}</p>}
      </div>
      {sample ? (
        <span className="text-xs text-subtle">Sample source · no link</span>
      ) : (
        <ButtonLink href={s.url} external variant="secondary" size="sm" className="shrink-0">
          Open original source <ExternalLink />
        </ButtonLink>
      )}
    </div>
  );
}
