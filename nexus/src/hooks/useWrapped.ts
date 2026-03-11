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
