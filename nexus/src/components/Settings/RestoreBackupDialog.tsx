import * as React from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/stores/toastStore";
import { listBackups, restoreBackup, type BackupEntry } from "@/lib/tauri";

interface RestoreBackupDialogProps {
  open: boolean;
  onClose: () => void;
  onRestoreComplete: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RestoreBackupDialog({
  open,
  onClose,
  onRestoreComplete,
}: RestoreBackupDialogProps) {
  const [backups, setBackups] = React.useState<BackupEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const addToast = useToastStore((s) => s.addToast);

  React.useEffect(() => {
    if (!open) {
      setBackups([]);
      setError(null);
      setConfirmId(null);
      return;
    }
    setLoading(true);
    setError(null);
    listBackups()
      .then((entries) => setBackups(entries))
      .catch(() => setError("Failed to load backups from Google Drive."))
      .finally(() => setLoading(false));
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmId) {
          setConfirmId(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, confirmId, onClose]);

  const handleRestore = React.useCallback(
    async (backupId: string) => {
      setRestoring(true);
      try {
        await restoreBackup(backupId);
        addToast({
          type: "success",
          message: "Library restored from backup successfully.",
          duration: 5000,
        });
        onRestoreComplete();
        onClose();
      } catch {
        addToast({
          type: "error",
          message: "Restore failed. Your current library is unchanged.",
          duration: 5000,
        });
      } finally {
        setRestoring(false);
        setConfirmId(null);
      }
    },
    [addToast, onClose, onRestoreComplete],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h4
          id="restore-dialog-title"
          className="mb-4 text-sm font-semibold text-foreground"
        >
          Restore from Backup
        </h4>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && backups.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No backups found on Google Drive.
          </p>
        )}

        {!loading && !error && backups.length > 0 && (
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {backups.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {formatDate(entry.createdAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(entry.size)} · Schema v{entry.schemaVersion}
                  </span>
                </div>
                {confirmId === entry.id ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirmId(null)}
                      disabled={restoring}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="h-7 bg-destructive/10 px-2 text-xs text-destructive hover:bg-destructive/20"
                      onClick={() => handleRestore(entry.id)}
                      disabled={restoring}
                    >
                      {restoring ? (
                        <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
                      ) : (
                        <AlertTriangle className="mr-1 size-3" aria-hidden />
                      )}
                      Confirm
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmId(entry.id)}
                    disabled={restoring}
                    aria-label={`Restore backup from ${formatDate(entry.createdAt)}`}
                  >
                    <Download className="mr-1 size-3" aria-hidden />
                    Restore
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {confirmId && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" aria-hidden />
            <p className="text-xs text-yellow-200">
              This will replace your current library with the backup. This action cannot be
              undone.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={restoring}
            aria-label="Close"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
