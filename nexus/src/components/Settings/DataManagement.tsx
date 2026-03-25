import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Download, Upload, Trash2, AlertTriangle, FolderOpen, Loader2, Timer, Search } from "lucide-react";

interface CacheStats {
  totalBytes: number;
  gameBytes: number | null;
}

interface DbStatus {
  connected: boolean;
  version: number;
  path: string;
}

interface ShortSessionsCount {
  sessionsCount: number;
  gamesAffected: number;
}

interface BulkDeleteResult {
  sessionsRemoved: number;
  gamesAffected: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function DataManagement() {
  const [cacheSize, setCacheSize] = React.useState("...");
  const [dbPath, setDbPath] = React.useState("...");
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [shortSessionOpen, setShortSessionOpen] = React.useState(false);
  const [threshold, setThreshold] = React.useState(60);
  const [thresholdUnit, setThresholdUnit] = React.useState<"seconds" | "minutes">("seconds");
  const [preview, setPreview] = React.useState<ShortSessionsCount | null>(null);
  const [deleteResult, setDeleteResult] = React.useState<BulkDeleteResult | null>(null);

  React.useEffect(() => {
    invoke<CacheStats>("get_cache_stats", {}).then((stats) => {
      setCacheSize(formatBytes(stats.totalBytes));
    }).catch(() => setCacheSize("N/A"));

    invoke<DbStatus>("get_db_status").then((status) => {
      const dir = status.path.replace(/[/\\][^/\\]+$/, "");
      setDbPath(dir);
    }).catch(() => setDbPath("Unknown"));
  }, []);

  const handleExport = React.useCallback(async () => {
    setBusy("export");
    try {
      const games = await invoke<unknown[]>("get_games", { params: {} });
      const json = JSON.stringify(games, null, 2);
      const filePath = await save({
        defaultPath: "nexus-library.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, json);
      }
    } catch {
      // user cancelled or write error
    } finally {
      setBusy(null);
    }
  }, []);

  const handleImport = React.useCallback(async () => {
    setBusy("import");
    try {
      const filePath = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        const content = await readTextFile(filePath as string);
        const games = JSON.parse(content);
        if (Array.isArray(games)) {
          await invoke("confirm_games", { games });
          await invoke("relink_play_sessions");
        }
      }
    } catch {
      // user cancelled or parse error
    } finally {
      setBusy(null);
    }
  }, []);

  const handleClearHistory = React.useCallback(async () => {
    setBusy("clearHistory");
    try {
      await invoke("clear_play_history");
    } catch {
      // best-effort
    } finally {
      setBusy(null);
      setConfirmClear(false);
    }
  }, []);

  const thresholdSecs = thresholdUnit === "minutes" ? threshold * 60 : threshold;

  const handlePreviewShortSessions = React.useCallback(async () => {
    setBusy("previewShort");
    setPreview(null);
    setDeleteResult(null);
    try {
      const result = await invoke<ShortSessionsCount>("count_short_sessions", { thresholdSecs });
      setPreview(result);
    } catch {
      // best-effort
    } finally {
      setBusy(null);
    }
  }, [thresholdSecs]);

  const handleDeleteShortSessions = React.useCallback(async () => {
    setBusy("deleteShort");
    try {
      const result = await invoke<BulkDeleteResult>("bulk_delete_short_sessions", { thresholdSecs });
      setDeleteResult(result);
      setPreview(null);
    } catch {
      // best-effort
    } finally {
      setBusy(null);
    }
  }, [thresholdSecs]);

  const handleReset = React.useCallback(async (mode: "keepStats" | "keepKeys" | "all") => {
    const busyKey = mode === "keepStats" ? "resetKeepStats" : mode === "keepKeys" ? "resetKeepKeys" : "reset";
    setBusy(busyKey);
    try {
      const command = mode === "keepStats"
        ? "reset_library_keep_stats"
        : mode === "keepKeys"
          ? "reset_keep_keys"
          : "reset_all";
      await invoke(command);
      localStorage.clear();
      window.location.reload();
    } catch {
      // best-effort
    } finally {
      setBusy(null);
      setConfirmReset(0);
    }
  }, []);

  const handleClearCache = React.useCallback(async () => {
    setBusy("cache");
    try {
      await invoke("clear_cache");
      setCacheSize("0 B");
    } catch {
      // best-effort
    } finally {
      setBusy(null);
    }
  }, []);

  const handleOpenDbFolder = React.useCallback(async () => {
    if (dbPath && dbPath !== "..." && dbPath !== "Unknown") {
      try {
        await openPath(dbPath);
      } catch {
        // best-effort
      }
    }
  }, [dbPath]);

  return (
    <section data-testid="data-management">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Data</h3>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            data-testid="data-export"
            variant="secondary"
            size="sm"
            className="flex-1 gap-1"
            disabled={busy === "export"}
            onClick={handleExport}
          >
            {busy === "export" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Export Library
          </Button>
          <Button
            data-testid="data-import"
            variant="secondary"
            size="sm"
            className="flex-1 gap-1"
            disabled={busy === "import"}
            onClick={handleImport}
          >
            {busy === "import" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Import Library
          </Button>
        </div>

        {/* Clear play history */}
        {!confirmClear ? (
          <Button
            data-testid="data-clear-history"
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="size-3.5" /> Clear Play History
          </Button>
        ) : (
          <div data-testid="data-clear-confirm" className="flex items-center gap-2 rounded-md border border-warning bg-warning/10 p-2">
            <AlertTriangle className="size-4 text-warning" />
            <span className="flex-1 text-xs text-foreground">This will delete all play sessions. Are you sure?</span>
            <Button
              size="xs"
              variant="destructive"
              disabled={busy === "clearHistory"}
              onClick={handleClearHistory}
            >
              {busy === "clearHistory" ? "Clearing..." : "Yes, clear"}
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Remove short sessions */}
        {!shortSessionOpen ? (
          <Button
            data-testid="data-short-sessions"
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() => {
              setShortSessionOpen(true);
              setPreview(null);
              setDeleteResult(null);
            }}
          >
            <Timer className="size-3.5" /> Remove Short Sessions
          </Button>
        ) : (
          <div
            data-testid="data-short-sessions-panel"
            className="rounded-md border border-border bg-secondary/20 p-3"
          >
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                Remove sessions shorter than
              </label>
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => {
                  setThreshold(Math.max(1, parseInt(e.target.value) || 1));
                  setPreview(null);
                  setDeleteResult(null);
                }}
                className="h-7 w-16 rounded-md border border-border bg-background px-2 text-xs text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex rounded-md border border-border">
                <button
                  type="button"
                  className={`px-2 py-1 text-xs transition-colors ${
                    thresholdUnit === "seconds"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setThresholdUnit("seconds");
                    setPreview(null);
                    setDeleteResult(null);
                  }}
                >
                  sec
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs transition-colors ${
                    thresholdUnit === "minutes"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setThresholdUnit("minutes");
                    setPreview(null);
                    setDeleteResult(null);
                  }}
                >
                  min
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Button
                size="xs"
                variant="secondary"
                className="gap-1"
                disabled={busy === "previewShort"}
                onClick={handlePreviewShortSessions}
              >
                {busy === "previewShort" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Search className="size-3" />
                )}
                Preview
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setShortSessionOpen(false);
                  setPreview(null);
                  setDeleteResult(null);
                }}
              >
                Cancel
              </Button>
            </div>

            {preview !== null && preview.sessionsCount > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-warning bg-warning/10 p-2">
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                <span className="flex-1 text-xs text-foreground">
                  {preview.sessionsCount} session{preview.sessionsCount !== 1 ? "s" : ""} across{" "}
                  {preview.gamesAffected} game{preview.gamesAffected !== 1 ? "s" : ""} will be
                  removed. Play time will be recalculated.
                </span>
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy === "deleteShort"}
                  onClick={handleDeleteShortSessions}
                >
                  {busy === "deleteShort" ? "Removing..." : "Remove"}
                </Button>
              </div>
            )}

            {preview !== null && preview.sessionsCount === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No sessions found below that threshold.
              </p>
            )}

            {deleteResult !== null && (
              <p className="mt-2 text-xs text-green-500">
                Removed {deleteResult.sessionsRemoved} session
                {deleteResult.sessionsRemoved !== 1 ? "s" : ""} across{" "}
                {deleteResult.gamesAffected} game{deleteResult.gamesAffected !== 1 ? "s" : ""}.
                Play time has been recalculated.
              </p>
            )}
          </div>
        )}

        {/* Reset Nexus */}
        {confirmReset === 0 && (
          <Button
            data-testid="data-reset"
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setConfirmReset(1)}
          >
            <Trash2 className="size-3.5" /> Reset Nexus
          </Button>
        )}
        {confirmReset === 1 && (
          <div data-testid="data-reset-confirm-1" className="rounded-md border border-destructive bg-destructive/10 p-2 text-center">
            <p className="text-xs text-foreground">This will delete ALL data. Are you sure?</p>
            <div className="mt-2 flex justify-center gap-2">
              <Button size="xs" variant="destructive" onClick={() => setConfirmReset(2)}>
                Yes, I'm sure
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setConfirmReset(0)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {confirmReset === 2 && (
          <div data-testid="data-reset-confirm-2" className="rounded-md border border-destructive bg-destructive/10 p-3">
            <p className="text-xs font-bold text-destructive text-balance">FINAL WARNING: This cannot be undone!</p>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">Choose what to preserve. Play history can be re-linked after re-importing your library.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              <Button
                data-testid="data-reset-keep-stats"
                size="xs"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => handleReset("keepStats")}
                className="w-full justify-center"
              >
                {busy === "resetKeepStats" ? "Resetting..." : "Reset, keep play history & API keys"}
              </Button>
              <Button
                data-testid="data-reset-keep-keys"
                size="xs"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => handleReset("keepKeys")}
                className="w-full justify-center"
              >
                {busy === "resetKeepKeys" ? "Resetting..." : "Reset, keep API keys only"}
              </Button>
              <Button
                data-testid="data-reset-everything"
                size="xs"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => handleReset("all")}
                className="w-full justify-center"
              >
                {busy === "reset" ? "Resetting..." : "Reset everything"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmReset(0)} className="w-full justify-center">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Cache */}
        <div className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Cache: {cacheSize}</span>
          <Button
            data-testid="data-clear-cache"
            variant="ghost"
            size="xs"
            disabled={busy === "cache"}
            onClick={handleClearCache}
          >
            {busy === "cache" ? "Clearing..." : "Clear"}
          </Button>
        </div>

        {/* DB location */}
        <div className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
          <code className="text-xs text-muted-foreground">{dbPath}</code>
          <button
            data-testid="data-open-db"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleOpenDbFolder}
          >
            <FolderOpen className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
