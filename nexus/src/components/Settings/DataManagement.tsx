import * as React from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Trash2, AlertTriangle, FolderOpen, Loader2, Timer, Search } from "lucide-react";
import {
  importToast,
  useDataManagement,
  type BulkDeleteResult,
  type ResetMode,
  type ShortSessionsCount,
} from "@/modern/settings/hooks/useDataManagement";
import { useToastStore } from "@/stores/toastStore";

function toastError(message: string) {
  return () => useToastStore.getState().addToast({ type: "error", message });
}

export function DataManagement() {
  const data = useDataManagement();
  const cacheSize = data.cacheSize === undefined ? "..." : (data.cacheSize ?? "N/A");
  const dbPath = data.dataFolder === undefined ? "..." : (data.dataFolder ?? "Unknown");
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(0);
  const [resetMode, setResetMode] = React.useState<ResetMode | null>(null);

  const [shortSessionOpen, setShortSessionOpen] = React.useState(false);
  const [threshold, setThreshold] = React.useState(60);
  const [thresholdUnit, setThresholdUnit] = React.useState<"seconds" | "minutes">("seconds");
  const [preview, setPreview] = React.useState<ShortSessionsCount | null>(null);
  const [deleteResult, setDeleteResult] = React.useState<BulkDeleteResult | null>(null);

  const resetting = data.isBusy("reset");

  const handleExport = () => {
    data.exportLibrary().catch(toastError("Couldn’t export the library. Please try again."));
  };

  const handleImport = () => {
    data
      .importLibrary()
      .then((result) => result && useToastStore.getState().addToast(importToast(result)))
      .catch(toastError("Couldn’t import that file. Check it’s a Nexus library export."));
  };

  const handleClearHistory = () => {
    data
      .clearHistory()
      .catch(toastError("Couldn’t clear play history. Please try again."))
      .finally(() => setConfirmClear(false));
  };

  const thresholdSecs = thresholdUnit === "minutes" ? threshold * 60 : threshold;

  const handlePreviewShortSessions = () => {
    setPreview(null);
    setDeleteResult(null);
    data
      .countShortSessions(thresholdSecs)
      .then(setPreview)
      .catch(toastError("Couldn’t count short sessions. Please try again."));
  };

  const handleDeleteShortSessions = () => {
    data
      .deleteShortSessions(thresholdSecs)
      .then((result) => {
        setDeleteResult(result);
        setPreview(null);
      })
      .catch(toastError("Couldn’t remove short sessions. Please try again."));
  };

  const handleReset = (mode: ResetMode) => {
    setResetMode(mode);
    data
      .reset(mode)
      .catch(toastError("Couldn’t reset Nexus. Please try again."))
      .finally(() => setConfirmReset(0));
  };

  const handleClearCache = () => {
    data.clearCache().catch(toastError("Couldn’t clear the image cache."));
  };

  const handleOpenDbFolder = () => {
    data.openDataFolder().catch(toastError("Couldn’t open the data folder."));
  };

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
            disabled={data.isBusy("export")}
            onClick={handleExport}
          >
            {data.isBusy("export") ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Export Library
          </Button>
          <Button
            data-testid="data-import"
            variant="secondary"
            size="sm"
            className="flex-1 gap-1"
            disabled={data.isBusy("import")}
            onClick={handleImport}
          >
            {data.isBusy("import") ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
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
              disabled={data.isBusy("clearHistory")}
              onClick={handleClearHistory}
            >
              {data.isBusy("clearHistory") ? "Clearing..." : "Yes, clear"}
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
                disabled={data.isBusy("previewShort")}
                onClick={handlePreviewShortSessions}
              >
                {data.isBusy("previewShort") ? (
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
                  disabled={data.isBusy("deleteShort")}
                  onClick={handleDeleteShortSessions}
                >
                  {data.isBusy("deleteShort") ? "Removing..." : "Remove"}
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
                disabled={resetting}
                onClick={() => handleReset("keepStats")}
                className="w-full justify-center"
              >
                {resetting && resetMode === "keepStats" ? "Resetting..." : "Reset, keep play history & API keys"}
              </Button>
              <Button
                data-testid="data-reset-keep-keys"
                size="xs"
                variant="secondary"
                disabled={resetting}
                onClick={() => handleReset("keepKeys")}
                className="w-full justify-center"
              >
                {resetting && resetMode === "keepKeys" ? "Resetting..." : "Reset, keep API keys only"}
              </Button>
              <Button
                data-testid="data-reset-everything"
                size="xs"
                variant="destructive"
                disabled={resetting}
                onClick={() => handleReset("all")}
                className="w-full justify-center"
              >
                {resetting && resetMode === "all" ? "Resetting..." : "Reset everything"}
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
            disabled={data.isBusy("cache")}
            onClick={handleClearCache}
          >
            {data.isBusy("cache") ? "Clearing..." : "Clear"}
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
