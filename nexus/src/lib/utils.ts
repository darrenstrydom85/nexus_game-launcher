import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Inline SVG placeholder avatar (no external CDN dependency). */
export const DEFAULT_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" fill="%23374151"><circle cx="35" cy="35" r="35"/><circle cx="35" cy="26" r="10"/><path d="M35 42c-8 0-14 5-14 11v6h28v-6c0-6-6-11-14-11z"/></svg>',
  );

/**
 * Formats play time in seconds to "Xh Ym" or "Xm" for display (e.g. stats, top games).
 * Always shows hours and minutes when there is at least one hour; under an hour shows minutes only.
 */
export function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Formats HLTB hours to a human-readable duration string.
 * Returns "--" for null/zero, "Xm" for sub-hour, "Xh Ym" for fractional, "Xh" for exact/100+.
 */
export function formatHltbTime(hours: number | null): string {
  if (hours == null || hours <= 0) return "\u2014";
  if (hours >= 100) return `${Math.round(hours)}h`;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Converts HLTB hours into an "at pace" calendar estimate, rounded up so the
 * number of days always represents enough time to actually finish at that rate.
 * Returns null when there is nothing meaningful to display.
 */
export function formatHltbDays(
  hours: number | null,
  hoursPerDay: number,
): string | null {
  if (hours == null || hours <= 0) return null;
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) return null;
  const days = Math.max(1, Math.ceil(hours / hoursPerDay));
  return `~${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * Compact viewer count for Twitch (Story 19.9): 1.2K, 45.3K, 1.2M.
 */
export function formatViewerCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

