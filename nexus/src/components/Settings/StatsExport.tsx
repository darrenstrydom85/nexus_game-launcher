import * as React from "react";
import { FileCode2, FileJson, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import {
  PRESETS,
  getPresetRange,
  toDateStr,
  type StatsDateRange,
  type StatsPreset,
} from "@/lib/statsRange";
import { useStatsExport } from "@/modern/settings/hooks/useStatsExport";

/**
 * Settings section that exports the user's stats for a chosen date range as
 * either a shareable HTML page (zipped with its cover images) or a data-only
 * JSON document. The "Completed" section is always fully populated regardless
 * of the selected range.
 */
export function StatsExport() {
  const [dateRange, setDateRange] = React.useState<StatsDateRange>("all");
  const [activePreset, setActivePreset] = React.useState<StatsPreset | null>("all");
  const [showCustom, setShowCustom] = React.useState(false);
  const [rangeStart, setRangeStart] = React.useState("");
  const [rangeEnd, setRangeEnd] = React.useState("");
  const { busy, status, progress, exportHtml: handleExportHtml, exportJson: handleExportJson, clearStatus } = useStatsExport(dateRange);

  const todayStr = React.useMemo(() => toDateStr(new Date()), []);
  const isValidRange =
    rangeStart.length === 10 && rangeEnd.length === 10 && rangeStart <= rangeEnd;

  const handlePreset = (preset: StatsPreset) => {
    setActivePreset(preset);
    setShowCustom(false);
    clearStatus();
    setDateRange(getPresetRange(preset));
  };

  const applyRange = () => {
    if (!isValidRange) return;
    setActivePreset(null);
    clearStatus();
    setDateRange({ start: rangeStart, end: rangeEnd });
  };

  return (
    <section data-testid="stats-export">
      <h3 className="mb-1 text-sm font-semibold text-foreground">Export Stats</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Export your stats for a date range as a shareable HTML page (zipped with
        its cover images) or machine-readable JSON. The Completed section always
        includes every completed game. Everything stays on your machine.
      </p>

      <div
        data-testid="stats-export-range"
        className="mb-3 flex flex-wrap items-center gap-2"
      >
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid={`stats-export-range-${p.id}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activePreset === p.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
            )}
            onClick={() => handlePreset(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          data-testid="stats-export-range-custom-toggle"
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showCustom || (activePreset === null && dateRange !== "all")
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
          )}
          onClick={() => setShowCustom((v) => !v)}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DatePicker
            data-testid="stats-export-range-start"
            value={rangeStart}
            onChange={setRangeStart}
            label="Start date"
            maxDate={rangeEnd || todayStr}
            triggerClassName="h-8"
          />
          <span className="text-xs text-muted-foreground">&ndash;</span>
          <DatePicker
            data-testid="stats-export-range-end"
            value={rangeEnd}
            onChange={setRangeEnd}
            label="End date"
            minDate={rangeStart || undefined}
            maxDate={todayStr}
            triggerClassName="h-8"
          />
          <Button
            size="sm"
            variant="secondary"
            data-testid="stats-export-range-apply"
            disabled={!isValidRange}
            onClick={applyRange}
          >
            Apply
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          data-testid="stats-export-html"
          variant="secondary"
          size="sm"
          className="flex-1 gap-1"
          disabled={busy !== null}
          onClick={handleExportHtml}
        >
          {busy === "html" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileCode2 className="size-3.5" />
          )}
          Export HTML (.zip)
        </Button>
        <Button
          data-testid="stats-export-json"
          variant="secondary"
          size="sm"
          className="flex-1 gap-1"
          disabled={busy !== null}
          onClick={handleExportJson}
        >
          {busy === "json" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileJson className="size-3.5" />
          )}
          Export JSON
        </Button>
      </div>

      {busy === "html" && progress && (
        <div data-testid="stats-export-progress" className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{
                width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.total > 0
              ? `Packaging images ${progress.current}/${progress.total}`
              : "Preparing export…"}
          </p>
        </div>
      )}

      {status && (
        <p
          data-testid="stats-export-status"
          className={cn(
            "mt-2 text-xs",
            status.kind === "ok" ? "text-success" : "text-destructive",
          )}
        >
          {status.msg}
        </p>
      )}
    </section>
  );
}
