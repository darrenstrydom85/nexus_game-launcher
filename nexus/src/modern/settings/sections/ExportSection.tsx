import * as React from "react";
import { CalendarRange, Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { PRESETS, getPresetRange, toDateStr, type StatsDateRange, type StatsPreset } from "@/lib/statsRange";
import { formatDayRange } from "@/lib/statsData";
import { SettingsCard, SettingsRow } from "../SettingsKit";
import { useStatsExport, type StatsExportFormat } from "../hooks/useStatsExport";

type RangeChoice = StatsPreset | "custom";

const FORMATS: { value: StatsExportFormat; label: string }[] = [
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
];

const FORMAT_DESCRIPTIONS: Record<StatsExportFormat, string> = {
  html: "A shareable page, zipped with its cover images",
  json: "Machine-readable data for spreadsheets and scripts",
};

export function ExportSection() {
  const [choice, setChoice] = React.useState<RangeChoice>("all");
  const [range, setRange] = React.useState<StatsDateRange>("all");
  const [format, setFormat] = React.useState<StatsExportFormat>("html");
  const exporter = useStatsExport(range);
  const { clearStatus } = exporter;

  const choosePreset = React.useCallback(
    (preset: StatsPreset) => {
      setChoice(preset);
      setRange(getPresetRange(preset));
      clearStatus();
    },
    [clearStatus],
  );

  const applyCustom = React.useCallback(
    (start: string, end: string) => {
      if (start.length !== 10 || end.length !== 10 || start > end) return false;
      setChoice("custom");
      setRange({ start, end });
      clearStatus();
      return true;
    },
    [clearStatus],
  );

  const rangeName =
    choice === "custom" ? "Custom range" : choice === "all" ? "Since your first session" : (PRESETS.find((p) => p.id === choice)?.label ?? "");
  const pct =
    exporter.progress && exporter.progress.total > 0 ? Math.round((exporter.progress.current / exporter.progress.total) * 100) : null;

  const downloadDescription = exporter.busy
    ? exporter.progress
      ? exporter.progress.total > 0
        ? `Packaging images ${exporter.progress.current} of ${exporter.progress.total}`
        : "Preparing export…"
      : "Gathering your stats…"
    : exporter.status
      ? exporter.status.msg
      : "Everything stays on this PC";

  return (
    <SettingsCard title="Export" data-testid="stats-export">
      <SettingsRow label="Date range" description={rangeName}>
        <span data-testid="stats-export-range-value" className="text-[13px] tabular-nums text-foreground">
          {range === "all" ? "All time" : formatDayRange(range)}
        </span>
      </SettingsRow>
      <SettingsRow label="Change range" description="Pick a preset or your own dates. Completed games are always included in full.">
        <RangePicker choice={choice} range={range} onPreset={choosePreset} onApply={applyCustom} />
      </SettingsRow>
      <SettingsRow label="Format" description={FORMAT_DESCRIPTIONS[format]}>
        <SegmentedControl
          aria-label="Export format"
          value={format}
          onValueChange={(f) => {
            setFormat(f);
            clearStatus();
          }}
          options={FORMATS}
        />
      </SettingsRow>
      <SettingsRow
        label="Download export"
        description={
          <span
            role="status"
            data-testid="stats-export-status"
            className={cn(!exporter.busy && exporter.status && (exporter.status.kind === "ok" ? "text-success" : "text-destructive"))}
          >
            {downloadDescription}
          </span>
        }
      >
        <Button
          size="sm"
          data-testid="stats-export-download"
          disabled={exporter.busy !== null}
          onClick={() => void (format === "html" ? exporter.exportHtml() : exporter.exportJson())}
        >
          {exporter.busy ? (
            <Loader2 className="size-3.5 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <Download className="size-3.5" strokeWidth={2} />
          )}
          {exporter.busy ? "Exporting…" : "Export"}
        </Button>
      </SettingsRow>
      {exporter.busy === "html" && pct != null && (
        <div className="px-[18px] py-3" data-testid="stats-export-progress">
          <span
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="block h-1.5 overflow-hidden rounded-full bg-secondary"
          >
            <span
              className="block h-full origin-left rounded-full bg-primary transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </span>
        </div>
      )}
    </SettingsCard>
  );
}

/** "Change" popover: presets apply at once; custom dates apply with the button. */
function RangePicker({
  choice,
  range,
  onPreset,
  onApply,
}: {
  choice: RangeChoice;
  range: StatsDateRange;
  onPreset: (preset: StatsPreset) => void;
  onApply: (start: string, end: string) => boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState(range === "all" ? "" : range.start);
  const [end, setEnd] = React.useState(range === "all" ? "" : range.end);
  const today = React.useMemo(() => toDateStr(new Date()), []);
  const valid = start.length === 10 && end.length === 10 && start <= end;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="stats-export-change-range">
          <CalendarRange className="size-3.5" strokeWidth={1.75} />
          Change
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 flex w-auto flex-col gap-3 p-3">
        <div role="group" aria-label="Presets" className="flex flex-col gap-px">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`stats-export-range-${p.id}`}
              aria-pressed={choice === p.id}
              onClick={() => {
                onPreset(p.id);
                setOpen(false);
              }}
              className={cn(
                "flex h-8 items-center justify-between gap-6 rounded-md px-2.5 text-left text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                choice === p.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {p.label}
              {choice === p.id && <Check className="size-3.5" strokeWidth={1.75} aria-hidden />}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[12.5px] font-medium text-muted-foreground">Custom dates</span>
          <div className="flex items-center gap-2">
            <DatePicker
              data-testid="stats-export-range-start"
              value={start}
              onChange={setStart}
              label="Start date"
              maxDate={end || today}
              popoverClassName="z-[60]"
            />
            <span aria-hidden className="text-xs text-muted-foreground">
              –
            </span>
            <DatePicker
              data-testid="stats-export-range-end"
              value={end}
              onChange={setEnd}
              label="End date"
              minDate={start || undefined}
              maxDate={today}
              popoverClassName="z-[60]"
            />
          </div>
          <Button
            size="sm"
            data-testid="stats-export-range-apply"
            disabled={!valid}
            onClick={() => onApply(start, end) && setOpen(false)}
          >
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
