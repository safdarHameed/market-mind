"use client";

import {
  ArrowUp,
  BookOpen,
  Hammer,
  History,
  Loader2,
  MessageCircleQuestion,
  MessageSquarePlus,
  Search,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, useToast } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/primitives";
import { api, readSSE } from "@/lib/api";
import type { ChatMessage, ChatMode, Citation, Conversation, OpportunityReport } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

import type { SourceIndex } from "./evidence";
import { Markdown } from "./markdown";
import { BRAND } from "@/lib/brand";

const MODES: { value: ChatMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "explain", label: "Explain", icon: <BookOpen />, hint: "Plain-language explanation" },
  { value: "challenge", label: "Challenge", icon: <Swords />, hint: "Find weaknesses and reasons it could fail" },
  { value: "investigate", label: "Investigate", icon: <Search />, hint: "Search for new public evidence" },
  { value: "build", label: "Build", icon: <Hammer />, hint: "Turn it into a product or business plan" },
];

const STARTERS: { text: string; mode?: ChatMode }[] = [
  { text: "Explain this opportunity simply.", mode: "explain" },
  { text: "Why might this fail?", mode: "challenge" },
  { text: "Are there already competitors?", mode: "investigate" },
  { text: "How could someone make money from this?", mode: "build" },
  { text: "Could this work in my country?" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  report: OpportunityReport;
  index: SourceIndex;
  onNewEvidence: () => void;
  onReassess: () => void;
  reassessing: boolean;
  initialPrompt?: { text: string; id: number } | null;
}

export function DebatePanel({ open, onClose, report, index, onNewEvidence, onReassess, reassessing, initialPrompt }: Props) {
  const toast = useToast();
  const [conversations, setConversations] = React.useState<Conversation[] | null>(null);
  const [conv, setConv] = React.useState<Conversation | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [mode, setMode] = React.useState<ChatMode | null>(null);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const sentInitial = React.useRef<number | null>(null);
  const isDemo = report.discovery.is_demo;

  const loadConversations = React.useCallback(async () => {
    const r = await api<{ items: Conversation[] }>(`/opportunities/${report.id}/conversations`);
    setConversations(r.items);
    return r.items;
  }, [report.id]);

  const openConversation = React.useCallback(async (id: string) => {
    const c = await api<Conversation>(`/conversations/${id}`);
    setConv(c);
    setMessages(c.messages ?? []);
    setShowHistory(false);
  }, []);

  // Resume the most recent discussion when the panel opens.
  React.useEffect(() => {
    if (!open || conversations !== null) return;
    api<{ items: Conversation[] }>(`/opportunities/${report.id}/conversations`)
      .then((r) => {
        setConversations(r.items);
        if (r.items[0]) return openConversation(r.items[0].id);
      })
      .catch((e) => setError(e.message));
  }, [open, conversations, report.id, openConversation]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const newDiscussion = () => {
    setConv(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
    textareaRef.current?.focus();
  };

  const send = React.useCallback(
    async (text: string, m: ChatMode | null = mode, forceNew = false) => {
      const content = text.trim();
      if (!content || streaming) return;
      setError(null);
      setInput("");
      setStreaming(true);
      setStatus("Thinking…");
      const tempUser: ChatMessage = { id: `tmp-u-${Date.now()}`, role: "user", mode: m, content, citations: [], research_queries: [], status: "complete", created_at: new Date().toISOString() };
      const tempAsst: ChatMessage = { id: `tmp-a-${Date.now()}`, role: "assistant", mode: m, content: "", citations: [], research_queries: [], status: "complete", created_at: new Date().toISOString() };
      setMessages((ms) => [...ms, tempUser, tempAsst]);
      let didResearch = false;
      try {
        let c = forceNew ? null : conv;
        if (!c) {
          c = await api<Conversation>(`/opportunities/${report.id}/conversations`, { method: "POST", json: {} });
          setConv(c);
        }
        const res = await fetch(`/api/conversations/${c.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, mode: m }),
        });
        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`;
          try {
            const j = await res.json();
            msg = typeof j.detail === "string" ? j.detail : j.detail?.message ?? msg;
          } catch {}
          throw new Error(msg);
        }
        for await (const { event, data } of readSSE(res)) {
          const d = data as Record<string, unknown>;
          if (event === "delta") {
            setStatus(null);
            setMessages((ms) => ms.map((x) => (x.id === tempAsst.id ? { ...x, content: x.content + (d.text as string) } : x)));
          } else if (event === "status") {
            setStatus(d.text as string);
            didResearch = true;
          } else if (event === "done") {
            setMessages((ms) =>
              ms.map((x) =>
                x.id === tempAsst.id
                  ? { ...x, id: d.message_id as string, citations: d.citations as Citation[], research_queries: d.research_queries as string[] }
                  : x,
              ),
            );
            if ((d.new_source_ids as string[]).length) onNewEvidence();
          } else if (event === "error") {
            throw new Error(d.message as string);
          }
        }
        loadConversations().catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setMessages((ms) => ms.filter((x) => !(x.id === tempAsst.id && !x.content)));
      } finally {
        setStreaming(false);
        setStatus(null);
        if (didResearch) onNewEvidence();
      }
    },
    [conv, mode, report.id, streaming, loadConversations, onNewEvidence],
  );

  // Question passed in from the report page (e.g. "Ask about this" on a piece of evidence).
  React.useEffect(() => {
    if (open && initialPrompt && sentInitial.current !== initialPrompt.id && conversations !== null && !isDemo && !streaming) {
      sentInitial.current = initialPrompt.id;
      send(initialPrompt.text, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, conversations]);

  const deleteConversation = async (id: string) => {
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
      if (conv?.id === id) newDiscussion();
      await loadConversations();
    } catch (e) {
      toast({ title: "Couldn't delete", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    }
  };

  const hasDebate = messages.some((m) => m.role === "assistant" && m.content);

  return (
    <Sheet open={open} onClose={onClose} label="Ask about this opportunity">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <MessageCircleQuestion className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Ask about this opportunity</div>
          <div className="truncate text-xs text-muted">{report.title}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setShowHistory((s) => !s)} aria-label="Previous discussions" aria-pressed={showHistory}>
          <History />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={newDiscussion} aria-label="New discussion">
          <MessageSquarePlus />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </header>

      {showHistory && (
        <div className="max-h-64 overflow-y-auto border-b border-border bg-surface-2/50 p-2">
          {!conversations?.length ? (
            <p className="px-2 py-3 text-xs text-muted">No previous discussions.</p>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5", conv?.id === c.id && "bg-surface")}>
                <button className="min-w-0 flex-1 text-left" onClick={() => openConversation(c.id)}>
                  <div className="truncate text-sm">{c.title}</div>
                  <div className="text-[11px] text-subtle">{c.message_count} messages · {timeAgo(c.updated_at)}</div>
                </button>
                <button onClick={() => deleteConversation(c.id)} aria-label="Delete discussion" className="rounded p-1 text-subtle opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5" aria-live="polite">
        {isDemo && (
          <Alert tone="warning" title="Not available on sample data">
            The chat needs real sources to cite. Connect an AI in Settings and run a real search to use it.
          </Alert>
        )}
        {!isDemo && messages.length === 0 && (
          <div className="animate-fade-in">
            <p className="text-sm text-muted">
              Ask anything about this opportunity. {BRAND.name} answers from this report’s {index.size} sources, can search for new public evidence, and
              will tell you when the evidence isn’t there.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => send(s.text, s.mode ?? mode)}
                  className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-left text-[13px] transition-colors hover:border-primary/50 hover:bg-primary-soft"
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-fg">
                {m.mode && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-75">{m.mode}</div>}
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <LogoMark size={26} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                {m.research_queries.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {m.research_queries.map((q) => (
                      <span key={q} className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] text-success">
                        <Search className="size-3" /> {q}
                      </span>
                    ))}
                  </div>
                )}
                {m.content ? (
                  <Markdown text={m.content} index={index} citations={m.citations} linkSources />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="size-4 animate-spin" /> {status ?? "Thinking…"}
                  </div>
                )}
                {m.status === "error" && <p className="mt-1 text-xs text-danger">This reply was interrupted.</p>}
              </div>
            </div>
          ),
        )}
        {streaming && status && messages[messages.length - 1]?.content && (
          <div className="flex items-center gap-2 pl-9 text-xs text-muted">
            <Loader2 className="size-3.5 animate-spin" /> {status}
          </div>
        )}
        {error && <Alert tone="danger" title="Couldn’t get a reply">{error}</Alert>}
      </div>

      {!isDemo && (
        <div className="border-t border-border p-3">
          {hasDebate && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              <span>Has the debate changed your view? Re-score with the discussion and any new sources.</span>
              <Button size="sm" variant="secondary" onClick={onReassess} loading={reassessing} disabled={streaming}>
                Update assessment
              </Button>
            </div>
          )}
          <div className="mb-2 flex gap-1 overflow-x-auto" role="group" aria-label="Conversation mode (optional)">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(mode === m.value ? null : m.value)}
                aria-pressed={mode === m.value}
                title={m.hint}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
                  mode === m.value ? "border-primary bg-primary-soft text-text" : "border-border text-muted hover:text-text",
                )}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 p-1.5 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 4000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={mode === "challenge" ? "Raise an objection…" : "Ask or object… e.g. “Isn’t this already solved?”"}
              aria-label="Message"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-subtle"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || streaming} aria-label="Send">
              {streaming ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
          <p className="mt-1.5 px-1 text-[11px] text-subtle">
            Cited sources link to originals. <span className="text-success">Green</span> chips are newly retrieved during this debate.
          </p>
        </div>
      )}
    </Sheet>
  );
}
