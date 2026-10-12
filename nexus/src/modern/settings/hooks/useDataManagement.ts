import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { formatBytes } from "@/lib/utils";
import { refreshGames } from "@/stores/gameStore";

export interface ShortSessionsCount {
  sessionsCount: number;
  gamesAffected: number;
}

export interface BulkDeleteResult {
  sessionsRemoved: number;
  gamesAffected: number;
}

export interface ImportResult {
  /** Games sent to the library. */
  imported: number;
  /** Games whose status, rating, notes and so on couldn't be put back. */
  detailsFailed: number;
}

/** What a reset keeps: play history and API keys, API keys only, or nothing. */
export type ResetMode = "keepStats" | "keepKeys" | "all";

export type DataAction = "export" | "import" | "clearHistory" | "previewShort" | "deleteShort" | "reset" | "cache";

const RESET_COMMANDS: Record<ResetMode, string> = {
  keepStats: "reset_library_keep_stats",
  keepKeys: "reset_keep_keys",
  all: "reset_all",
};

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

/** A `get_games` row as written by an export. */
type ExportedGame = Record<string, unknown>;

/**
 * The user's own fields, which `confirm_games` doesn't carry, and their value
 * on a newly added game. Names match `update_game`'s fields.
 */
const USER_FIELD_DEFAULTS = {
  status: "backlog",
  rating: null,
  notes: null,
  progress: null,
  milestonesJson: null,
  completed: false,
  isHidden: false,
} as const;

type UserField = keyof typeof USER_FIELD_DEFAULTS;

/** The exported user fields that aren't defaults and aren't already saved, or null when there are none. */
function userFieldsToRestore(exported: ExportedGame, saved: ExportedGame): Partial<Record<UserField, unknown>> | null {
  const fields: Partial<Record<UserField, unknown>> = {};
  for (const key of Object.keys(USER_FIELD_DEFAULTS) as UserField[]) {
    const value = exported[key] ?? USER_FIELD_DEFAULTS[key];
    if (value !== USER_FIELD_DEFAULTS[key] && value !== saved[key]) fields[key] = value;
  }
  // update_game derives `completed` from `status` unless it's sent as well.
  if (fields.status !== undefined) fields.completed = exported.completed ?? false;
  return Object.keys(fields).length > 0 ? fields : null;
}

/** Saves `get_games` as JSON. Resolves false when the user cancels the save dialog. */
export async function exportLibraryFile(): Promise<boolean> {
  const games = await invoke<unknown[]>("get_games", { params: {} });
  const filePath = await save({ defaultPath: "nexus-library.json", filters: JSON_FILTER });
  if (!filePath) return false;
  await writeTextFile(filePath, JSON.stringify(games, null, 2));
  return true;
}

/**
 * Feeds a library export back through `confirm_games`, puts back each game's
 * status, rating, notes and progress, re-links play sessions and reloads the
 * library. Resolves null when the user cancels the open dialog. Throws on
 * unreadable or non-array files.
 */
export async function importLibraryFile(): Promise<ImportResult | null> {
  const filePath = await openDialog({ multiple: false, filters: JSON_FILTER });
  if (!filePath || typeof filePath !== "string") return null;
  const rows: unknown = JSON.parse(await readTextFile(filePath));
  if (!Array.isArray(rows)) throw new Error("Not a Nexus library export");
  // Removed games are uninstalled ones kept for their stats; confirm_games would bring them back.
  const games = (rows as ExportedGame[]).filter((g) => g?.status !== "removed");
  // The Rust command takes `detected_games`; Tauri expects the camelCase key.
  // It returns the saved games in input order.
  const saved = await invoke<ExportedGame[]>("confirm_games", { detectedGames: games });
  const restores = games.flatMap((game, i) => {
    const fields = userFieldsToRestore(game, saved[i]);
    return fields ? [invoke("update_game", { id: saved[i].id, fields })] : [];
  });
  const results = await Promise.allSettled(restores);
  // The games are saved at this point; re-linking old sessions is a bonus, not a reason to report failure.
  await invoke("relink_play_sessions").catch(() => {});
  await refreshGames();
  return { imported: games.length, detailsFailed: results.filter((r) => r.status === "rejected").length };
}

/** One toast for an import: the count, and how many games lost their details if any did. */
export function importToast(result: ImportResult): { type: "success" | "error"; message: string } {
  const games = `${result.imported} ${result.imported === 1 ? "game" : "games"}`;
  if (result.detailsFailed === 0) return { type: "success", message: `Imported ${games}.` };
  const failed = `${result.detailsFailed} ${result.detailsFailed === 1 ? "game" : "games"}`;
  return { type: "error", message: `Imported ${games}, but couldn’t restore the status, rating or notes of ${failed}.` };
}

/**
 * Library export/import, session cleanup, resets, the image cache and the data
 * folder. Shared by the classic Data panel and the v1 Data & health section.
 * Actions reject on failure so each surface decides how to report it.
 */
export function useDataManagement() {
  const [running, setRunning] = React.useState<ReadonlySet<DataAction>>(() => new Set());
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

  // Each action clears only itself, so one finishing never re-enables another's buttons.
  const track = React.useCallback(async <T>(key: DataAction, work: () => Promise<T>): Promise<T> => {
    setRunning((prev) => new Set(prev).add(key));
    try {
      return await work();
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const isBusy = React.useCallback((key: DataAction) => running.has(key), [running]);

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
    /** Whether that action is still running. */
    isBusy,
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
