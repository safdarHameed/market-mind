"use client";

import { AlertTriangle, ChevronDown, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { GLOBAL } from "@/lib/locations";
import { DISCOVERY_TYPES, FILTER_GROUPS, TIME_PERIODS } from "@/lib/taxonomy";
import type { DiscoveryType, Filters, Location } from "@/lib/types";
import { cn } from "@/lib/utils";

import { IndustryPicker } from "./industry-picker";
import { LocationPicker } from "./location-picker";

const EXAMPLES = ["Problems small retailers face", "Gaps in agriculture logistics", "AI tools small businesses need"];

const schema = z
  .object({ industries: z.array(z.string()), query: z.string().max(600) })
  .refine((v) => v.industries.length > 0 || v.query.trim().length > 0, {
    message: "Type what you’re looking for, or pick an industry.",
  });

export function DiscoverForm({
  researchReady,
  onNeedsSetup,
  initialQuery = "",
}: {
  researchReady: boolean;
  onNeedsSetup: () => void;
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [location, setLocation] = React.useState<Location>(GLOBAL);
  const [industries, setIndustries] = React.useState<string[]>([]);
  const [type, setType] = React.useState<DiscoveryType>("business_opportunities");
  const [filters, setFilters] = React.useState<Filters>({ time_period: "1y" });
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ industries, query });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (!researchReady) return onNeedsSetup();
    setSubmitting(true);
    try {
      const res = await api<{ id: string }>("/discoveries", {
        method: "POST",
        json: { location, industries, discovery_type: type, query: query.trim() || null, filters },
      });
      router.push(`/discover/${res.id}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 503) return onNeedsSetup();
      setError(err instanceof Error ? err.message : "Couldn’t start the search.");
    }
  };

  const typeInfo = DISCOVERY_TYPES.find((t) => t.value === type)!;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 shadow-card focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
        <Search className="size-5 shrink-0 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 600))}
          placeholder="What are you looking for?"
          aria-label="What are you looking for?"
          className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-subtle"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Where">
          <LocationPicker value={location} onChange={setLocation} />
        </Field>
        <Field label="Industry">
          <IndustryPicker value={industries} onChange={setIndustries} />
        </Field>
        <Field label="Looking for">
          <div className="relative">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DiscoveryType)}
              className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-sm hover:border-border-strong focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15"
            >
              {DISCOVERY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-4 text-subtle" />
          </div>
        </Field>
      </div>
      <p className="text-xs text-subtle">{typeInfo.description}</p>

      {moreOpen && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4 animate-fade-in">
          <FilterRow label="Time period" value={filters.time_period} options={TIME_PERIODS} required
            onChange={(v) => setFilters((f) => ({ ...f, time_period: (v ?? "1y") as Filters["time_period"] }))} />
          {FILTER_GROUPS.map((g) => (
            <FilterRow key={g.key} label={g.label} value={filters[g.key]} options={g.options}
              onChange={(v) => setFilters((f) => ({ ...f, [g.key]: v ?? undefined }))} />
          ))}
        </div>
      )}

      {error && <Alert tone="danger" icon={<AlertTriangle />} title={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          More options <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
        </button>
        <Button type="submit" size="lg" loading={submitting} className="min-w-40">
          Discover
        </Button>
      </div>

      {!query && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-subtle">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setQuery(ex)} className="text-muted underline-offset-4 hover:text-primary hover:underline">
              {ex}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

function FilterRow({ label, value, options, onChange, required }: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <div className="w-32 shrink-0 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {!required && <Chip active={!value} onClick={() => onChange(null)}>Any</Chip>}
        {options.map((o) => (
          <Chip key={o.value} active={value === o.value} onClick={() => onChange(value === o.value && !required ? null : o.value)}>{o.label}</Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn("rounded-md border px-2 py-0.5 text-xs transition-colors",
        active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text")}>
      {children}
    </button>
  );
}
