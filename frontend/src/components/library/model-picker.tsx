"use client";

import { Check, ChevronDown, Cpu, Plus } from "lucide-react";
import * as React from "react";

import { SearchList, useOutside, type ListItem } from "@/components/discover/popover-list";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  label: string;
}

/**
 * Searchable model picker. Shows the provider's live models when available
 * ("Available with your key"), otherwise suggested models; a custom id can be typed.
 */
export function ModelPicker({
  value,
  onChange,
  models,
  live,
  disabled,
  placeholder = "Choose a model",
}: {
  value: string;
  onChange: (id: string) => void;
  models: ModelOption[];
  live: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);

  const query = q.trim().toLowerCase();
  const filtered = models.filter((m) => !query || m.id.toLowerCase().includes(query) || m.label.toLowerCase().includes(query));
  const items: ListItem[] = filtered.slice(0, 200).map((m) => ({
    key: m.id,
    label: m.label !== m.id ? `${m.label}` : m.id,
    detail: m.label !== m.id ? m.id : live ? "Available" : "Suggested",
    icon: m.id === value ? <Check className="text-primary" /> : <Cpu />,
    selected: m.id === value,
  }));
  if (query && !models.some((m) => m.id.toLowerCase() === query)) {
    items.push({ key: `__custom:${q.trim()}`, label: `Use “${q.trim()}”`, detail: "Custom model", icon: <Plus /> });
  }

  const pick = (key: string) => {
    onChange(key.startsWith("__custom:") ? key.slice(9) : key);
    setOpen(false);
    setQ("");
  };

  const current = models.find((m) => m.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id="model"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-primary ring-[3px] ring-primary/15",
        )}
      >
        <Cpu className="size-4 shrink-0 text-subtle" />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-subtle")}>
          {value ? current?.label && current.label !== value ? `${current.label}` : value : placeholder}
        </span>
        {value && current?.label && current.label !== value && <span className="hidden truncate font-mono text-xs text-subtle sm:block">{value}</span>}
        <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <SearchList
          id="model"
          query={q}
          onQuery={setQ}
          items={items}
          onPick={pick}
          placeholder={models.length > 8 ? `Search ${models.length} models…` : "Search or type a model name…"}
          emptyText="No models match"
          footer={live ? "These are the models your key can use." : "Suggested models — enter your key to see exactly what’s available."}
        />
      )}
    </div>
  );
}
