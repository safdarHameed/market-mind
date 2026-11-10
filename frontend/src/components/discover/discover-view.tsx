"use client";

import { Bookmark, Eye, FileCheck2, History, KeyRound, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";

import { SavedList, WatchList } from "@/components/library/library-views";
import { useApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { AppConfig, Me } from "@/lib/types";
import { cn } from "@/lib/utils";

import { useDemo } from "./config-banner";
import { DiscoverForm } from "./discover-form";
import { RecentDiscoveries } from "./history";

const STEPS = [
  { icon: Search, title: "We search public sources", text: "News, reports, forums and reviews." },
  { icon: Sparkles, title: "AI connects the evidence", text: "Facts are grouped into clear patterns." },
  { icon: FileCheck2, title: "You get proof, not guesses", text: "Every opportunity links to its sources." },
];

type Tab = "recent" | "saved" | "watching";

const noop = () => () => {};
function useGreeting() {
  // Client-only (time of day); the server renders a neutral fallback.
  return useSyncExternalStore(
    noop,
    () => {
      const h = new Date().getHours();
      return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    },
    () => "Welcome",
  );
}

/** Home: discover on top, your library (Recent · Saved · Watching) below. */
export function DiscoverView() {
  const { data: config, error } = useApi<AppConfig>("/config");
  const { data: me } = useApi<Me>("/me");
  const demo = useDemo();
  const greeting = useGreeting();
  const initialQuery = useSearchParams().get("q") ?? "";
  const [setupPrompt, setSetupPrompt] = useState(false);
  const setupRef = useRef<HTMLDivElement>(null);
  const needsSetup = config && !config.research_ready;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 md:pb-14 md:pt-14 lg:px-10">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-medium text-primary">
              {greeting}
              {me?.display_name ? `, ${me.display_name}` : ""}
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-[42px]">
              What do you want to <span className="text-brand">discover?</span>
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] text-muted">
              Describe an idea, a place or an industry. {BRAND.name} finds opportunities and shows the sources.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl">
            {error && (
              <p className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                Can’t reach the server. Start the backend and refresh.
              </p>
            )}
            {(needsSetup || setupPrompt) && config && !config.research_ready && (
              <div
                ref={setupRef}
                role="alert"
                className={cn(
                  "mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm",
                  setupPrompt ? "border-warning/50 bg-warning-soft" : "border-primary/20 bg-surface/80",
                )}
              >
                <KeyRound className={cn("size-4", setupPrompt ? "text-warning" : "text-primary")} />
                <span className="min-w-[12rem] flex-1">
                  {config.llm_configured ? (
                    <>
                      <span className="font-medium">{config.llm_provider?.split(" (")[0]} is connected</span>, but research also needs web
                      search. Add a search key in Settings.
                    </>
                  ) : (
                    <><span className="font-medium">No AI connected yet.</span> Add your AI provider and key in Settings to start.</>
                  )}
                </span>
                <Link href="/settings" className="bg-brand rounded-lg px-3 py-1.5 font-medium text-white">Open settings</Link>
                <button onClick={demo.open} disabled={demo.loading} className="text-muted hover:text-text disabled:opacity-50">
                  or view a sample
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-surface/90 p-5 shadow-pop backdrop-blur sm:p-7">
              <DiscoverForm
                key={initialQuery}
                initialQuery={initialQuery}
                researchReady={!!config?.research_ready}
                onNeedsSetup={() => {
                  setSetupPrompt(true);
                  setupRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            </div>

            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.title} className="flex items-start gap-3">
                  <span className="bg-brand grid size-8 shrink-0 place-items-center rounded-lg text-white">
                    <s.icon className="size-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-xs text-muted">{s.text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Library */}
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
        <Library me={me} />
      </section>
    </>
  );
}

function Library({ me }: { me?: Me }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("tab");
  const tab: Tab = fromUrl === "saved" || fromUrl === "watching" ? fromUrl : "recent";
  const setTab = (t: Tab) => router.replace(t === "recent" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "recent", label: "Recent", icon: History, count: me?.counts.discoveries },
    { id: "saved", label: "Saved", icon: Bookmark, count: me?.counts.saved },
    { id: "watching", label: "Watching", icon: Eye, count: me?.counts.watchlist },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Your library" className="mb-6 inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id ? "bg-brand text-white shadow-card" : "text-muted hover:text-text",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {!!t.count && (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", tab === t.id ? "bg-white/20" : "bg-surface-2 text-subtle")}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "recent" && <RecentDiscoveries hideHeading />}
        {tab === "saved" && <SavedList />}
        {tab === "watching" && <WatchList />}
      </div>
    </div>
  );
}
