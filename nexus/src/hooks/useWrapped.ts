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
  if (!available) return { kind: "preset", preset: "this_year" };
  const currentYear = new Date().getFullYear();
  if (available.lastYearHasData) {
    return { kind: "year", year: currentYear - 1 };
  }
  if (available.thisYearHasData) {
    return { kind: "preset", preset: "this_year" };
  }
  if (available.lastMonthHasData) {
    return { kind: "preset", preset: "last_month" };
  }
  if (available.thisMonthHasData) {
    return { kind: "preset", preset: "this_month" };
  }
  if (available.yearsWithSessions.length > 0) {
    const sorted = [...available.yearsWithSessions].sort((a, b) => b - a);
    return { kind: "year", year: sorted[0] };
  }
  return { kind: "preset", preset: "this_year" };
}

export interface UseWrappedReturn {
  report: WrappedReport | null;
  available: AvailableWrappedPeriods | null;
  loading: boolean;
  selection: PeriodSelection;
  setSelection: (sel: PeriodSelection) => void;
}

export function useWrapped(): UseWrappedReturn {
  const [available, setAvailable] = React.useState<AvailableWrappedPeriods | null>(null);
  const [selection, setSelection] = React.useState<PeriodSelection>({
    kind: "preset",
    preset: "this_year",
  });
  const [report, setReport] = React.useState<WrappedReport | null>(null);
  const [loading, setLoading] = React.useState(true);
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
    getWrappedReport(selectionToPeriod(selection))
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, available]);

  return { report, available, loading, selection, setSelection };
}
