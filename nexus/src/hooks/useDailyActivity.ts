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

/** Play time per day, refetched whenever a session ends. Null until loaded. */
export function useDailyActivity(): Map<string, DayActivity> | null {
  const sessionEnded = useGameStore((s) => s.lastSessionEndedAt);
  const [days, setDays] = React.useState<Map<string, DayActivity> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    invoke<ActivityBucket[]>("get_activity_data", { params: { period: "daily" } })
      .then((buckets) => {
        if (cancelled) return;
        setDays(new Map((buckets ?? []).map((b) => [b.period, { seconds: b.totalTime, sessions: b.sessionCount }])));
      })
      .catch(() => {
        if (!cancelled) setDays(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [sessionEnded]);

  return days;
}
