import * as React from "react";
import * as Radix from "radix-ui";
import { Check, CloudUpload, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatBytes } from "@/lib/utils";
import type { BackupEntry } from "@/lib/tauri";
import {
  BACKUP_FREQUENCIES,
  BACKUP_RETENTION_OPTIONS,
  formatBackupAge,
  formatBackupDate,
  useBackupList,
  useCloudBackup,
  type BackupFrequency,
} from "../hooks/useCloudBackup";
import { DANGER_BUTTON, SettingsCard, SettingsRow } from "../SettingsKit";

const D = Radix.Dialog;

export function BackupSection() {
  const backup = useCloudBackup();
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const { status } = backup;

  if (!backup.loaded) {
    return (
      <SettingsCard title="Google Drive" data-testid="cloud-backup-settings">
        <SettingsRow label="Checking Google Drive…" />
      </SettingsCard>
    );
  }

  if (!status?.connected) {
    return (
      <SettingsCard title="Google Drive" data-testid="cloud-backup-settings">
        <SettingsRow
          label="Not connected"
          description={
            backup.connecting
              ? "Finish signing in to Google in your browser"
              : "Back up your library, collections, play history and settings to your Google Drive"
          }
        >
          <Button size="sm" data-testid="backup-connect" disabled={backup.connecting} aria-busy={backup.connecting} onClick={backup.connect}>
            {backup.connecting && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />}
            {backup.connecting ? "Connecting…" : "Connect Google Drive"}
          </Button>
          {backup.connecting && (
            <Button variant="outline" size="sm" data-testid="backup-connect-cancel" onClick={backup.cancelConnect}>
              Cancel
            </Button>
          )}
        </SettingsRow>
      </SettingsCard>
    );
  }

  const lastBackup = status.lastBackupAt ? `Last backup ${formatBackupAge(status.lastBackupAt)}` : "No backups yet";
  // Keep a count set elsewhere selectable instead of showing an empty trigger.
  const retention = BACKUP_RETENTION_OPTIONS.includes(status.retentionCount as (typeof BACKUP_RETENTION_OPTIONS)[number])
    ? [...BACKUP_RETENTION_OPTIONS]
    : [...BACKUP_RETENTION_OPTIONS, status.retentionCount].sort((a, b) => a - b);

  return (
    <>
      <SettingsCard title="Google Drive" data-testid="cloud-backup-settings">
        <SettingsRow
          label="Connected"
          description={<span data-testid="backup-last">{status.email ? `${status.email} · ${lastBackup}` : lastBackup}</span>}
        >
          <span className="flex h-[26px] items-center gap-1.5 rounded-full bg-green-500/12 px-2.5 text-xs font-semibold text-green-700 dark:text-green-400">
            <Check className="size-3" strokeWidth={2} aria-hidden />
            Active
          </span>
        </SettingsRow>
        <SettingsRow label="Back up">
          <Select value={status.frequency} onValueChange={(v) => backup.setFrequency(v as BackupFrequency)}>
            <SelectTrigger aria-label="How often to back up" data-testid="backup-frequency" className="h-[34px] min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKUP_FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Keep" description="Older backups are removed from Google Drive">
          <Select value={String(status.retentionCount)} onValueChange={(v) => backup.setRetention(Number(v))}>
            <SelectTrigger aria-label="Backups to keep" data-testid="backup-retention" className="h-[34px] min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {retention.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} backups
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Back up now">
          <Button size="sm" data-testid="backup-now" disabled={backup.backingUp} aria-busy={backup.backingUp} onClick={backup.backUpNow}>
            {backup.backingUp ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <CloudUpload className="size-3.5" strokeWidth={2} aria-hidden />
            )}
            {backup.backingUp ? "Backing up…" : "Back up now"}
          </Button>
        </SettingsRow>
        <SettingsRow label="Restore from a backup" description="Replaces your current library with an earlier copy">
          <Button variant="outline" size="sm" data-testid="restore-backup" onClick={() => setRestoreOpen(true)}>
            <History className="size-3.5" strokeWidth={1.75} aria-hidden />
            Restore
          </Button>
        </SettingsRow>
        <SettingsRow label="Disconnect Google Drive" description="Stops automatic backups. Backups already on Drive stay there.">
          <Button
            variant="outline"
            size="sm"
            className={DANGER_BUTTON}
            data-testid="backup-disconnect"
            disabled={backup.disconnecting}
            onClick={() => setConfirmDisconnect(true)}
          >
            Disconnect
          </Button>
        </SettingsRow>
      </SettingsCard>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Google Drive?"
        description="Automatic backups will stop. Your backups on Google Drive won’t be deleted."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => void backup.disconnect()}
      />

      <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} onRestored={backup.reload} />
    </>
  );
}

function RestoreDialog({ open, onOpenChange, onRestored }: { open: boolean; onOpenChange: (open: boolean) => void; onRestored: () => void }) {
  const list = useBackupList(open);
  // The backup awaiting confirmation; kept after closing so the dialog's exit doesn't go blank.
  const [pending, setPending] = React.useState<BackupEntry | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const restore = async (entry: BackupEntry) => {
    if (await list.restore(entry.id)) {
      onRestored();
      onOpenChange(false);
    }
  };

  return (
    <D.Root open={open} onOpenChange={(next) => !list.restoring && onOpenChange(next)}>
      <D.Portal>
        <D.Overlay
          className={cn(
            "fixed inset-0 z-[70] bg-black/50",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 ease-out",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
          )}
        />
        <D.Content
          data-testid="restore-dialog"
          className={cn(
            "fixed left-1/2 top-1/2 z-[71] flex max-h-[min(560px,calc(100vh-64px))] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none ease-out",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
          )}
        >
          <D.Title className="text-base font-semibold text-foreground">Restore from a backup</D.Title>
          <D.Description className="mt-1.5 text-sm text-muted-foreground">
            Pick the backup to bring back. It replaces your current library, play history and settings.
          </D.Description>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {list.loading ? (
              <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />
                Loading backups…
              </div>
            ) : list.error ? (
              <p role="alert" className="py-6 text-center text-sm text-destructive">
                {list.error}
              </p>
            ) : list.backups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No backups on Google Drive yet.</p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
                {list.backups.map((entry) => {
                  const when = formatBackupDate(entry.createdAt);
                  const restoringThis = list.restoringId === entry.id;
                  return (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{when}</div>
                        <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                          {formatBytes(entry.size)} · Schema v{entry.schemaVersion}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={list.restoring}
                        aria-label={`Restore backup from ${when}`}
                        onClick={() => {
                          setPending(entry);
                          setConfirmOpen(true);
                        }}
                      >
                        {restoringThis && <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />}
                        {restoringThis ? "Restoring…" : "Restore"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <D.Close asChild>
              <Button variant="outline" size="sm" disabled={list.restoring}>
                Close
              </Button>
            </D.Close>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Restore this backup?"
            description={
              pending
                ? `Your current library, play history and settings will be replaced with the backup from ${formatBackupDate(pending.createdAt)}. This can’t be undone.`
                : ""
            }
            confirmLabel="Restore"
            destructive
            onConfirm={() => {
              if (pending) void restore(pending);
            }}
          />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
