import { useXpStore } from "@/stores/xpStore";
import { Star, Zap, TrendingUp } from "lucide-react";
import { XpBreakdownChart } from "./XpBreakdownChart";
import { XpHistoryList } from "./XpHistoryList";
import { XpOverTimeChart } from "./XpOverTimeChart";

const RING_SIZE = 80;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function XpLevelSection() {
  const summary = useXpStore((s) => s.summary);
  const loading = useXpStore((s) => s.loading);

  const level = summary?.currentLevel ?? 0;
  const totalXp = summary?.totalXp ?? 0;
  const progress = summary?.progressToNextLevel ?? 0;
  const currentLevelXp = summary?.currentLevelXp ?? 0;
  const nextLevelXp = summary?.nextLevelXp ?? 100;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  if (loading && !summary) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Star className="size-4 text-primary" aria-hidden />
        XP &amp; Level
      </h3>

      {/* Top row: badge + progress bar + stats */}
      <div className="mb-6 flex items-center gap-6">
        {/* Large level badge */}
        <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              className="text-muted-foreground/20"
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-foreground">
            {level}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Level {level}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {totalXp.toLocaleString()} total XP
            </span>
          </div>

          {/* XP progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="size-3" aria-hidden />
              {currentLevelXp.toLocaleString()} XP
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="size-3" aria-hidden />
              {nextLevelXp.toLocaleString()} XP to next
            </span>
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <XpBreakdownChart />
        <XpOverTimeChart />
      </div>

      {/* Recent XP history */}
      <div className="mt-4">
        <XpHistoryList />
      </div>
    </div>
  );
}
