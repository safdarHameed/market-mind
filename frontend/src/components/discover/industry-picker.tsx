"use client";

import { Check, ChevronDown, Layers, Plus, X } from "lucide-react";
import * as React from "react";

import { INDUSTRIES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

import { SearchList, useOutside, type ListItem } from "./popover-list";

const MAX = 5;

export function IndustryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);

  const query = q.trim().toLowerCase();
  const matches = INDUSTRIES.filter((i) => i.toLowerCase().includes(query));
  const items: ListItem[] = matches.map((i) => ({
    key: i,
    label: i,
    selected: value.includes(i),
    icon: value.includes(i) ? <Check className="text-primary" /> : <Layers />,
  }));
  const isCustom = query.length >= 2 && !INDUSTRIES.some((i) => i.toLowerCase() === query) && !value.some((v) => v.toLowerCase() === query);
  if (isCustom) items.push({ key: "__custom", label: `Add “${q.trim()}”`, detail: "Custom industry", icon: <Plus /> });

  const toggle = (key: string) => {
    const k = key === "__custom" ? q.trim().slice(0, 80) : key;
    if (value.includes(k)) onChange(value.filter((v) => v !== k));
    else if (value.length < MAX) onChange([...value, k]);
    if (key === "__custom") setQ("");
  };

  return (
    <div ref={ref} className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((o) => !o))}
        className={cn(
          "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-left text-sm transition-colors hover:border-border-strong",
          open && "border-primary ring-[3px] ring-primary/15",
        )}
      >
        <Layers className="size-4 shrink-0 text-subtle" />
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {value.length === 0 && <span className="text-subtle">Any industry</span>}
          {value.map((v) => (
            <span key={v} className="inline-flex max-w-full items-center gap-1 truncate rounded bg-surface-2 py-0.5 pl-1.5 pr-0.5 text-xs">
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
                className="rounded p-0.5 text-subtle hover:bg-surface-2 hover:text-text"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <SearchList
          id="industry"
          multi
          query={q}
          onQuery={setQ}
          items={items}
          onPick={toggle}
          placeholder="Search industries or type your own…"
          footer={value.length >= MAX ? `Up to ${MAX} industries.` : "You can pick more than one, or type your own."}
        />
      )}
    </div>
  );
}
