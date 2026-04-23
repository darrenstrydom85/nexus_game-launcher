import * as React from "react";
import { getWrappedReport, getAvailableWrappedPeriods } from "@/lib/tauri";
import type {
  WrappedReport,
  WrappedPeriod,
  AvailableWrappedPeriods,
} from "@/types/wrapped";

export type WrappedPreset =
  | "this_year"
  | "last_year"
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days";

export type PeriodSelection =
  | { kind: "preset"; preset: WrappedPreset }
  | { kind: "year"; year: number }
  | { kind: "custom"; startDate: string; endDate: string };

function selectionToPeriod(sel: PeriodSelection): WrappedPeriod {
  if (sel.kind === "preset") return { preset: sel.preset };
  if (sel.kind === "year") return { year: sel.year };
  return { custom: { startDate: sel.startDate, endDate: sel.endDate } };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayUtcIsoDate(now: Date): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}

function lastDayOfMonth(year: number, month1Indexed: number): number {
  // JS Date with day=0 returns the last day of the previous month.
  return new Date(Date.UTC(year, month1Indexed, 0)).getUTCDate();
}

/**
 * Resolves a {@link PeriodSelection} to a `(startDate, endDate, label)` triple
 * matching the backend's `resolve_period_to_range` for the same selection.
 *
 * Mirrored on the frontend so the Twitch watch slide can hit the inclusive-date
 * watch-history aggregator without round-tripping through the heavier
 * `getWrappedReport` pipeline (watch sessions live in their own table).
 */
export function selectionToDateRange(
  sel: PeriodSelection,
  now: Date = new Date(),
): { startDate: string; endDate: string; label: string } {
  if (sel.kind === "year") {
    return {
      startDate: `${sel.year}-01-01`,
      endDate: `${sel.year}-12-31`,
      label: String(sel.year),
    };
  }
  if (sel.kind === "custom") {
    return {
      startDate: sel.startDate,
      endDate: sel.endDate,
      label: `${sel.startDate} - ${sel.endDate}`,
    };
  }
  const todayIso = todayUtcIsoDate(now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  switch (sel.preset) {
    case "this_month": {
      return {
        startDate: `${y}-${pad2(m)}-01`,
        endDate: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`,
        label: "This month",
      };
    }
    case "last_month": {
      const prevYear = m === 1 ? y - 1 : y;
      const prevMonth = m === 1 ? 12 : m - 1;
      return {
        startDate: `${prevYear}-${pad2(prevMonth)}-01`,
        endDate: `${prevYear}-${pad2(prevMonth)}-${pad2(lastDayOfMonth(prevYear, prevMonth))}`,
        label: "Last month",
      };
    }
    case "this_year":
      return {
        startDate: `${y}-01-01`,
        endDate: `${y}-12-31`,
        label: "This year",
      };
    case "last_year":
      return {
        startDate: `${y - 1}-01-01`,
        endDate: `${y - 1}-12-31`,
        label: "Last year",
      };
    case "last_7_days": {
      const start = new Date(now.getTime() - 6 * 86_400_000);
      return {
        startDate: todayUtcIsoDate(start),
        endDate: todayIso,
        label: "Last 7 days",
      };
    }
    case "last_30_days": {
      const start = new Date(now.getTime() - 29 * 86_400_000);
      return {
        startDate: todayUtcIsoDate(start),
        endDate: todayIso,
        label: "Last 30 days",
      };
    }
  }
}

function defaultSelection(
  available: AvailableWrappedPeriods | null,
): PeriodSelection {
  if (!available) return { kind: "preset", preset: "this_month" };
  if (available.thisMonthHasData) {
    return { kind: "preset", preset: "this_month" };
  }
  if (available.lastMonthHasData) {
    return { kind: "preset", preset: "last_month" };
  }
  if (available.thisYearHasData) {
    return { kind: "preset", preset: "this_year" };
  }
  const currentYear = new Date().getFullYear();
  if (available.lastYearHasData) {
    return { kind: "year", year: currentYear - 1 };
  }
  if (available.yearsWithSessions.length > 0) {
    const sorted = [...available.yearsWithSessions].sort((a, b) => b - a);
    return { kind: "year", year: sorted[0] };
  }
  return { kind: "preset", preset: "this_month" };
}

export interface UseWrappedReturn {
  report: WrappedReport | null;
  available: AvailableWrappedPeriods | null;
  loading: boolean;
  error: string | null;
  selection: PeriodSelection;
  setSelection: (sel: PeriodSelection) => void;
}

export function useWrapped(): UseWrappedReturn {
  const [available, setAvailable] = React.useState<AvailableWrappedPeriods | null>(null);
  const [selection, setSelection] = React.useState<PeriodSelection>({
    kind: "preset",
    preset: "this_month",
  });
  const [report, setReport] = React.useState<WrappedReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const initializedRef = React.useRef(false);

  // Fetch available periods once on mount
  React.useEffect(() => {
    getAvailableWrappedPeriods()
      .then((avail) => {
        setAvailable(avail);
        if (!initializedRef.current) {
          initializedRef.current = true;
          setSelection(defaultSelection(avail));
        }
      })
      .catch(() => {
        initializedRef.current = true;
      });
  }, []);

  // Fetch report whenever selection changes (after initial available load)
  React.useEffect(() => {
    if (!initializedRef.current && available === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWrappedReport(selectionToPeriod(selection))
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[Wrapped] Failed to load report:", err);
          setReport(null);
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err?.message
                ? String(err.message)
                : typeof err === "string"
                  ? err
                  : "Failed to load Wrapped data";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, available]);

  return { report, available, loading, error, selection, setSelection };
}
