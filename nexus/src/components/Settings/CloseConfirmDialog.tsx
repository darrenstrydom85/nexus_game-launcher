/**
 * Story 20.1: Close confirmation — Close, Minimize to system tray, or Cancel (stay open).
 * Shown when the user triggers window close (titlebar X, Alt+F4) and "Ask when closing" is on.
 */
import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Minus, Power, X } from "lucide-react";

export interface CloseConfirmDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CloseConfirmDialog({ open, onClose }: CloseConfirmDialogProps) {
  const [isClosing, setIsClosing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleCloseApp = React.useCallback(async () => {
    setIsClosing(true);
    try {
      await invoke("confirm_app_close");
    } catch {
      setIsClosing(false);
    }
    onClose();
  }, [onClose]);

  const handleMinimizeToTray = React.useCallback(async () => {
    try {
      await invoke("hide_main_window");
    } catch {
      // Window may already be hidden
    }
    onClose();
  }, [onClose]);

  // Focus trap and Escape: close dialog without choosing an action
  React.useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const focusables = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-confirm-dialog-title"
      aria-describedby="close-confirm-dialog-desc"
    >
      <div
        ref={containerRef}
        className="w-full max-w-[400px] rounded-xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2
          id="close-confirm-dialog-title"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Close Nexus?
        </h2>
        <p
          id="close-confirm-dialog-desc"
          className="mt-2 text-sm text-muted-foreground"
        >
          You can close the app, minimize to the system tray to keep it running in the background, or cancel to stay open.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isClosing}
            aria-label="Cancel and keep Nexus open"
          >
            <X className="mr-2 size-4" aria-hidden />
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleCloseApp}
            disabled={isClosing}
            aria-label="Close application"
          >
            <Power className="mr-2 size-4" aria-hidden />
            Close
          </Button>
          <Button
            type="button"
            onClick={handleMinimizeToTray}
            disabled={isClosing}
            aria-label="Minimize to system tray"
          >
            <Minus className="mr-2 size-4" aria-hidden />
            Minimize to system tray
          </Button>
        </div>
      </div>
    </div>
  );
}
