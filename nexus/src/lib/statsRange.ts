/**
 * Shared date-range helpers for the stats surfaces (the Library Stats page and
 * the Settings "Export Stats" section). Dates are `YYYY-MM-DD` local-calendar
 * strings, matching the backend's `date_only_to_start_epoch_secs` parser.
 */

export type StatsDateRange = "all" | { start: string; end: string };

export type StatsPreset =
  | "this_week"
  | "this_month"
  | "last_30_days"
  | "this_year"
  | "all";

/** Formats a Date as a local `YYYY-MM-DD` string. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns the range covering the 1st of the current month through today. */
export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  return {
    start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    end: toDateStr(now),
  };
}

/** Resolves a preset id into a concrete {@link StatsDateRange}. */
export function getPresetRange(preset: StatsPreset): StatsDateRange {
  if (preset === "all") return "all";
  const now = new Date();
  const todayStr = toDateStr(now);
  switch (preset) {
    case "this_week": {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(monday.getDate() - mondayOffset);
      return { start: toDateStr(monday), end: todayStr };
    }
    case "this_month":
      return getCurrentMonthRange();
    case "last_30_days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start: toDateStr(start), end: todayStr };
    }
    case "this_year":
      return { start: `${now.getFullYear()}-01-01`, end: todayStr };
  }
}

export const PRESETS: { id: StatsPreset; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_year", label: "This year" },
  { id: "all", label: "All time" },
];
