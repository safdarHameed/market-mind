import * as React from "react";

import type { Citation } from "@/lib/types";

import { SourceChip, type SourceIndex } from "./evidence";

/**
 * Tiny, safe Markdown subset for AI replies: paragraphs, bullet/numbered lists,
 * **bold**, *italic*, `code`, headings (###) and [S#] citations. Renders React
 * elements only — never raw HTML.
 */
export function Markdown({
  text,
  index,
  citations,
  linkSources,
}: {
  text: string;
  index: SourceIndex;
  citations?: Citation[];
  /** Open the original source instead of scrolling the report (used inside the debate panel). */
  linkSources?: boolean;
}) {
  const byRef = new Map<string, { id: string; isNew: boolean }>();
  for (const c of citations ?? []) byRef.set(c.ref, { id: c.source_id, isNew: c.is_new });
  const refIndex = new Map([...index.values()].map((s) => [s.ref, s]));

  const inline = (s: string, key: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const rx = /(\*\*[^*]+\*\*|`[^`]+`|\[S\d+(?:\s*,\s*S\d+)*\]|\*[^*\s][^*]*\*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = rx.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const tok = m[0];
      const k = `${key}-${i++}`;
      if (tok.startsWith("**")) out.push(<strong key={k} className="font-semibold text-text">{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12px]">{tok.slice(1, -1)}</code>);
      else if (tok.startsWith("[S")) {
        const refs = tok.slice(1, -1).split(/\s*,\s*/);
        out.push(
          <React.Fragment key={k}>
            {refs.map((r) => {
              const src = refIndex.get(r);
              if (!src) return <span key={r} className="text-subtle" title="Unknown source reference">[{r}?]</span>;
              return (
                <SourceChip
                  key={r}
                  source={src}
                  isNew={byRef.get(r)?.isNew ?? src.origin !== "discovery"}
                  href={linkSources && src.verification_status !== "sample" ? src.url : undefined}
                />
              );
            })}
          </React.Fragment>,
        );
      } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
      last = m.index + tok.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };

  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(list.ordered ? <ol key={k} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={k} className="list-disc space-y-1 pl-5">{items}</ul>);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(<p key={k} className="font-semibold text-text">{inline(heading[1], k)}</p>);
    } else if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2.5 text-sm leading-relaxed">{blocks}</div>;
}
