import * as React from "react";
import { cn } from "@/lib/utils";
import type { ActivityDataPoint } from "../LibraryStats";
import type { StatsDateRange } from "../LibraryStats";

interface ActivityHeatmapProps {
  data: ActivityDataPoint[];
  dateRange?: StatsDateRange;
}

function getIntensity(minutes: number): string {
  if (minutes === 0) return "bg-secondary/30";
  if (minutes < 30) return "bg-primary/20";
  if (minutes < 60) return "bg-primary/40";
  if (minutes < 120) return "bg-primary/60";
  return "bg-primary/80";
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

export function ActivityHeatmap({ data, dateRange }: ActivityHeatmapProps) {
  const { weeks, monthLabels } = React.useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => map.set(d.date, d.minutes));

    const today = new Date();
    let endDate = today;
    let startDate: Date;

    if (dateRange && dateRange !== "all") {
      startDate = new Date(dateRange.start + "T00:00:00");
      const rangeEnd = new Date(dateRange.end + "T00:00:00");
      endDate = rangeEnd < today ? rangeEnd : today;
    } else {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 52 * 7);
    }

    // Align start to the previous Monday for clean week columns
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - mondayOffset);

    const result: { date: string; minutes: number }[][] = [];
    const months: { label: string; weekIndex: number }[] = [];
    let currentWeek: { date: string; minutes: number }[] = [];
    let lastMonth = -1;
    const cursor = new Date(startDate);

    while (cursor <= endDate) {
      const dateStr = toLocalDateStr(cursor);
      currentWeek.push({ date: dateStr, minutes: map.get(dateStr) ?? 0 });

      if (currentWeek.length === 1) {
        const m = cursor.getMonth();
        if (m !== lastMonth) {
          const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          months.push({ label: MONTH_NAMES[m], weekIndex: result.length });
          lastMonth = m;
        }
      }

      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) result.push(currentWeek);

    return { weeks: result, monthLabels: months };
  }, [data, dateRange]);

  return (
    <div data-testid="activity-heatmap">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Activity Heatmap
      </h3>
      <div className="flex gap-0 overflow-x-auto">
        {/* Day-of-week labels */}
        <div className="mr-1 flex shrink-0 flex-col gap-[2px] pt-4">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="flex h-2.5 items-center">
              <span className="text-[9px] leading-none text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-0">
          {/* Month labels */}
          <div className="relative mb-1 flex h-3">
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="absolute text-[9px] leading-none text-muted-foreground"
                style={{ left: m.weekIndex * (10 + 2) }}
              >
                {m.label}
              </span>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-[2px]">
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
      </div>
    </div>
  );
}
