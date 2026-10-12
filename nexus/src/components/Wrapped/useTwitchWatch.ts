import * as React from "react";
import { getTwitchWatchForRange, type WatchAggregate } from "@/lib/tauri";
import { selectionToDateRange, type PeriodSelection } from "@/hooks/useWrapped";

/**
 * Twitch watch time for the selected period. Watch sessions live outside the
 * Wrapped report, so this fetches them separately; null when there is none.
 */
export function useTwitchWatch(selection: PeriodSelection): WatchAggregate | null {
  const { startDate, endDate } = React.useMemo(() => selectionToDateRange(selection), [selection]);
  const [agg, setAgg] = React.useState<WatchAggregate | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setAgg(null);
    getTwitchWatchForRange(startDate, endDate, 5)
      .then((data) => {
        // The backend (or a test mock) can hand back a partial payload.
        if (!cancelled) setAgg(data?.totals && data.totals.totalSecs > 0 ? data : null);
      })
      .catch(() => {
        if (!cancelled) setAgg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  return agg;
}
