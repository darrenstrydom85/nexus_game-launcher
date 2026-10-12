import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "@/stores/gameStore";

export interface DayActivity {
  seconds: number;
  sessions: number;
}

interface ActivityBucket {
  period: string;
  totalTime: number;
  sessionCount: number;
}

/** yyyy-mm-dd in local time, the key `get_activity_data` daily buckets use. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The `count` calendar days ending today, oldest first. */
export function lastDays(count: number, today = new Date()): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (count - 1 - i));
    return d;
  });
}

/**
 * Play time per day, refetched whenever a session ends. `days` is null until
 * loaded; `failed` says the lookup errored, so callers don't show zeros.
 */
export function useDailyActivity(): { days: Map<string, DayActivity> | null; failed: boolean } {
  const sessionEnded = useGameStore((s) => s.lastSessionEndedAt);
  const [days, setDays] = React.useState<Map<string, DayActivity> | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    invoke<ActivityBucket[]>("get_activity_data", { params: { period: "daily" } })
      .then((buckets) => {
        if (cancelled) return;
        setFailed(false);
        setDays(new Map((buckets ?? []).map((b) => [b.period, { seconds: b.totalTime, sessions: b.sessionCount }])));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionEnded]);

  return { days, failed };
}
