import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthBucket, DayBucket } from "@/types/wrapped";
import { formatPlayTime } from "@/lib/utils";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface PatternsTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { label: string; playTimeS: number } }>;
}

function PatternsTooltip({ active, payload }: PatternsTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg border border-white/10 px-3 py-2 text-xs backdrop-blur-md"
      style={{ background: "hsla(240, 10%, 7%, 0.85)", minWidth: 120 }}
      data-testid="patterns-tooltip"
    >
      <p className="mb-0.5 font-semibold text-foreground">{d.label}</p>
      <p className="text-muted-foreground">
        <span className="tabular-nums text-foreground">{formatPlayTime(d.playTimeS)}</span>
      </p>
    </div>
  );
}

interface SessionPatternsChartsProps {
  playTimeByMonth: MonthBucket[];
  playTimeByDayOfWeek: DayBucket[];
  averageGapDays: number;
  totalSessions: number;
  accentColor?: string;
}

const DEFAULT_ACCENT = "#3B82F6";

export function SessionPatternsCharts({
  playTimeByMonth,
  playTimeByDayOfWeek,
  averageGapDays,
  totalSessions,
  accentColor = DEFAULT_ACCENT,
}: SessionPatternsChartsProps) {
  const monthData = React.useMemo(
    () =>
      playTimeByMonth.map((b) => ({
        label: MONTH_LABELS[b.month - 1] ?? `M${b.month}`,
        playTimeS: b.playTimeS,
      })),
    [playTimeByMonth],
  );

  const dayData = React.useMemo(() => {
    const totalWeeks = Math.max(playTimeByMonth.length, 1);
    return playTimeByDayOfWeek.map((b) => ({
      label: DAY_LABELS[b.day] ?? `D${b.day}`,
      playTimeS: Math.round(b.playTimeS / totalWeeks),
    }));
  }, [playTimeByDayOfWeek, playTimeByMonth.length]);

  return (
    <div data-testid="session-patterns" className="flex flex-col gap-5">
      {/* By Month */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">By Month</h4>
        <div style={{ width: "100%", height: 140 }} data-testid="chart-by-month">
          <ResponsiveContainer>
            <BarChart data={monthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "hsl(240, 5%, 55%)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "hsl(240, 5%, 55%)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
                tickFormatter={(v: number) => formatPlayTime(v)}
              />
              <Tooltip content={<PatternsTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="playTimeS" fill={accentColor} fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By Day of Week */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">By Day of Week</h4>
        <div style={{ width: "100%", height: 120 }} data-testid="chart-by-day">
          <ResponsiveContainer>
            <BarChart data={dayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "hsl(240, 5%, 55%)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "hsl(240, 5%, 55%)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
                tickFormatter={(v: number) => formatPlayTime(v)}
              />
              <Tooltip content={<PatternsTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="playTimeS" fill={accentColor} fillOpacity={0.7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Return Rate */}
      <div
        data-testid="return-rate"
        className="rounded-lg border border-border bg-card/50 px-3 py-2.5 text-xs text-muted-foreground"
      >
        {totalSessions >= 2 ? (
          <p>
            You return to this game every{" "}
            <span className="tabular-nums font-semibold text-foreground">
              {Math.round(averageGapDays)}
            </span>{" "}
            days on average
          </p>
        ) : (
          <p data-testid="return-rate-insufficient">
            Play more to see return rate
          </p>
        )}
      </div>
    </div>
  );
}
