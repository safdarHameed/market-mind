"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { useToast } from "@/components/ui/overlay";
import { api } from "@/lib/api";

/** Opens the clearly-labelled sample discovery (for trying the UI without keys). */
export function useDemo() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = React.useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const r = await api<{ id: string }>("/demo", { method: "POST" });
      router.push(`/discover/${r.id}`);
    } catch (e) {
      setLoading(false);
      toast({ title: "Couldn't load sample data", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    }
  };
  return { open, loading };
}
