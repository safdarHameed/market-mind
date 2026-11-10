"use client";

import { CheckCircle2, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/overlay";
import { Card, Input, Skeleton } from "@/components/ui/primitives";
import { api, useApi } from "@/lib/api";

import { ModelPicker, type ModelOption } from "./model-picker";
import type { AISettings, Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const selectClass =
  "h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-3 text-sm hover:border-border-strong focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15";

export function SettingsView() {
  const { data, setData } = useApi<AISettings>("/settings/ai");
  const { data: me, refresh: refreshMe } = useApi<Me>("/me");

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Connect the AI that powers your research, and manage your workspace." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {data ? <AISection key={data.saved.provider ?? "none"} data={data} onSaved={setData} /> : <Skeleton className="h-96" />}
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle title="Profile" />
            {me ? <ProfileForm key={me.id} me={me} onSaved={refreshMe} /> : <Skeleton className="h-32" />}
          </Card>
          <DataSection />
        </div>
      </div>
    </PageContainer>
  );
}

function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

function Label({ children, htmlFor, aside }: { children: React.ReactNode; htmlFor?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <label htmlFor={htmlFor} className="text-sm font-medium">{children}</label>
      {aside}
    </div>
  );
}

type LiveModels = { sig: string; models: ModelOption[] };

function pickDefault(models: ModelOption[], suggested: string[], current: string) {
  if (current && models.some((m) => m.id === current)) return current;
  return suggested.find((id) => models.some((m) => m.id === id)) ?? models[0]?.id ?? current;
}

function AISection({ data, onSaved }: { data: AISettings; onSaved: (d: AISettings) => void }) {
  const toast = useToast();
  const saved = data.saved;
  const [provider, setProvider] = React.useState(saved.provider ?? "anthropic");
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState(saved.base_url ?? "");
  const [model, setModel] = React.useState(saved.model ?? data.providers.find((p) => p.id === (saved.provider ?? "anthropic"))?.suggested[0] ?? "");
  const [live, setLive] = React.useState<LiveModels | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{ sig: string; message: string } | null>(null);
  const [search, setSearch] = React.useState(saved.search_provider === "anthropic" ? "builtin" : saved.search_provider || "auto");
  const [searchKey, setSearchKey] = React.useState("");
  const [useOwnSearch, setUseOwnSearch] = React.useState(saved.has_search_key && (saved.search_provider === "tavily" || saved.search_provider === "brave"));
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const spec = data.providers.find((p) => p.id === provider)!;
  const keySavedForThis = saved.has_key && saved.provider === provider;
  const active = data.active;
  const typedKey = apiKey.trim();

  // Which key/endpoint the model list belongs to. Results for any other combination are ignored.
  const sig = `${provider}|${typedKey || (keySavedForThis ? "saved" : "")}|${spec.needs_base_url ? baseUrl.trim() : ""}`;
  const canCheck = spec.needs_base_url ? baseUrl.trim().length > 8 : typedKey.length >= 8 || (keySavedForThis && !typedKey);
  const liveForThis = live?.sig === sig ? live.models : null;
  const suggested: ModelOption[] = spec.suggested.map((id) => ({ id, label: id }));
  const models = liveForThis ?? suggested;
  const error = failure?.sig === sig ? failure.message : null;
  // Also "checking" during the short debounce before the request starts.
  const checking = pending === sig || (canCheck && !liveForThis && !error);

  // Automatically fetch the models this key can use (debounced while typing).
  React.useEffect(() => {
    if (!canCheck) return;
    const requestSig = sig;
    const timer = setTimeout(async () => {
      setPending(requestSig);
      try {
        const r = await api<{ models: ModelOption[] }>("/settings/ai/models", {
          method: "POST",
          json: { provider, api_key: typedKey || null, base_url: spec.needs_base_url ? baseUrl.trim() : null },
        });
        setLive({ sig: requestSig, models: r.models });
        setFailure(null);
        if (r.models.length) setModel((cur) => pickDefault(r.models, spec.suggested, cur));
      } catch (e) {
        setFailure({ sig: requestSig, message: e instanceof Error ? e.message : "Couldn’t check this key." });
      } finally {
        setPending((p) => (p === requestSig ? null : p));
      }
    }, typedKey ? 700 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, canCheck]);

  const changeProvider = (id: string) => {
    const next = data.providers.find((p) => p.id === id);
    setProvider(id);
    setApiKey("");
    setModel(id === saved.provider && saved.model ? saved.model : next?.suggested[0] ?? "");
    if (!next?.web_search && (search === "builtin" || search === "anthropic")) setSearch("auto");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<AISettings>("/settings/ai", {
        method: "PUT",
        json: {
          provider,
          model: model.trim(),
          api_key: apiKey ? apiKey : null,
          base_url: spec.needs_base_url ? baseUrl : null,
          search_provider: ownKeyActive ? keyedSearch : "auto",
          search_api_key: wantsKey && searchKey ? searchKey : null,
        },
      });
      setApiKey("");
      setSearchKey("");
      onSaved(r);
      toast({ title: "Saved", description: r.active.ready ? `${BRAND.name} is ready to research.` : undefined, tone: "success" });
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : undefined, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api<{ provider: string; model: string }>("/settings/ai/test", { method: "POST" });
      toast({ title: "Connection works", description: `${r.provider} · ${r.model}`, tone: "success" });
    } catch (err) {
      toast({ title: "Connection failed", description: err instanceof Error ? err.message : undefined, tone: "danger" });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Remove your saved AI settings and keys?")) return;
    onSaved(await api<AISettings>("/settings/ai", { method: "DELETE" }));
  };

  // Providers with built-in search (Gemini, Anthropic) just use it; others need a Tavily/Brave key.
  const keyedSearch: "tavily" | "brave" = search === "brave" ? "brave" : "tavily";
  // Built-in search providers can optionally use the user's own key first (backup when built-in quota runs out).
  const wantsKey = !spec.web_search || useOwnSearch;
  const ownKeyActive = wantsKey && (!!searchKey || (saved.has_search_key && saved.search_provider === keyedSearch));

  return (
    <Card className="p-6">
      <SectionTitle
        title="AI model"
        hint="Used for research and for the Challenge chat. Your key is encrypted and never shown again."
        right={<Status ok={!!active.ai} text={active.ai ? `${active.ai.label.split(" (")[0]} · ${active.ai.model}` : "Not connected"} />}
      />
      {active.ai?.source === "server" && (
        <p className="-mt-2 mb-5 text-xs text-subtle">Currently using the server’s default key. Add your own below to override it.</p>
      )}

      <form onSubmit={save} className="space-y-5">
        <div>
          <Label htmlFor="provider">Provider</Label>
          <select id="provider" value={provider} onChange={(e) => changeProvider(e.target.value)} className={selectClass}>
            {data.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {spec.needs_base_url && (
          <div>
            <Label htmlFor="base">Base URL</Label>
            <Input id="base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-server.example.com/v1" />
          </div>
        )}

        <div>
          <Label
            htmlFor="key"
            aside={spec.key_url && (
              <a href={spec.key_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Get a key <ExternalLink className="size-3" />
              </a>
            )}
          >
            API key
          </Label>
          <Input
            id="key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keySavedForThis ? `Saved (${saved.key_hint}) — leave blank to keep` : spec.key_placeholder}
            aria-invalid={!!error}
            className={cn(error && "border-danger focus:border-danger")}
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs" aria-live="polite">
            {checking ? (
              <><Loader2 className="size-3 animate-spin text-primary" /><span className="text-muted">Checking your key with {spec.label.split(" (")[0]}…</span></>
            ) : error ? (
              <span className="text-danger">{error}</span>
            ) : liveForThis ? (
              <><CheckCircle2 className="size-3.5 text-success" /><span className="text-success">Key works · {liveForThis.length} model{liveForThis.length === 1 ? "" : "s"} available</span></>
            ) : (
              <span className="text-subtle">
                {spec.needs_base_url ? "Enter your server’s URL to load its models." : "Enter your key and we’ll load the models it can use."}
              </span>
            )}
          </p>
        </div>

        <div>
          <Label
            htmlFor="model"
            aside={
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", liveForThis ? "bg-success-soft text-success" : "bg-surface-2 text-subtle")}>
                {liveForThis ? "From your key" : "Suggested"}
              </span>
            }
          >
            Model
          </Label>
          <ModelPicker value={model} onChange={setModel} models={models} live={!!liveForThis} disabled={checking && !models.length} />
          <p className="mt-1.5 text-xs text-subtle">Pick a recent model — very small or old models may not work. You can also type a name.</p>
        </div>

        {spec.web_search ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              <span className="flex-1">
                Web search included{provider === "gemini" ? " (Google Search)" : ""} — no extra key needed.
              </span>
              {!useOwnSearch && (
                <button type="button" onClick={() => setUseOwnSearch(true)} className="text-xs font-medium text-primary hover:underline">
                  Add your own search key (optional)
                </button>
              )}
            </div>
            {useOwnSearch && (
              <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{spec.web_search ? "Your own search key" : "Add a search key"}</span>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs" role="radiogroup" aria-label="Search service">
                  {(["tavily", "brave"] as const).map((id) => (
                    <button key={id} type="button" role="radio" aria-checked={keyedSearch === id} onClick={() => setSearch(id)}
                      className={cn("rounded-md px-3 py-1 font-medium", keyedSearch === id ? "bg-surface text-text shadow-card" : "text-muted")}>
                      {id === "tavily" ? "Tavily" : "Brave"}
                    </button>
                  ))}
                </div>
                {spec.web_search && (
                  <button type="button" onClick={() => { setUseOwnSearch(false); setSearchKey(""); }} className="text-xs text-muted hover:text-danger">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">
              {spec.web_search
                ? `Used first for searching. If it fails or runs out, ${BRAND.name} switches back to the built-in search.`
                : `${spec.label.split(" (")[0]} can’t search the web by itself, so ${BRAND.name} needs a search key to find sources.`}{" "}
              <a href={keyedSearch === "tavily" ? "https://app.tavily.com" : "https://api-dashboard.search.brave.com"} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Get a free key
              </a>
            </p>
            <Input className="mt-3" type="password" autoComplete="off" value={searchKey} onChange={(e) => setSearchKey(e.target.value)}
              placeholder={saved.has_search_key && saved.search_provider === keyedSearch ? `Saved (${saved.search_key_hint}) — leave blank to keep` : `${keyedSearch === "tavily" ? "Tavily" : "Brave"} API key`} />
            {!spec.web_search && active.search?.source === "server" && !searchKey && (
              <p className="mt-2 text-xs text-subtle">Optional — this server already has a search key you can use.</p>
            )}
          </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{spec.web_search ? "Your own search key" : "Add a search key"}</span>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs" role="radiogroup" aria-label="Search service">
                  {(["tavily", "brave"] as const).map((id) => (
                    <button key={id} type="button" role="radio" aria-checked={keyedSearch === id} onClick={() => setSearch(id)}
                      className={cn("rounded-md px-3 py-1 font-medium", keyedSearch === id ? "bg-surface text-text shadow-card" : "text-muted")}>
                      {id === "tavily" ? "Tavily" : "Brave"}
                    </button>
                  ))}
                </div>
                {spec.web_search && (
                  <button type="button" onClick={() => { setUseOwnSearch(false); setSearchKey(""); }} className="text-xs text-muted hover:text-danger">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">
              {spec.web_search
                ? `Used first for searching. If it fails or runs out, ${BRAND.name} switches back to the built-in search.`
                : `${spec.label.split(" (")[0]} can’t search the web by itself, so ${BRAND.name} needs a search key to find sources.`}{" "}
              <a href={keyedSearch === "tavily" ? "https://app.tavily.com" : "https://api-dashboard.search.brave.com"} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Get a free key
              </a>
            </p>
            <Input className="mt-3" type="password" autoComplete="off" value={searchKey} onChange={(e) => setSearchKey(e.target.value)}
              placeholder={saved.has_search_key && saved.search_provider === keyedSearch ? `Saved (${saved.search_key_hint}) — leave blank to keep` : `${keyedSearch === "tavily" ? "Tavily" : "Brave"} API key`} />
            {!spec.web_search && active.search?.source === "server" && !searchKey && (
              <p className="mt-2 text-xs text-subtle">Optional — this server already has a search key you can use.</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" loading={saving} disabled={!model.trim() || !!error}>Save</Button>
          <Button type="button" variant="secondary" onClick={test} loading={testing} disabled={!active.ai}>Test connection</Button>
          {saved.provider && (
            <Button type="button" variant="ghost" onClick={disconnect} className="ml-auto">Disconnect</Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", ok ? "bg-success-soft text-success" : "bg-surface-2 text-muted")}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <span className="size-1.5 rounded-full bg-subtle" />}
      <span className="max-w-48 truncate">{text}</span>
    </span>
  );
}

function ProfileForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState(me.display_name ?? "");
  const [country, setCountry] = React.useState(me.home_country ?? "");
  const [saving, setSaving] = React.useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/me", { method: "PATCH", json: { display_name: name, home_country: country } });
      toast({ title: "Profile saved", tone: "success" });
      onSaved();
    } catch (err) {
      toast({ title: "Couldn't save", description: err instanceof Error ? err.message : undefined, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Optional" />
        </div>
        <div>
          <Label htmlFor="country">Home country</Label>
          <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} placeholder="e.g. Pakistan" />
        </div>
      </div>
      <p className="text-xs text-subtle">Your home country helps the AI answer “Could this work in my country?”</p>
      <Button type="submit" variant="secondary" loading={saving}>Save profile</Button>
    </form>
  );
}

function DataSection() {
  const toast = useToast();
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const wipe = async () => {
    if (!confirm("Delete all your searches, saved items, chats and settings? This can’t be undone.")) return;
    setDeleting(true);
    try {
      await api("/me/data", { method: "DELETE" });
      router.push("/discover");
    } catch (err) {
      setDeleting(false);
      toast({ title: "Couldn't delete data", description: err instanceof Error ? err.message : undefined, tone: "danger" });
    }
  };
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="font-semibold">Appearance & data</h2>
        <p className="mt-0.5 text-sm text-muted">Your workspace is tied to this browser — no sign-up needed.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ThemeToggle withLabel className="border border-border" />
        <Button variant="ghost" onClick={wipe} loading={deleting} className="text-danger hover:bg-danger-soft hover:text-danger">
          {!deleting && <Trash2 />} Delete my data
        </Button>
      </div>
    </Card>
  );
}
