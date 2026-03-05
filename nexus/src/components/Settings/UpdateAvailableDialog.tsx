import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";

export interface UpdateAvailableDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UpdateAvailableDialog({ open, onClose }: UpdateAvailableDialogProps) {
  const latestVersion = useUpdateStore((s) => s.latestVersion);
  const downloadUrl = useUpdateStore((s) => s.downloadUrl);
  const dismissUpdatePopup = useUpdateStore((s) => s.dismissUpdatePopup);

  const handleDownload = React.useCallback(() => {
    openUrl(downloadUrl).catch(() => {});
    onClose();
  }, [downloadUrl, onClose]);

  const handleNotNow = React.useCallback(() => {
    dismissUpdatePopup();
    onClose();
  }, [dismissUpdatePopup, onClose]);

  if (!open) return null;

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
          if (e.key === "Escape") handleNotNow();
        }}
      >
        <h4 id="update-dialog-title" className="text-sm font-semibold text-foreground">
          Update available
        </h4>
        <p id="update-dialog-desc" className="mt-2 text-sm text-muted-foreground">
          The newest version {latestVersion ?? ""} is available. Download now to get the latest
          features and fixes.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleNotNow}
            aria-label="Not now"
          >
            Not now
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            aria-label="Download now"
          >
            Download now
          </Button>
        </div>
      </div>
    </div>
  );
}
