import * as React from "react";
import { useUpdateStore } from "@/stores/updateStore";
import { RetroModal } from "./RetroModal";
import { fmtBar } from "./format";

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * DOS version of UpdateAvailableDialog, driving the same updateStore
 * lifecycle: available -> downloading -> ready -> restart. Esc dismisses
 * (the hourly toast can reopen it); a download keeps running if dismissed.
 */
export function RetroUpdatePrompt() {
  const updateAvailable = useUpdateStore((s) => s.updateAvailable);
  const popupDismissed = useUpdateStore((s) => s.popupDismissed);
  const latestVersion = useUpdateStore((s) => s.latestVersion);
  const phase = useUpdateStore((s) => s.phase);
  const downloadedBytes = useUpdateStore((s) => s.downloadedBytes);
  const totalBytes = useUpdateStore((s) => s.totalBytes);
  const downloadAndInstall = useUpdateStore((s) => s.downloadAndInstall);
  const restart = useUpdateStore((s) => s.restart);
  const dismiss = useUpdateStore((s) => s.dismissUpdatePopup);

  const visible = updateAvailable && !popupDismissed;

  React.useEffect(() => {
    if (!visible) return;
    const h = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      if (phase === "available" || phase === "error") {
        if (e.key === "Enter" || key === "y") {
          e.preventDefault();
          downloadAndInstall();
        }
      } else if (phase === "ready") {
        if (e.key === "Enter" || key === "y") {
          e.preventDefault();
          restart();
        }
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [visible, phase, downloadAndInstall, restart, dismiss]);

  if (!visible) return null;

  const footer =
    phase === "downloading"
      ? "DOWNLOADING... | ESC=HIDE (CONTINUES)"
      : phase === "ready"
        ? "Y/ENTER=RESTART NOW | ESC=LATER"
        : phase === "error"
          ? "Y/ENTER=RETRY | ESC=LATER"
          : "Y/ENTER=DOWNLOAD+INSTALL | ESC=LATER";

  return (
    <RetroModal title="UPDATE AVAILABLE" footer={footer}>
      <div className="retro-row" style={{ padding: 0 }} data-testid="retro-update-prompt">
        <span style={{ width: "12ch" }}>NEW VERSION</span>
        <span>{latestVersion ?? "?"}</span>
      </div>
      {phase === "downloading" && (
        <div className="retro-row" style={{ padding: 0 }} data-testid="retro-update-progress">
          <span style={{ width: "12ch" }}>PROGRESS</span>
          <span>
            {fmtBar(downloadedBytes, Math.max(totalBytes, 1), 20)} {mb(downloadedBytes)}/{totalBytes > 0 ? mb(totalBytes) : "?"} MB
          </span>
        </div>
      )}
      {phase === "ready" && (
        <div className="retro-row" style={{ padding: 0 }}>
          <span>INSTALL COMPLETE. RESTART TO APPLY.</span>
        </div>
      )}
      {phase === "error" && (
        <div className="retro-row" style={{ padding: 0 }}>
          <span>DOWNLOAD FAILED. RETRY?</span>
        </div>
      )}
    </RetroModal>
  );
}
