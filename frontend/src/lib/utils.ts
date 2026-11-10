import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso) ?? "";
}

export function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

export function scoreTone(score: number | null | undefined): "high" | "mid" | "low" {
  if (score == null) return "low";
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

export function potentialLabel(score: number | null | undefined) {
  const t = scoreTone(score);
  return t === "high" ? "High potential" : t === "mid" ? "Moderate potential" : "Early / uncertain";
}
