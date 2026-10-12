import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { formatBytes } from "@/lib/utils";

export interface ShortSessionsCount {
  sessionsCount: number;
  gamesAffected: number;
}

export interface BulkDeleteResult {
  sessionsRemoved: number;
  gamesAffected: number;
}

/** What a reset keeps: play history and API keys, API keys only, or nothing. */
export type ResetMode = "keepStats" | "keepKeys" | "all";

export type DataBusy = "export" | "import" | "clearHistory" | "previewShort" | "deleteShort" | "reset" | "cache" | null;

const RESET_COMMANDS: Record<ResetMode, string> = {
  keepStats: "reset_library_keep_stats",
  keepKeys: "reset_keep_keys",
  all: "reset_all",
};

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

/** Saves `get_games` as JSON. Resolves false when the user cancels the save dialog. */
export async function exportLibraryFile(): Promise<boolean> {
  const games = await invoke<unknown[]>("get_games", { params: {} });
  const filePath = await save({ defaultPath: "nexus-library.json", filters: JSON_FILTER });
  if (!filePath) return false;
  await writeTextFile(filePath, JSON.stringify(games, null, 2));
  return true;
}

/**
 * Feeds a library export back through `confirm_games`, then re-links play
 * sessions to the new rows. Resolves the number of games imported, or null
 * when the user cancels the open dialog. Throws on unreadable or non-array files.
 */
export async function importLibraryFile(): Promise<number | null> {
  const filePath = await openDialog({ multiple: false, filters: JSON_FILTER });
  if (!filePath || typeof filePath !== "string") return null;
  const games: unknown = JSON.parse(await readTextFile(filePath));
  if (!Array.isArray(games)) throw new Error("Not a Nexus library export");
  // The Rust command takes `detected_games`; Tauri expects the camelCase key.
  await invoke("confirm_games", { detectedGames: games });
  await invoke("relink_play_sessions");
  return games.length;
}

/**
 * Library export/import, session cleanup, resets, the image cache and the data
 * folder. Shared by the classic Data panel and the v1 Data & health section.
 * Actions reject on failure so each surface decides how to report it.
 */
export function useDataManagement() {
  const [busy, setBusy] = React.useState<DataBusy>(null);
  const [cacheBytes, setCacheBytes] = React.useState<number | null | undefined>(undefined);
  const [dataFolder, setDataFolder] = React.useState<string | null | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    invoke<{ totalBytes: number }>("get_cache_stats", {})
      .then((stats) => !cancelled && setCacheBytes(stats.totalBytes))
      .catch(() => !cancelled && setCacheBytes(null));
    invoke<{ path: string }>("get_db_status")
      .then((status) => !cancelled && setDataFolder(status.path.replace(/[/\\][^/\\]+$/, "")))
      .catch(() => !cancelled && setDataFolder(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const track = React.useCallback(async <T>(key: Exclude<DataBusy, null>, work: () => Promise<T>): Promise<T> => {
    setBusy(key);
    try {
      return await work();
    } finally {
      setBusy(null);
    }
  }, []);

  const exportLibrary = React.useCallback(() => track("export", exportLibraryFile), [track]);
  const importLibrary = React.useCallback(() => track("import", importLibraryFile), [track]);
  const clearHistory = React.useCallback(() => track("clearHistory", () => invoke<void>("clear_play_history")), [track]);
  const countShortSessions = React.useCallback(
    (thresholdSecs: number) => track("previewShort", () => invoke<ShortSessionsCount>("count_short_sessions", { thresholdSecs })),
    [track],
  );
  const deleteShortSessions = React.useCallback(
    (thresholdSecs: number) => track("deleteShort", () => invoke<BulkDeleteResult>("bulk_delete_short_sessions", { thresholdSecs })),
    [track],
  );

  /** Wipes data for the mode, then reloads into a fresh start. */
  const reset = React.useCallback(
    (mode: ResetMode) =>
      track("reset", async () => {
        await invoke(RESET_COMMANDS[mode]);
        localStorage.clear();
        window.location.reload();
      }),
    [track],
  );

  const clearCache = React.useCallback(
    () =>
      track("cache", async () => {
        await invoke("clear_cache");
        setCacheBytes(0);
      }),
    [track],
  );

  const openDataFolder = React.useCallback(async () => {
    if (dataFolder) await invoke("open_data_folder");
  }, [dataFolder]);

  return {
    busy,
    /** undefined while loading, null when unavailable. */
    cacheSize: cacheBytes === undefined ? undefined : cacheBytes === null ? null : formatBytes(cacheBytes),
    /** undefined while loading, null when unknown. */
    dataFolder,
    exportLibrary,
    importLibrary,
    clearHistory,
    countShortSessions,
    deleteShortSessions,
    reset,
    clearCache,
    openDataFolder,
  };
}
