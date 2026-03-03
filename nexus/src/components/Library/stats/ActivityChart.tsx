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

const DEFAULT_ACCENT = "#3b82f6";

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
              stroke="hsl(240, 5%, 18%)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(240, 5%, 55%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(240, 5%, 55%)" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(240, 10%, 7%)",
                border: "1px solid hsl(240, 5%, 12%)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke={stroke}
              strokeWidth={2}
              dot={{ fill: stroke, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(240, 10%, 7%)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
