"use client";

import { ArrowDownRight, ArrowUpRight, Bookmark, BookmarkX, Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { OpportunityCard, OpportunityCardSkeleton } from "@/components/discovery/opportunity-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/overlay";
import { Alert, EmptyState } from "@/components/ui/primitives";
import { api, useApi } from "@/lib/api";
import type { OpportunityCard as Opp } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type SavedItem = { saved_at: string; score_at_save: number | null; conversation_count: number; opportunity: Opp };
type WatchItem = { added_at: string; score_at_add: number | null; current_score: number | null; note: string | null; opportunity: Opp };

/** Same rule as the results page: two per row on large screens, full width when there's only one. */
function Grid({ children }: { children: React.ReactNode }) {
  const many = React.Children.count(children) > 1;
  return <div className={`grid gap-5 ${many ? "xl:grid-cols-2" : ""}`}>{children}</div>;
}

function LoadingGrid() {
  return <Grid>{[0, 1, 2, 3].map((i) => <OpportunityCardSkeleton key={i} />)}</Grid>;
}

/** Saved opportunities (shown as a tab on the home screen). */
export function SavedList() {
  const toast = useToast();
  const { data, loading, error, setData } = useApi<{ items: SavedItem[] }>("/saved");
  const remove = async (id: string) => {
    const prev = data;
    setData({ items: (data?.items ?? []).filter((x) => x.opportunity.id !== id) });
    try {
      await api(`/saved/${id}`, { method: "DELETE" });
      toast({ title: "Removed from Saved", tone: "success" });
    } catch (e) {
      setData(prev);
      toast({ title: "Couldn't remove", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    }
  };
  return (
    <>
      {error ? (
        <Alert tone="danger" title="Couldn't load saved opportunities">{error.message}</Alert>
      ) : loading && !data ? (
        <LoadingGrid />
      ) : !data?.items.length ? (
        <EmptyState icon={<Bookmark />} title="Nothing saved yet" description="Tap the bookmark on any report to keep it here." />
      ) : (
        <Grid>
          {data.items.map((it) => (
            <OpportunityCard
              key={it.opportunity.id}
              opp={it.opportunity}
              footer={
                <div className="flex items-center gap-3 text-sm text-subtle">
                  <span>Saved {formatDate(it.saved_at)}</span>
                  <Button size="sm" variant="ghost" onClick={() => remove(it.opportunity.id)} aria-label={`Remove ${it.opportunity.title} from saved`}>
                    <BookmarkX /> Remove
                  </Button>
                </div>
              }
            />
          ))}
        </Grid>
      )}
    </>
  );
}

/** Watched opportunities (shown as a tab on the home screen). */
export function WatchList() {
  const toast = useToast();
  const { data, loading, error, setData } = useApi<{ items: WatchItem[] }>("/watchlist");
  const remove = async (id: string) => {
    const prev = data;
    setData({ items: (data?.items ?? []).filter((x) => x.opportunity.id !== id) });
    try {
      await api(`/watchlist/${id}`, { method: "DELETE" });
    } catch (e) {
      setData(prev);
      toast({ title: "Couldn't remove", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    }
  };
  return (
    <>
      {error ? (
        <Alert tone="danger" title="Couldn't load your watchlist">{error.message}</Alert>
      ) : loading && !data ? (
        <LoadingGrid />
      ) : !data?.items.length ? (
        <EmptyState icon={<Eye />} title="Not watching anything yet" description="Tap the eye on any report to follow it. Score changes after you update a report show here." />
      ) : (
        <Grid>
          {data.items.map((it) => {
            const delta = it.current_score != null && it.score_at_add != null ? it.current_score - it.score_at_add : 0;
            return (
              <OpportunityCard
                key={it.opportunity.id}
                opp={it.opportunity}
                footer={
                  <div className="flex items-center gap-3 text-sm text-subtle">
                    {delta !== 0 && (
                      <span className={`inline-flex items-center gap-1 tabular-nums ${delta > 0 ? "text-success" : "text-danger"}`} title="Score change since you started watching">
                        {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {it.score_at_add} → {it.current_score}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(it.opportunity.id)} aria-label={`Stop watching ${it.opportunity.title}`}>
                      <EyeOff /> Unwatch
                    </Button>
                  </div>
                }
              />
            );
          })}
        </Grid>
      )}
    </>
  );
}
