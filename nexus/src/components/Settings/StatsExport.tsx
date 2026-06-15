import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { FileCode2, FileJson, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { getSystemHardware } from "@/lib/tauri";
import {
  PRESETS,
  getPresetRange,
  toDateStr,
  type StatsDateRange,
  type StatsPreset,
} from "@/lib/statsRange";
import {
  buildStatsHtml,
  buildStatsJson,
  collectAssets,
  mapRangeToPeriod,
  type WrappedReport,
} from "@/lib/statsExport";

interface ExportZipResult {
  assetsWritten: number;
  assetsFailed: number;
}

interface ExportProgress {
  current: number;
  total: number;
}

const PROGRESS_EVENT = "nexus://stats-export-progress";

type BusyKind = "html" | "json" | null;
type Status = { kind: "ok" | "err"; msg: string } | null;

function rangeSlug(range: StatsDateRange): string {
  return range === "all" ? "all-time" : `${range.start}_to_${range.end}`;
}

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
  const [busy, setBusy] = React.useState<BusyKind>(null);
  const [status, setStatus] = React.useState<Status>(null);
  const [progress, setProgress] = React.useState<ExportProgress | null>(null);

  const todayStr = React.useMemo(() => toDateStr(new Date()), []);
  const isValidRange =
    rangeStart.length === 10 && rangeEnd.length === 10 && rangeStart <= rangeEnd;

  const handlePreset = (preset: StatsPreset) => {
    setActivePreset(preset);
    setShowCustom(false);
    setStatus(null);
    setDateRange(getPresetRange(preset));
  };

  const applyRange = () => {
    if (!isValidRange) return;
    setActivePreset(null);
    setStatus(null);
    setDateRange({ start: rangeStart, end: rangeEnd });
  };

  const prepare = React.useCallback(async () => {
    const resolved = mapRangeToPeriod(dateRange);
    const [report, appVersion, hardware] = await Promise.all([
      invoke<WrappedReport>("get_wrapped_report", { period: resolved.period }),
      getVersion().catch(() => undefined),
      getSystemHardware().catch(() => null),
    ]);
    const allGames = useGameStore.getState().games;
    const completedGames = allGames.filter((g) => g.completed);
    const playedGames = allGames.filter((g) => g.totalPlayTimeS > 0);
    return {
      resolved,
      report,
      appVersion,
      completedGames,
      playedGames,
      hardware,
    };
  }, [dateRange]);

  const handleExportHtml = React.useCallback(async () => {
    setBusy("html");
    setStatus(null);
    setProgress(null);
    let unlisten: UnlistenFn | null = null;
    try {
      const {
        resolved,
        report,
        appVersion,
        completedGames,
        playedGames,
        hardware,
      } = await prepare();
      const { assets, relPathFor, mostPlayedHero, mostPlayedLogo } =
        collectAssets({ report, completedGames });
      const html = buildStatsHtml({
        report,
        completedGames,
        playedGames,
        relPathFor,
        mostPlayedHero,
        mostPlayedLogo,
        periodLabel: resolved.label,
        generatedAt: new Date().toISOString(),
        appVersion,
        cpuName: hardware?.cpuBrand !== "unknown" ? hardware?.cpuName : undefined,
        gpuName: hardware?.gpuBrand !== "unknown" ? hardware?.gpuName : undefined,
      });
      const destPath = await save({
        defaultPath: `nexus-stats-${rangeSlug(dateRange)}.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!destPath) return;
      setProgress({ current: 0, total: assets.length });
      unlisten = await listen<ExportProgress>(PROGRESS_EVENT, (event) => {
        setProgress(event.payload);
      });
      const result = await invoke<ExportZipResult>("export_stats_zip", {
        destPath,
        html,
        assets,
      });
      const skipped = result.assetsFailed
        ? `, ${result.assetsFailed} skipped`
        : "";
      setStatus({
        kind: "ok",
        msg: `Exported HTML · ${result.assetsWritten} images packaged${skipped}.`,
      });
    } catch {
      setStatus({ kind: "err", msg: "HTML export failed. Please try again." });
    } finally {
      if (unlisten) unlisten();
      setProgress(null);
      setBusy(null);
    }
  }, [dateRange, prepare]);

  const handleExportJson = React.useCallback(async () => {
    setBusy("json");
    setStatus(null);
    try {
      const { resolved, report, appVersion, completedGames, playedGames, hardware } =
        await prepare();
      const json = buildStatsJson({
        report,
        completedGames,
        playedGames,
        hardware: hardware
          ? {
              cpu: hardware.cpuBrand !== "unknown" ? hardware.cpuName : null,
              gpu: hardware.gpuBrand !== "unknown" ? hardware.gpuName : null,
            }
          : null,
        period: resolved,
        generatedAt: new Date().toISOString(),
        appVersion,
      });
      const destPath = await save({
        defaultPath: `nexus-stats-${rangeSlug(dateRange)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destPath) return;
      await writeTextFile(destPath, json);
      setStatus({ kind: "ok", msg: "Exported JSON." });
    } catch {
      setStatus({ kind: "err", msg: "JSON export failed. Please try again." });
    } finally {
      setBusy(null);
    }
  }, [dateRange, prepare]);

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
