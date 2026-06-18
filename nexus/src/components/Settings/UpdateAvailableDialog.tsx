import * as React from "react";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";

export interface UpdateAvailableDialogProps {
  open: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function UpdateAvailableDialog({ open, onClose }: UpdateAvailableDialogProps) {
  const latestVersion = useUpdateStore((s) => s.latestVersion);
  const phase = useUpdateStore((s) => s.phase);
  const downloadedBytes = useUpdateStore((s) => s.downloadedBytes);
  const totalBytes = useUpdateStore((s) => s.totalBytes);
  const downloadAndInstall = useUpdateStore((s) => s.downloadAndInstall);
  const restart = useUpdateStore((s) => s.restart);
  const dismissUpdatePopup = useUpdateStore((s) => s.dismissUpdatePopup);

  const handleInstall = React.useCallback(() => {
    downloadAndInstall().catch(() => {});
  }, [downloadAndInstall]);

  const handleRestart = React.useCallback(() => {
    restart().catch(() => {});
  }, [restart]);

  const handleNotNow = React.useCallback(() => {
    dismissUpdatePopup();
    onClose();
  }, [dismissUpdatePopup, onClose]);

  if (!open) return null;

  const isDownloading = phase === "downloading";
  const isReady = phase === "ready";
  const isError = phase === "error";
  const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
      aria-describedby="update-dialog-desc"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !isDownloading) handleNotNow();
        }}
      >
        <h4 id="update-dialog-title" className="text-sm font-semibold text-foreground">
          {isReady ? "Update ready" : "Update available"}
        </h4>

        {isReady ? (
          <p id="update-dialog-desc" className="mt-2 text-sm text-muted-foreground">
            Version {latestVersion ?? ""} has been installed. Restart Nexus to finish updating.
          </p>
        ) : isError ? (
          <p id="update-dialog-desc" className="mt-2 text-sm text-destructive">
            The update could not be downloaded. Check your connection and try again.
          </p>
        ) : (
          <p id="update-dialog-desc" className="mt-2 text-sm text-muted-foreground">
            Version {latestVersion ?? ""} is available. Nexus can download and install it for you.
          </p>
        )}

        {isDownloading && (
          <div className="mt-3" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              Downloading… {formatBytes(downloadedBytes)}
              {totalBytes > 0 ? ` / ${formatBytes(totalBytes)} (${percent}%)` : ""}
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {isReady ? (
            <Button type="button" onClick={handleRestart} aria-label="Restart now">
              Restart now
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleNotNow}
                disabled={isDownloading}
                aria-label="Not now"
              >
                Not now
              </Button>
              <Button
                type="button"
                onClick={handleInstall}
                disabled={isDownloading}
                aria-label={isError ? "Retry update" : "Download and install"}
              >
                {isDownloading ? "Downloading…" : isError ? "Retry" : "Download & install"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
