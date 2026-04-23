import * as React from "react";
import { useXpStore } from "@/stores/xpStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  rechartsCartesianGridStroke,
  rechartsTooltipContentStyle,
  rechartsTooltipItemStyle,
  rechartsTooltipLabelStyle,
} from "@/lib/recharts-theme";

const DEFAULT_ACCENT = "#7600da";

export function XpOverTimeChart() {
  const history = useXpStore((s) => s.history);
  const accentColor = useSettingsStore((s) => s.accentColor) ?? DEFAULT_ACCENT;

  const dailyData = React.useMemo(() => {
    const buckets = new Map<string, number>();

    for (const event of history) {
      const date = event.createdAt.slice(0, 10);
      buckets.set(date, (buckets.get(date) ?? 0) + event.xpAmount);
    }

    const today = new Date();
    const result: { date: string; xp: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      result.push({ date: label, xp: buckets.get(key) ?? 0 });
    }

    return result;
  }, [history]);

  const hasData = dailyData.some((d) => d.xp > 0);

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card/50 p-4">
        <p className="text-sm text-muted-foreground">No XP earned recently</p>
      </div>
    );
  }

  return (
    <div data-testid="xp-over-time-chart" className="rounded-lg border border-border bg-card/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        XP Over Time (30 Days)
      </h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={dailyData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={rechartsCartesianGridStroke}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={rechartsTooltipContentStyle}
              labelStyle={rechartsTooltipLabelStyle}
              itemStyle={rechartsTooltipItemStyle}
              formatter={(value: number | undefined) => [
                `${(value ?? 0).toLocaleString()} XP`,
                "XP Earned",
              ]}
            />
            <Line
              type="monotone"
              dataKey="xp"
              stroke={accentColor}
              strokeWidth={2}
              dot={{ fill: accentColor, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
