import * as React from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvailableWrappedPeriods } from "@/types/wrapped";
import type { PeriodSelection, WrappedPreset } from "@/hooks/useWrapped";
import { DatePicker } from "@/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PeriodSelectorProps {
  selection: PeriodSelection;
  available: AvailableWrappedPeriods | null;
  onChange: (sel: PeriodSelection) => void;
}

interface PresetOption {
  id: WrappedPreset;
  label: string;
  hasData: (a: AvailableWrappedPeriods) => boolean;
}

const PRESETS: PresetOption[] = [
  { id: "this_month", label: "This month", hasData: (a) => a.thisMonthHasData },
  { id: "last_month", label: "Last month", hasData: (a) => a.lastMonthHasData },
  { id: "this_year", label: "This year", hasData: (a) => a.thisYearHasData },
  { id: "last_year", label: "Last year", hasData: (a) => a.lastYearHasData },
  { id: "last_7_days", label: "Last 7 days", hasData: () => true },
  { id: "last_30_days", label: "Last 30 days", hasData: () => true },
];

function shortIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function selectionLabel(sel: PeriodSelection): string {
  if (sel.kind === "preset") return PRESETS.find((p) => p.id === sel.preset)?.label ?? sel.preset;
  if (sel.kind === "year") return String(sel.year);
  return `${shortIso(sel.startDate)} – ${shortIso(sel.endDate)}`;
}

const option = (active: boolean) =>
  cn(
    "flex h-8 items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
  );

/** A compact pill showing the period; the choices open in a popover. */
export function PeriodSelector({ selection, available, onChange }: PeriodSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [customStart, setCustomStart] = React.useState(selection.kind === "custom" ? selection.startDate : "");
  const [customEnd, setCustomEnd] = React.useState(selection.kind === "custom" ? selection.endDate : "");

  const presets = available ? PRESETS.filter((p) => p.hasData(available)) : PRESETS.slice(0, 4);
  const years = available?.yearsWithSessions ?? [];

  const todayStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const isValidRange = customStart.length === 10 && customEnd.length === 10 && customStart <= customEnd;

  const pick = (sel: PeriodSelection) => {
    onChange(sel);
    setOpen(false);
  };

  return (
    <div data-testid="period-selector">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="period-selector-trigger"
            aria-label={`Period: ${selectionLabel(selection)}. Change period`}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full bg-white/12 pl-3 pr-2.5 text-sm font-medium text-white",
              "transition-colors duration-150 hover:bg-white/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            )}
          >
            <CalendarDays className="size-4 text-white/85" aria-hidden="true" />
            <span className="max-w-[16ch] truncate">{selectionLabel(selection)}</span>
            <ChevronDown className="size-4 text-white/85" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="z-50 w-80 p-3">
          <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Period</p>
          <div className="grid grid-cols-2 gap-1">
            {presets.map((p) => {
              const active = selection.kind === "preset" && selection.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`period-preset-${p.id}`}
                  aria-pressed={active}
                  className={option(active)}
                  onClick={() => pick({ kind: "preset", preset: p.id })}
                >
                  {p.label}
                  {active && <Check className="size-3.5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {years.length > 0 && (
            <>
              <p className="px-1 pb-1.5 pt-3 text-xs font-medium text-muted-foreground">Years</p>
              <div className="grid grid-cols-3 gap-1">
                {years.map((year) => {
                  const active = selection.kind === "year" && selection.year === year;
                  return (
                    <button
                      key={year}
                      type="button"
                      data-testid={`period-year-${year}`}
                      aria-pressed={active}
                      className={option(active)}
                      onClick={() => pick({ kind: "year", year })}
                    >
                      {year}
                      {active && <Check className="size-3.5" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <p className="px-1 pb-1.5 pt-3 text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="flex flex-col gap-2 px-1">
            <div className="grid grid-cols-2 gap-2">
              <DatePicker
                data-testid="period-custom-start"
                value={customStart}
                onChange={setCustomStart}
                label="Start date"
                maxDate={customEnd || todayStr}
                popoverClassName="z-[60]"
                triggerClassName="h-8 w-full text-sm"
              />
              <DatePicker
                data-testid="period-custom-end"
                value={customEnd}
                onChange={setCustomEnd}
                label="End date"
                minDate={customStart || undefined}
                maxDate={todayStr}
                popoverClassName="z-[60]"
                triggerClassName="h-8 w-full text-sm"
              />
            </div>
            <button
              type="button"
              data-testid="period-custom-apply"
              disabled={!isValidRange}
              onClick={() => isValidRange && pick({ kind: "custom", startDate: customStart, endDate: customEnd })}
              className={cn(
                "h-8 rounded-md text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isValidRange
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground",
              )}
            >
              Apply range
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
