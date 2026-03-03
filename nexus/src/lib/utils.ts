import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a HLTB completion time in seconds to a human-readable string.
 * Returns null for null input or sentinel value -1 (not found).
 *
 * Rules:
 * - < 60 min: "Xm"
 * - >= 60 min: "Xh Ym" (omit minutes if exactly on the hour)
 * - >= 100 hours: "Xh" only
 */
export function formatHltbTime(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes === 0) return null;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (hours >= 100 || minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}
