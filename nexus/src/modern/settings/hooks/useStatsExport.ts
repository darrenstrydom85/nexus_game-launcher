import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { useGameStore } from "@/stores/gameStore";
import { getSystemHardware } from "@/lib/tauri";
import type { StatsDateRange } from "@/lib/statsRange";
import { buildStatsHtml, buildStatsJson, collectAssets, mapRangeToPeriod, type WrappedReport } from "@/lib/statsExport";

export type StatsExportFormat = "html" | "json";

export interface StatsExportProgress {
  current: number;
  total: number;
}

export type StatsExportStatus = { kind: "ok" | "err"; msg: string } | null;

interface ExportZipResult {
  assetsWritten: number;
  assetsFailed: number;
}

const PROGRESS_EVENT = "nexus://stats-export-progress";

function rangeSlug(range: StatsDateRange): string {
  return range === "all" ? "all-time" : `${range.start}_to_${range.end}`;
}

/**
 * Exports stats for a range as a shareable HTML page (zipped with its cover
 * images) or data-only JSON. The Completed section always lists every
 * completed game, whatever the range.
 */
export function useStatsExport(dateRange: StatsDateRange) {
  const [busy, setBusy] = React.useState<StatsExportFormat | null>(null);
  const [status, setStatus] = React.useState<StatsExportStatus>(null);
  const [progress, setProgress] = React.useState<StatsExportProgress | null>(null);

  const prepare = React.useCallback(async () => {
    const resolved = mapRangeToPeriod(dateRange);
    const [report, appVersion, hardware] = await Promise.all([
      invoke<WrappedReport>("get_wrapped_report", { period: resolved.period }),
      getVersion().catch(() => undefined),
      getSystemHardware().catch(() => null),
    ]);
    const allGames = useGameStore.getState().games;
    return {
      resolved,
      report,
      appVersion,
      hardware,
      completedGames: allGames.filter((g) => g.completed),
      playedGames: allGames.filter((g) => g.totalPlayTimeS > 0),
    };
  }, [dateRange]);

  const exportHtml = React.useCallback(async () => {
    setBusy("html");
    setStatus(null);
    setProgress(null);
    let unlisten: UnlistenFn | null = null;
    try {
      const { resolved, report, appVersion, completedGames, playedGames, hardware } = await prepare();
      const { assets, relPathFor, mostPlayedHero, mostPlayedLogo } = collectAssets({ report, completedGames });
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
      unlisten = await listen<StatsExportProgress>(PROGRESS_EVENT, (event) => setProgress(event.payload));
      const result = await invoke<ExportZipResult>("export_stats_zip", { destPath, html, assets });
      const skipped = result.assetsFailed ? `, ${result.assetsFailed} skipped` : "";
      setStatus({ kind: "ok", msg: `Exported HTML · ${result.assetsWritten} images packaged${skipped}.` });
    } catch {
      setStatus({ kind: "err", msg: "HTML export failed. Please try again." });
    } finally {
      if (unlisten) unlisten();
      setProgress(null);
      setBusy(null);
    }
  }, [dateRange, prepare]);

  const exportJson = React.useCallback(async () => {
    setBusy("json");
    setStatus(null);
    try {
      const { resolved, report, appVersion, completedGames, playedGames, hardware } = await prepare();
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

  const clearStatus = React.useCallback(() => setStatus(null), []);

  return { busy, status, progress, exportHtml, exportJson, clearStatus };
}
