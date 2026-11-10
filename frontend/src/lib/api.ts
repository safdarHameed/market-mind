"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function messageFrom(detail: unknown, fallback: string): { message: string; code?: string } {
  if (typeof detail === "string") return { message: detail };
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; code?: string };
    if (d.message) return { message: d.message, code: d.code };
  }
  return { message: fallback };
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Can't reach the ${BRAND.name} server. Check that the backend is running.`, 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const fallback =
      res.status >= 500 && !data ? `The ${BRAND.name} server is unavailable. Is the backend running?` : `Request failed (${res.status})`;
    const { message, code } = messageFrom((data as { detail?: unknown })?.detail, fallback);
    throw new ApiError(message, res.status, code);
  }
  return data as T;
}

/** Minimal data-fetching hook with refresh + optional polling. */
export function useApi<T>(path: string | null, opts?: { pollMs?: number | ((data: T | undefined) => number | null) }) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [settled, setSettled] = useState(false);
  const pollRef = useRef(opts?.pollMs);
  useEffect(() => {
    pollRef.current = opts?.pollMs;
  });

  const load = useCallback(async () => {
    if (!path) return undefined;
    try {
      const d = await api<T>(path);
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
      return undefined;
    } finally {
      setSettled(true);
    }
  }, [path]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const d = await load();
      if (cancelled) return;
      const p = pollRef.current;
      const ms = typeof p === "function" ? p(d) : p;
      if (ms) timer = setTimeout(tick, ms);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [path, load]);

  const loading = !!path && !settled;
  return { data, error, loading, refresh: load, setData };
}

/** Parse a text/event-stream response body. */
export async function* readSSE(res: Response): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length) {
        try {
          yield { event, data: JSON.parse(dataLines.join("\n")) };
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
  }
}
