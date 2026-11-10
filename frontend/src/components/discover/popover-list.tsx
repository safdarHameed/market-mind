"use client";

import { Search } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOutside, active]);
}

export interface ListItem {
  key: string;
  label: string;
  detail?: string;
  icon?: React.ReactNode;
  selected?: boolean;
}

/** Searchable listbox panel with arrow-key navigation (WAI-ARIA combobox pattern). */
export function SearchList({
  id,
  query,
  onQuery,
  items,
  onPick,
  placeholder,
  footer,
  emptyText = "No matches",
  multi,
}: {
  id: string;
  query: string;
  onQuery: (q: string) => void;
  items: ListItem[];
  onPick: (key: string) => void;
  placeholder: string;
  footer?: React.ReactNode;
  emptyText?: string;
  multi?: boolean;
}) {
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      onPick(items[active].key);
    }
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1.5 w-full min-w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-fade-in">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-subtle" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={items[active] ? `${id}-opt-${active}` : undefined}
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-subtle"
        />
      </div>
      <ul id={`${id}-list`} ref={listRef} role="listbox" aria-multiselectable={multi || undefined} className="max-h-72 overflow-y-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">{emptyText}</li>}
        {items.map((it, i) => (
          <li
            key={it.key}
            id={`${id}-opt-${i}`}
            data-idx={i}
            role="option"
            aria-selected={!!it.selected}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(it.key)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
              i === active ? "bg-surface-2" : "",
              it.selected && "text-primary",
            )}
          >
            {it.icon && <span className="text-subtle [&_svg]:size-4">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.detail && <span className="shrink-0 text-xs text-subtle">{it.detail}</span>}
          </li>
        ))}
      </ul>
      {footer && <div className="border-t border-border px-3 py-2 text-xs text-subtle">{footer}</div>}
    </div>
  );
}
