import * as React from "react";
import { useXpStore } from "@/stores/xpStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  rechartsBarCursorFill,
  rechartsTooltipContentStyle,
  rechartsTooltipItemStyle,
  rechartsTooltipLabelStyle,
} from "@/lib/recharts-theme";

const DEFAULT_ACCENT = "#7600da";

const SOURCE_LABELS: Record<string, string> = {
  session_complete: "Sessions",
  session_bonus_1h: "Session Bonus",
  achievement_unlock: "Achievements",
  game_complete: "Completions",
  streak_day: "Streaks",
  game_launch: "Launches",
  goal_complete: "Goals",
};

export function XpBreakdownChart() {
  const breakdown = useXpStore((s) => s.breakdown);
  const accentColor = useSettingsStore((s) => s.accentColor) ?? DEFAULT_ACCENT;

  const data = React.useMemo(
    () =>
      breakdown.map((row) => ({
        name: SOURCE_LABELS[row.sourceType] ?? row.sourceType,
        xp: row.totalXp,
        count: row.eventCount,
        sourceType: row.sourceType,
      })),
    [breakdown],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card/50 p-4">
        <p className="text-sm text-muted-foreground">No XP data yet</p>
      </div>
    );
  }

  return (
    <div data-testid="xp-breakdown-chart" className="rounded-lg border border-border bg-card/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        XP by Source
      </h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: rechartsBarCursorFill, radius: 4 }}
              contentStyle={rechartsTooltipContentStyle}
              labelStyle={rechartsTooltipLabelStyle}
              itemStyle={rechartsTooltipItemStyle}
              formatter={(value: number | undefined) => [
                `${(value ?? 0).toLocaleString()} XP`,
                "XP Earned",
              ]}
            />
            <Bar
              dataKey="xp"
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
              fill={accentColor}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
