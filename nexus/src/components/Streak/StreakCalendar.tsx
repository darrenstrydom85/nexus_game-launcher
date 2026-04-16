import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StreakCalendarProps {
  playedDates: Set<string>;
  streakStartDate: string | null;
  streakEndDate: string | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDaysArray(count: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

function isInStreakRange(
  date: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false;
  return date >= start && date <= end;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

export function StreakCalendar({
  playedDates,
  streakStartDate,
  streakEndDate,
}: StreakCalendarProps) {
  const days = React.useMemo(() => getDaysArray(91), []);

  const firstDay = new Date(days[0] + "T00:00:00");
  const startDow = (firstDay.getDay() + 6) % 7;
  const paddedDays = [
    ...Array.from<string>({ length: startDow }).fill(""),
    ...days,
  ];

  const weeks: string[][] = [];
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7));
  }

  return (
    <div data-testid="streak-calendar" className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-foreground">Last 90 Days</h4>
      <div className="flex gap-1.5">
        <div className="flex flex-col gap-0.5 pt-5">
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="flex h-3 items-center text-[9px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <TooltipProvider delayDuration={200}>
          <div className="flex gap-0.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map((day, di) => {
                  if (!day) {
                    return (
                      <div key={`empty-${di}`} className="size-3 rounded-sm" />
                    );
                  }
                  const played = playedDates.has(day);
                  const inStreak = isInStreakRange(
                    day,
                    streakStartDate,
                    streakEndDate,
                  );
                  return (
                    <Tooltip key={day}>
                      <TooltipTrigger asChild>
                        <div
                          data-testid={`cal-day-${day}`}
                          className={cn(
                            "size-3 rounded-sm transition-colors duration-100",
                            !played && "bg-muted/40",
                            played && !inStreak && "bg-primary/40",
                            played && inStreak && "bg-primary/80",
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>
                          {formatDate(day)}
                          {played ? " — Played" : " — No activity"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="flex gap-0.5">
          <div className="size-3 rounded-sm bg-muted/40" />
          <div className="size-3 rounded-sm bg-primary/40" />
          <div className="size-3 rounded-sm bg-primary/80" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
