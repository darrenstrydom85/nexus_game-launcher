/** Small pure formatting helpers for the Wrapped story. */
import type { DayBucket, HourBucket } from "@/types/wrapped";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Locale number with a fixed number of decimals ("1,204", "6.5"). */
export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Hours from seconds plus the decimals to show: one under ten hours, none above. */
export function hoursOf(seconds: number): { value: number; decimals: number } {
  const value = Math.max(0, seconds) / 3600;
  return { value, decimals: value < 10 ? 1 : 0 };
}

/** Percent with one decimal under ten, whole above. */
export function percentDecimals(pct: number): number {
  return pct < 10 ? 1 : 0;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/**
 * The period as it reads after "Your": "This month" → "month",
 * "Last 7 days" → "last 7 days", "2025" → "2025", a custom range → "time".
 */
export function periodPhrase(label: string): string {
  if (/\d{4}-\d{2}-\d{2}/.test(label)) return "time";
  if (/^this /i.test(label)) return label.slice(5).toLowerCase();
  if (/^last /i.test(label)) return label.toLowerCase();
  return label;
}

/** "Jun 15" (adds the year when it isn't the current one). */
export function shortDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "9 PM", "12 AM". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function peakDay(days: DayBucket[]): { day: number; name: string; seconds: number; total: number } | null {
  const total = days.reduce((sum, b) => sum + b.playTimeS, 0);
  if (total <= 0) return null;
  const best = days.reduce((a, b) => (b.playTimeS > a.playTimeS ? b : a));
  return { day: best.day, name: DAY_NAMES[best.day % 7], seconds: best.playTimeS, total };
}

const PARTS: { name: string; hours: number[] }[] = [
  { name: "morning", hours: [5, 6, 7, 8, 9, 10, 11] },
  { name: "afternoon", hours: [12, 13, 14, 15, 16] },
  { name: "evening", hours: [17, 18, 19, 20, 21] },
  { name: "late-night", hours: [22, 23, 0, 1, 2, 3, 4] },
];

/** The busiest part of the day and the single busiest hour, or null without hourly data. */
export function partOfDay(hours: HourBucket[]): { part: string; peakHour: number } | null {
  if (!hours.some((b) => b.playTimeS > 0)) return null;
  const byHour = new Map(hours.map((b) => [b.hour, b.playTimeS]));
  const part = PARTS.map((p) => ({ name: p.name, total: p.hours.reduce((s, h) => s + (byHour.get(h) ?? 0), 0) })).reduce(
    (a, b) => (b.total > a.total ? b : a),
  );
  const peak = hours.reduce((a, b) => (b.playTimeS > a.playTimeS ? b : a));
  return { part: part.name, peakHour: peak.hour };
}

const PLATFORM_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  ea: "EA app",
  standalone: "Standalone",
};

export function platformLabel(source: string): string {
  return PLATFORM_LABELS[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/** "a, b and c". */
export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
