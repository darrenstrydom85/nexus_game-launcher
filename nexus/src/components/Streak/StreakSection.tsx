import * as React from "react";
import { cn } from "@/lib/utils";
import { Flame, Trophy, CalendarDays } from "lucide-react";
import { useStreakStore } from "@/stores/streakStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { invoke } from "@tauri-apps/api/core";
import { StreakCalendar } from "./StreakCalendar";

interface ActivityBucket {
  period: string;
  totalTime: number;
  sessionCount: number;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const fmt = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  if (!end || start === end) return fmt(start);
  return `${fmt(start)} — ${fmt(end)}`;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function StreakSection() {
  const streak = useStreakStore((s) => s.streak);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [playedDates, setPlayedDates] = React.useState<Set<string>>(new Set());

  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;

  const intensity =
    currentStreak <= 0
      ? "none"
      : currentStreak < 7
        ? "ember"
        : currentStreak < 30
          ? "blaze"
          : "inferno";

  React.useEffect(() => {
    let cancelled = false;
    async function fetchActivity() {
      try {
        const buckets = await invoke<ActivityBucket[]>("get_activity_data", {
          params: { period: "daily" },
        });
        if (cancelled) return;
        const dates = new Set(
          buckets.filter((b) => b.sessionCount > 0).map((b) => b.period),
        );
        setPlayedDates(dates);
      } catch {
        // leave empty
      }
    }
    fetchActivity();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      data-testid="streak-section"
      id="streak-section"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
    >
      <h3 className="text-lg font-semibold text-foreground">Streaks</h3>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Current streak */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-4">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-md",
              intensity === "none" && "bg-muted/20 text-muted-foreground",
              intensity === "ember" && "bg-yellow-500/10 text-yellow-500",
              intensity === "blaze" && "bg-orange-400/10 text-orange-400",
              intensity === "inferno" && "bg-primary/10 text-primary",
            )}
          >
            <Flame
              className={cn(
                "size-5",
                !reducedMotion && intensity === "blaze" && "animate-streak-flicker",
                !reducedMotion && intensity === "inferno" && "animate-streak-inferno",
              )}
            />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {currentStreak}
            </p>
            <p className="text-xs text-muted-foreground">Current Streak</p>
          </div>
        </div>

        {/* Longest streak */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Trophy className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {longestStreak}
            </p>
            <p className="text-xs text-muted-foreground">Longest Streak</p>
          </div>
        </div>

        {/* Streak started */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {streak?.streakStartedAt
                ? formatDateRange(streak.streakStartedAt, todayStr())
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Streak Started</p>
          </div>
        </div>
      </div>

      {/* Calendar heatmap */}
      <StreakCalendar
        playedDates={playedDates}
        streakStartDate={streak?.streakStartedAt ?? null}
        streakEndDate={currentStreak > 0 ? todayStr() : null}
      />
    </div>
  );
}
