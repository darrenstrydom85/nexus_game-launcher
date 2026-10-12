import * as React from "react";
import { useToastStore } from "@/stores/toastStore";
import {
  gdriveAuthLogout,
  gdriveAuthStart,
  getBackupStatus,
  listBackups,
  restoreBackup,
  runBackup,
  setBackupFrequency,
  setBackupRetention,
  type BackupEntry,
  type BackupStatus,
} from "@/lib/tauri";

export type BackupFrequency = BackupStatus["frequency"];

export const BACKUP_FREQUENCIES: { value: BackupFrequency; label: string }[] = [
  { value: "manual", label: "Manual only" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export const BACKUP_RETENTION_OPTIONS = [3, 5, 10, 20] as const;

/** How long "Connecting…" waits on the browser sign-in before giving up. */
export const CONNECT_TIMEOUT_MS = 3 * 60_000;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago". */
export function formatBackupAge(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

/** Google Drive connection, schedule, retention and manual backups. */
export function useCloudBackup() {
  const [status, setStatus] = React.useState<BackupStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);
  const addToast = useToastStore((s) => s.addToast);
  // Bumped by Cancel and the timeout, so a sign-in the user gave up on can't flip the button back.
  const connectAttempt = React.useRef(0);

  const loadStatus = React.useCallback(async () => {
    try {
      setStatus(await getBackupStatus());
    } catch {
      // Not connected or not configured.
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const connect = React.useCallback(async () => {
    const attempt = ++connectAttempt.current;
    const current = () => connectAttempt.current === attempt;
    setConnecting(true);
    const timer = setTimeout(() => {
      if (!current()) return;
      connectAttempt.current++;
      setConnecting(false);
      addToast({ type: "info", message: "Google Drive sign-in timed out. Try connecting again.", duration: 5000 });
    }, CONNECT_TIMEOUT_MS);
    try {
      await gdriveAuthStart();
      // A sign-in finished after Cancel still connected, so show it either way.
      await loadStatus();
      addToast({ type: "success", message: "Connected to Google Drive.", duration: 3000 });
    } catch {
      if (current()) addToast({ type: "error", message: "Couldn’t connect to Google Drive.", duration: 5000 });
    } finally {
      clearTimeout(timer);
      if (current()) setConnecting(false);
    }
  }, [addToast, loadStatus]);

  /** Stops waiting on a browser sign-in the user abandoned. */
  const cancelConnect = React.useCallback(() => {
    connectAttempt.current++;
    setConnecting(false);
  }, []);

  /** Signs out of Google Drive. Resolves to whether it worked. */
  const disconnect = React.useCallback(async () => {
    setDisconnecting(true);
    try {
      await gdriveAuthLogout();
      setStatus(null);
      return true;
    } catch {
      addToast({ type: "error", message: "Couldn’t disconnect Google Drive.", duration: 5000 });
      return false;
    } finally {
      setDisconnecting(false);
    }
  }, [addToast]);

  const backUpNow = React.useCallback(async () => {
    setBackingUp(true);
    try {
      const result = await runBackup();
      const sizeMB = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      const pruned =
        result.prunedCount > 0 ? ` Removed ${result.prunedCount} old ${result.prunedCount === 1 ? "backup" : "backups"}.` : "";
      addToast({ type: "success", message: `Backed up to Google Drive (${sizeMB} MB).${pruned}`, duration: 5000 });
      await loadStatus();
    } catch {
      addToast({ type: "error", message: "Backup failed.", duration: 5000 });
    } finally {
      setBackingUp(false);
    }
  }, [addToast, loadStatus]);

  const setFrequency = React.useCallback(
    async (frequency: BackupFrequency) => {
      try {
        await setBackupFrequency(frequency);
        setStatus((prev) => (prev ? { ...prev, frequency } : prev));
      } catch {
        addToast({ type: "error", message: "Couldn’t change the backup schedule.", duration: 3000 });
      }
    },
    [addToast],
  );

  const setRetention = React.useCallback(
    async (count: number) => {
      try {
        await setBackupRetention(count);
        setStatus((prev) => (prev ? { ...prev, retentionCount: count } : prev));
      } catch {
        addToast({ type: "error", message: "Couldn’t change how many backups to keep.", duration: 3000 });
      }
    },
    [addToast],
  );

  return {
    status,
    loaded,
    connected: !!status?.connected,
    connecting,
    disconnecting,
    backingUp,
    reload: loadStatus,
    connect,
    cancelConnect,
    disconnect,
    backUpNow,
    setFrequency,
    setRetention,
  };
}

/** The backups on Google Drive while `open`, and restoring one of them. */
export function useBackupList(open: boolean) {
  const [backups, setBackups] = React.useState<BackupEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  React.useEffect(() => {
    if (!open) {
      setBackups([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listBackups()
      .then((entries) => !cancelled && setBackups(entries))
      .catch(() => !cancelled && setError("Couldn’t load your backups from Google Drive."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Replaces the current library with a backup. Resolves to whether it worked. */
  const restore = React.useCallback(
    async (backupId: string) => {
      setRestoringId(backupId);
      try {
        await restoreBackup(backupId);
        addToast({ type: "success", message: "Library restored from backup.", duration: 5000 });
        return true;
      } catch {
        addToast({ type: "error", message: "Restore failed. Your current library is unchanged.", duration: 5000 });
        return false;
      } finally {
        setRestoringId(null);
      }
    },
    [addToast],
  );

  return { backups, loading, error, restoringId, restoring: restoringId !== null, restore };
}

export function formatBackupDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
