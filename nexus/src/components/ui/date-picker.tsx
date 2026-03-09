import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function startDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]?.slice(0, 3)} ${d}, ${y}`;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label: string;
  maxDate?: string;
  minDate?: string;
  /** Extra classes on the popover content (e.g. z-index overrides). */
  popoverClassName?: string;
  /** Extra classes on the trigger button. */
  triggerClassName?: string;
  "data-testid"?: string;
}

export function DatePicker({
  value,
  onChange,
  label,
  maxDate,
  minDate,
  popoverClassName,
  triggerClassName,
  "data-testid": testId,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const initialDate = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = React.useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(initialDate.getMonth());

  React.useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  const days = daysInMonth(viewYear, viewMonth);
  const offset = startDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isDisabled = (day: number): boolean => {
    const dateStr = toDateStr(viewYear, viewMonth, day);
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    return false;
  };

  const isSelected = (day: number): boolean => {
    return value === toDateStr(viewYear, viewMonth, day);
  };

  const isToday = (day: number): boolean => {
    const now = new Date();
    return (
      viewYear === now.getFullYear() &&
      viewMonth === now.getMonth() &&
      day === now.getDate()
    );
  };

  const selectDay = (day: number) => {
    if (isDisabled(day)) return;
    onChange(toDateStr(viewYear, viewMonth, day));
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, day: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectDay(day);
    }
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < offset; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }
  for (let d = 1; d <= days; d++) {
    const disabled = isDisabled(d);
    const selected = isSelected(d);
    const today = isToday(d);
    cells.push(
      <button
        key={d}
        type="button"
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => selectDay(d)}
        onKeyDown={(e) => handleKeyDown(e, d)}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "pointer-events-none text-muted-foreground/40",
          selected && "bg-primary text-primary-foreground",
          !selected && !disabled && "text-foreground hover:bg-accent",
          today && !selected && "border border-primary/50",
        )}
        aria-label={`${MONTH_NAMES[viewMonth]} ${d}, ${viewYear}`}
        aria-selected={selected}
      >
        {d}
      </button>,
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-label={label}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value ? "text-foreground" : "text-muted-foreground",
            triggerClassName,
          )}
        >
          {value ? formatDate(value) : label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-auto p-3", popoverClassName)}
        align="start"
        sideOffset={6}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs font-semibold text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {DAY_LABELS.map((d) => (
              <div
                key={d}
                className="flex size-8 items-center justify-center text-[10px] font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendar">
            {cells}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
