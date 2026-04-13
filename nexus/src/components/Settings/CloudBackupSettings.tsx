import * as React from "react";
import { CloudUpload, RefreshCw, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/stores/toastStore";
import {
  gdriveAuthStart,
  gdriveAuthLogout,
  getBackupStatus,
  runBackup,
  setBackupFrequency,
  setBackupRetention,
  type BackupStatus,
} from "@/lib/tauri";
import { RestoreBackupDialog } from "./RestoreBackupDialog";

const FREQUENCY_OPTIONS = [
  { value: "manual", label: "Manual only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const;

const RETENTION_OPTIONS = [3, 5, 10, 20] as const;

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function CloudBackupSettings() {
  const [status, setStatus] = React.useState<BackupStatus | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const loadStatus = React.useCallback(async () => {
    try {
      const s = await getBackupStatus();
      setStatus(s);
    } catch {
      // Not connected or not configured
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnect = React.useCallback(async () => {
    setConnecting(true);
    try {
      await gdriveAuthStart();
      await loadStatus();
      addToast({ type: "success", message: "Connected to Google Drive.", duration: 3000 });
    } catch {
      addToast({
        type: "error",
        message: "Failed to connect to Google Drive.",
        duration: 5000,
      });
    } finally {
      setConnecting(false);
    }
  }, [addToast, loadStatus]);

  const handleDisconnectConfirm = React.useCallback(async () => {
    setDisconnecting(true);
    try {
      await gdriveAuthLogout();
      setStatus(null);
      setDisconnectDialogOpen(false);
    } finally {
      setDisconnecting(false);
    }
  }, []);

  const handleBackup = React.useCallback(async () => {
    setBackingUp(true);
    try {
      const result = await runBackup();
      const sizeMB = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      addToast({
        type: "success",
        message: `Backup complete (${sizeMB} MB). ${result.prunedCount > 0 ? `${result.prunedCount} old backup(s) removed.` : ""}`,
        duration: 5000,
      });
      await loadStatus();
    } catch {
      addToast({ type: "error", message: "Backup failed.", duration: 5000 });
    } finally {
      setBackingUp(false);
    }
  }, [addToast, loadStatus]);

  const handleFrequencyChange = React.useCallback(
    async (value: string) => {
      try {
        await setBackupFrequency(value);
        setStatus((prev) =>
          prev ? { ...prev, frequency: value as BackupStatus["frequency"] } : prev,
        );
      } catch {
        addToast({ type: "error", message: "Failed to update frequency.", duration: 3000 });
      }
    },
    [addToast],
  );

  const handleRetentionChange = React.useCallback(
    async (value: number) => {
      try {
        await setBackupRetention(value);
        setStatus((prev) => (prev ? { ...prev, retentionCount: value } : prev));
      } catch {
        addToast({ type: "error", message: "Failed to update retention.", duration: 3000 });
      }
    },
    [addToast],
  );

  return (
    <section data-testid="cloud-backup-settings" aria-labelledby="cloud-backup-heading">
      <h3
        id="cloud-backup-heading"
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <CloudUpload className="size-4 shrink-0" aria-hidden />
        Cloud Backup
      </h3>

      <div className="flex flex-col gap-4">
        {/* Connection */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground">Google Drive</span>
          {status?.connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
                aria-hidden
              >
                {(status.email ?? "G").slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-foreground">
                {status.email ?? "Connected"}
              </span>
              <span
                className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500"
                aria-hidden
              >
                Connected
              </span>
              <Button
                type="button"
                variant="outline"
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={() => setDisconnectDialogOpen(true)}
                aria-label="Disconnect Google Drive"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Back up your library, collections, play history, and settings to Google Drive.
              </p>
              <Button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                aria-label="Connect with Google Drive"
                aria-busy={connecting}
              >
                {connecting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                ) : null}
                Connect Google Drive
              </Button>
            </div>
          )}
        </div>

        {status?.connected && (
          <>
            {/* Backup frequency */}
            <div>
              <label
                htmlFor="backup-frequency"
                className="mb-1 block text-sm text-foreground"
              >
                Automatic backup
              </label>
              <select
                id="backup-frequency"
                data-testid="backup-frequency"
                aria-label="How often Nexus backs up to Google Drive"
                className="rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground"
                value={status.frequency}
                onChange={(e) => handleFrequencyChange(e.target.value)}
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                How often Nexus automatically backs up to Google Drive
              </p>
            </div>

            {/* Retention */}
            <div>
              <label
                htmlFor="backup-retention"
                className="mb-1 block text-sm text-foreground"
              >
                Keep backups
              </label>
              <select
                id="backup-retention"
                data-testid="backup-retention"
                aria-label="Number of backups to keep"
                className="rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground"
                value={status.retentionCount}
                onChange={(e) => handleRetentionChange(Number(e.target.value))}
              >
                {RETENTION_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    Last {n} backups
                  </option>
                ))}
              </select>
            </div>

            {/* Last backup */}
            {status.lastBackupAt && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">Last backup: </span>
                <span className="text-xs font-medium text-foreground">
                  {formatRelativeTime(status.lastBackupAt)}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleBackup}
                disabled={backingUp}
                data-testid="backup-now"
                aria-label="Back up now"
              >
                {backingUp ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="mr-2 size-4" aria-hidden />
                )}
                Back Up Now
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRestoreOpen(true)}
                data-testid="restore-backup"
                aria-label="Restore from backup"
              >
                <Download className="mr-2 size-4" aria-hidden />
                Restore
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Disconnect confirmation */}
      {disconnectDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gdrive-disconnect-title"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
            onKeyDown={(e) => {
              if (e.key === "Escape") setDisconnectDialogOpen(false);
            }}
          >
            <h4
              id="gdrive-disconnect-title"
              className="text-sm font-semibold text-foreground"
            >
              Disconnect Google Drive?
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Automatic backups will stop. Your existing backups on Google Drive will not be
              deleted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisconnectDialogOpen(false)}
                aria-label="Cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={handleDisconnectConfirm}
                disabled={disconnecting}
                aria-label="Disconnect"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore dialog */}
      <RestoreBackupDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onRestoreComplete={loadStatus}
      />
    </section>
  );
}
