import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ActivityDataPoint } from "../LibraryStats";
import {
  rechartsCartesianGridStroke,
  rechartsTooltipContentStyle,
  rechartsTooltipItemStyle,
  rechartsTooltipLabelStyle,
} from "@/lib/recharts-theme";

const DEFAULT_ACCENT = "#7600da";

export interface ActivityChartProps {
  data: ActivityDataPoint[];
  /** Theme accent color (hex). Uses settings selection when provided. */
  accentColor?: string;
}

export function ActivityChart({ data, accentColor = DEFAULT_ACCENT }: ActivityChartProps) {
  const stroke = accentColor;

  return (
    <div data-testid="activity-chart">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Play Activity
      </h3>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
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
            />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke={stroke}
              strokeWidth={2}
              dot={{ fill: stroke, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
