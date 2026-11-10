"use client";

import { Settings } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { useApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { AppConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./theme-toggle";

/** AI connection status — doubles as the shortcut to Settings. */
function AIStatus() {
  const { data: config } = useApi<AppConfig>("/config");
  if (!config) return null;
  const ready = config.research_ready;
  return (
    <Link
      href="/settings"
      title={ready ? `${config.llm_provider} · ${config.llm_model ?? ""}` : "Connect an AI to start researching"}
      className={cn(
        "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:inline-flex",
        ready ? "border-border text-muted hover:text-text" : "border-warning/40 bg-warning-soft text-warning",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ready ? "bg-success" : "bg-warning")} />
      {ready ? `${config.llm_provider?.replace("Google ", "").split(" (")[0]} connected` : "Connect AI"}
    </Link>
  );
}

/** Slim top bar: logo (home), AI status, theme, settings. No sidebar. */
function TopBar() {
  return (
    <header data-print-hide className="sticky top-0 z-30 border-b border-border/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/discover" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <AIStatus />
          <ThemeToggle />
          <Link href="/settings" aria-label="Settings" title="Settings" className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text">
            <Settings className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main>{children}</main>
    </div>
  );
}

/** Standard page frame: every app page uses the same max width and spacing. */
export function PageContainer({ children, className }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-10 lg:px-10", className)}>{children}</div>;
}

/** Standard page header: same title size, subtitle style and spacing on every page. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm font-medium text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
