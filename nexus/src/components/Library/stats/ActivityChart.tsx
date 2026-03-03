import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ActivityDataPoint } from "../LibraryStats";

type TimeRange = "weekly" | "monthly" | "yearly";

interface ActivityChartProps {
  data: ActivityDataPoint[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  const [range, setRange] = React.useState<TimeRange>("weekly");

  const filteredData = React.useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    if (range === "weekly") cutoff.setDate(now.getDate() - 7);
    else if (range === "monthly") cutoff.setMonth(now.getMonth() - 1);
    else cutoff.setFullYear(now.getFullYear() - 1);

    return data.filter((d) => new Date(d.date) >= cutoff);
  }, [data, range]);

  const toggleClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div data-testid="activity-chart">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Play Activity
        </h3>
        <div className="flex gap-1" data-testid="activity-chart-toggle">
          {(["weekly", "monthly", "yearly"] as TimeRange[]).map((r) => (
            <button
              key={r}
              data-testid={`activity-range-${r}`}
              className={toggleClass(range === r)}
              onClick={() => setRange(r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={filteredData}>
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
            <Bar
              dataKey="minutes"
              fill="hsl(217, 91%, 60%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
