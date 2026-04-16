import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import { LineChart } from "lucide-react";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonyTimelineCardProps {
  data: GameCeremonyData;
}

const FULL_MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Human-readable full label, e.g. "March 2026". Used in headings & callouts. */
function toFullLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || m < 1 || m > 12) return isoMonth;
  return `${FULL_MONTH[m - 1]} ${y}`;
}

/**
 * Compact label for the chart x-axis (keeps full 4-digit year so it reads as
 * "Mar 2026", not "Mar 26"). Short month avoids tick overlap when there are
 * many months on the axis.
 */
function toAxisLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || m < 1 || m > 12) return isoMonth;
  return `${SHORT_MONTH[m - 1]} ${y}`;
}

export function CeremonyTimelineCard({ data }: CeremonyTimelineCardProps) {
  const chartData = data.playTimeByMonth.map((b) => ({
    month: b.month,
    label: toFullLabel(b.month),
    hours: Math.round((b.playTimeS / 3600) * 10) / 10,
  }));

  let peak = { month: "", label: "", hours: 0 };
  for (const d of chartData) {
    if (d.hours > peak.hours) {
      peak = { month: d.month, label: d.label, hours: d.hours };
    }
  }

  return (
    <div
      data-testid="ceremony-timeline-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8"
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
        <LineChart className="size-4" />
        Over Time
      </div>

      <h2 className="max-w-2xl text-center text-3xl font-bold text-foreground">
        {peak.hours > 0
          ? `Your biggest month was ${peak.label}`
          : "Steady and consistent"}
      </h2>

      <div className="h-64 w-full max-w-3xl">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 12, right: 12, bottom: 8, left: -12 }}
          >
            <defs>
              <linearGradient
                id="ceremonyTimelineFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tickFormatter={(v: string) => toAxisLabel(v)}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => toFullLabel(String(v ?? ""))}
              formatter={(v) => [`${v} h`, "Play time"]}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#ceremonyTimelineFill)"
              isAnimationActive
              animationDuration={900}
            />
            {peak.hours > 0 && (
              <ReferenceDot
                x={peak.month}
                y={peak.hours}
                r={5}
                fill="var(--primary)"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {peak.hours > 0 && (
        <p className="text-sm text-muted-foreground">
          Peak:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {peak.hours}h
          </span>{" "}
          in {peak.label}
        </p>
      )}
    </div>
  );
}
