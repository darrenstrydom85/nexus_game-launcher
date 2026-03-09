import * as React from "react";
import { cn } from "@/lib/utils";
import type { AvailableWrappedPeriods } from "@/types/wrapped";
import type { PeriodSelection, WrappedPreset } from "@/hooks/useWrapped";
import { DatePicker } from "@/components/ui/date-picker";

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

function isActive(sel: PeriodSelection, preset: WrappedPreset): boolean {
  return sel.kind === "preset" && sel.preset === preset;
}

function isYearActive(sel: PeriodSelection, year: number): boolean {
  return sel.kind === "year" && sel.year === year;
}

export function PeriodSelector({ selection, available, onChange }: PeriodSelectorProps) {
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd, setCustomEnd] = React.useState("");
  const [showCustom, setShowCustom] = React.useState(false);

  const visiblePresets = available
    ? PRESETS.filter((p) => p.hasData(available))
    : PRESETS.slice(0, 4);

  const years = available?.yearsWithSessions ?? [];

  const todayStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const isValidRange = customStart.length === 10 && customEnd.length === 10 && customStart <= customEnd;

  const applyCustom = () => {
    if (isValidRange) {
      onChange({ kind: "custom", startDate: customStart, endDate: customEnd });
      setShowCustom(false);
    }
  };

  return (
    <div
      data-testid="period-selector"
      className="flex flex-wrap items-center gap-2"
    >
      {visiblePresets.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`period-preset-${p.id}`}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive(selection, p.id)
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
          )}
          onClick={() => onChange({ kind: "preset", preset: p.id })}
        >
          {p.label}
        </button>
      ))}

      {years.map((year) => (
        <button
          key={year}
          type="button"
          data-testid={`period-year-${year}`}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isYearActive(selection, year)
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
          )}
          onClick={() => onChange({ kind: "year", year })}
        >
          {year}
        </button>
      ))}

      <button
        type="button"
        data-testid="period-custom-toggle"
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showCustom || selection.kind === "custom"
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
        )}
        onClick={() => setShowCustom((v) => !v)}
      >
        Custom
      </button>

      {showCustom && (
        <div className="flex items-center gap-2">
          <DatePicker
            data-testid="period-custom-start"
            value={customStart}
            onChange={setCustomStart}
            label="Start date"
            maxDate={customEnd || todayStr}
            popoverClassName="z-[46]"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <DatePicker
            data-testid="period-custom-end"
            value={customEnd}
            onChange={setCustomEnd}
            label="End date"
            minDate={customStart || undefined}
            maxDate={todayStr}
            popoverClassName="z-[46]"
          />
          <button
            type="button"
            data-testid="period-custom-apply"
            disabled={!isValidRange}
            onClick={applyCustom}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isValidRange
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
