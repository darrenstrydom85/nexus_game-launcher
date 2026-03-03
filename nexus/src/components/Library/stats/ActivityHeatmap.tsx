import * as React from "react";
import { cn } from "@/lib/utils";
import type { ActivityDataPoint } from "../LibraryStats";

interface ActivityHeatmapProps {
  data: ActivityDataPoint[];
}

function getIntensity(minutes: number): string {
  if (minutes === 0) return "bg-secondary/30";
  if (minutes < 30) return "bg-primary/20";
  if (minutes < 60) return "bg-primary/40";
  if (minutes < 120) return "bg-primary/60";
  return "bg-primary/80";
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const weeks = React.useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => map.set(d.date, d.minutes));

    const result: { date: string; minutes: number }[][] = [];
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 52 * 7);

    let currentWeek: { date: string; minutes: number }[] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().split("T")[0];
      currentWeek.push({ date: dateStr, minutes: map.get(dateStr) ?? 0 });
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) result.push(currentWeek);
    return result;
  }, [data]);

  return (
    <div data-testid="activity-heatmap">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Activity Heatmap
      </h3>
      <div className="flex gap-[2px] overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {week.map((day) => (
              <div
                key={day.date}
                data-testid={`heatmap-cell-${day.date}`}
                className={cn(
                  "size-2.5 rounded-[2px]",
                  getIntensity(day.minutes),
                )}
                title={`${day.date}: ${day.minutes}m`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
