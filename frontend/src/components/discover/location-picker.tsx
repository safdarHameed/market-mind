"use client";

import { Building2, ChevronDown, Flag, Globe2, MapPin, Map as MapIcon, Plus } from "lucide-react";
import * as React from "react";

import { searchLocations, toLocation, type LocationOption } from "@/lib/locations";
import type { Location } from "@/lib/types";
import { cn } from "@/lib/utils";

import { SearchList, useOutside, type ListItem } from "./popover-list";

const LEVEL_ICON = { global: <Globe2 />, country: <Flag />, region: <MapIcon />, city: <Building2 /> };

export function LocationPicker({ value, onChange }: { value: Location; onChange: (l: Location) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);

  const results = React.useMemo(() => searchLocations(q), [q]);
  const byKey = React.useMemo(() => new Map<string, LocationOption>(results.map((r) => [r.key, r])), [results]);
  const custom = q.trim().length >= 2 && !results.some((r) => r.label.toLowerCase() === q.trim().toLowerCase());

  const items: ListItem[] = results.map((r) => ({
    key: r.key,
    label: r.label,
    detail: r.detail,
    icon: LEVEL_ICON[r.level],
    selected: r.label === value.label,
  }));
  if (custom) items.push({ key: "__custom", label: `Use “${q.trim()}”`, detail: "Custom location", icon: <Plus /> });

  const pick = (key: string) => {
    if (key === "__custom") {
      onChange({ level: "region", label: q.trim().slice(0, 150) });
    } else {
      const r = byKey.get(key);
      if (r) onChange(toLocation(r));
    }
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm transition-colors hover:border-border-strong",
          open && "border-primary ring-[3px] ring-primary/15",
        )}
      >
        <span className="text-subtle [&_svg]:size-4">{value.level === "global" ? <Globe2 /> : <MapPin />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{value.label}</span>
        </span>
        <ChevronDown className={cn("size-4 text-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <SearchList
          id="location"
          query={q}
          onQuery={setQ}
          items={items}
          onPick={pick}
          placeholder="Search a country, state or city…"
          footer="If sources only cover the country, results will say so."
        />
      )}
    </div>
  );
}
