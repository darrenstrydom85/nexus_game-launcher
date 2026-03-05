import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { WrappedReport } from "@/types/wrapped";

interface PlayPatternsCardProps {
  report: WrappedReport;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--foreground)",
    fontSize: "11px",
  },
};

function toHours(s: number) {
  return parseFloat((s / 3600).toFixed(1));
}

export function PlayPatternsCard({ report }: PlayPatternsCardProps) {
  const isYearReport = report.playTimeByMonth.length > 1;

  // By Month (year) or By Week (month — 4 buckets by week-of-month)
  const timeData = isYearReport
    ? report.playTimeByMonth.map((b) => ({
        label: MONTH_LABELS[(b.month - 1) % 12],
        hours: toHours(b.playTimeS),
      }))
    : (() => {
        // Group days into 4 weekly buckets
        const weeks = [0, 0, 0, 0];
        report.playTimeByDayOfWeek.forEach((b, i) => {
          weeks[Math.min(Math.floor(i / 2), 3)] += b.playTimeS;
        });
        return weeks.map((s, i) => ({ label: `Wk ${i + 1}`, hours: toHours(s) }));
      })();

  const dowData = report.playTimeByDayOfWeek.map((b) => ({
    label: DOW_LABELS[b.day % 7],
    hours: toHours(b.playTimeS),
  }));

  const hourData = report.playTimeByHourOfDay.map((b) => ({
    label: b.hour,
    hours: toHours(b.playTimeS),
  }));

  const maxHour = Math.max(...hourData.map((d) => d.hours), 0.01);

  return (
    <div
      data-testid="play-patterns-card"
      className="flex h-full flex-col justify-center gap-6 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Play Patterns
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          When you play
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* By Month / By Week */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isYearReport ? "By Month" : "By Week"}
          </p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number | undefined) => [`${v ?? 0}h`, "Hours"]}
                />
                <Bar dataKey="hours" radius={[2, 2, 0, 0]}>
                  {timeData.map((_, i) => (
                    <Cell key={i} fill="var(--primary)" opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Day of Week */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            By Day of Week
          </p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number | undefined) => [`${v ?? 0}h`, "Hours"]}
                />
                <Bar dataKey="hours" radius={[2, 2, 0, 0]}>
                  {dowData.map((_, i) => (
                    <Cell key={i} fill="var(--primary)" opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Hour of Day */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            By Hour of Day
          </p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  ticks={[0, 6, 12, 18, 23]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number | undefined) => [`${v ?? 0}h`, "Hours"]}
                  labelFormatter={(l) => `${l}:00`}
                />
                <Bar dataKey="hours" radius={[1, 1, 0, 0]}>
                  {hourData.map((d, i) => (
                    <Cell
                      key={i}
                      fill="var(--primary)"
                      opacity={0.4 + 0.6 * (d.hours / maxHour)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
