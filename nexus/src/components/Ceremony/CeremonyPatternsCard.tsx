import { Activity } from "lucide-react";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonyPatternsCardProps {
  data: GameCeremonyData;
}

const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function pickPeakIndex(values: number[]): number | null {
  let peakIdx = -1;
  let peakValue = 0;
  values.forEach((v, i) => {
    if (v > peakValue) {
      peakValue = v;
      peakIdx = i;
    }
  });
  return peakIdx >= 0 ? peakIdx : null;
}

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

export function CeremonyPatternsCard({ data }: CeremonyPatternsCardProps) {
  const dowMax = Math.max(1, ...data.playTimeByDayOfWeek);
  const hourMax = Math.max(1, ...data.playTimeByHourOfDay);
  const peakDay = pickPeakIndex(data.playTimeByDayOfWeek);
  const peakHour = pickPeakIndex(data.playTimeByHourOfDay);

  return (
    <div
      data-testid="ceremony-patterns-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8"
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
        <Activity className="size-4" />
        When You Played
      </div>

      <h2 className="max-w-2xl text-center text-3xl font-bold text-foreground">
        {peakDay !== null && peakHour !== null
          ? `${DAY_LABELS[peakDay]} evenings were your thing`
          : "A rhythm of your own"}
      </h2>

      {/* Day-of-week heatmap */}
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          By day of week
        </span>
        <div className="flex items-end justify-between gap-2" data-testid="dow-heatmap">
          {data.playTimeByDayOfWeek.map((v, i) => {
            const intensity = v / dowMax;
            const isPeak = i === peakDay && v > 0;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-md transition-colors"
                  style={{
                    height: `${Math.max(intensity * 64, 4)}px`,
                    background: isPeak
                      ? "var(--primary)"
                      : `hsla(217, 91%, 60%, ${0.15 + intensity * 0.55})`,
                  }}
                  aria-hidden
                />
                <span
                  className={`text-xs tabular-nums ${
                    isPeak ? "font-semibold text-primary" : "text-muted-foreground"
                  }`}
                >
                  {DAY_LABELS[i]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hour-of-day distribution */}
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          By hour of day
        </span>
        <div className="flex items-end justify-between gap-[2px]" data-testid="hour-distribution">
          {data.playTimeByHourOfDay.map((v, i) => {
            const intensity = v / hourMax;
            const isPeak = i === peakHour && v > 0;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-colors"
                style={{
                  height: `${Math.max(intensity * 56, 2)}px`,
                  background: isPeak
                    ? "var(--primary)"
                    : `hsla(217, 91%, 60%, ${0.15 + intensity * 0.5})`,
                }}
                aria-hidden
                title={`${hourLabel(i)}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>12am</span>
          <span>6am</span>
          <span>12pm</span>
          <span>6pm</span>
          <span>11pm</span>
        </div>
      </div>

      {peakHour !== null && data.playTimeByHourOfDay[peakHour] > 0 && (
        <p className="text-sm text-muted-foreground">
          Peak hour:{" "}
          <span className="font-semibold text-foreground">
            {hourLabel(peakHour)}
          </span>
        </p>
      )}
    </div>
  );
}
