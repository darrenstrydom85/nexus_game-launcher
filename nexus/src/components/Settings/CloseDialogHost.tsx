import * as React from "react";
import { useTauriEvent } from "@/hooks/use-tauri-event";
import { CloseConfirmDialog } from "@/components/Settings/CloseConfirmDialog";

/**
 * Always-mounted host for the `nexus://show-close-dialog` event and the
 * [`CloseConfirmDialog`] render.
 *
 * The Rust `CloseRequested` handler calls `api.prevent_close()` and emits
 * `nexus://show-close-dialog` when the user clicks the titlebar close button
 * and "Ask when closing" is enabled. Previously the listener lived inside
 * `MainApp`, which is unmounted while onboarding is active -- so clicking
 * close during the onboarding wizard silently did nothing (the close was
 * prevented, but nothing rendered the dialog).
 *
 * Mounting this host at the top of `App` (above the onboarding / main app
 * switch) guarantees the dialog is reachable in every state.
 */
export function CloseDialogHost() {
  const [open, setOpen] = React.useState(false);

  useTauriEvent<unknown>("nexus://show-close-dialog", () => {
    setOpen(true);
  });

  return <CloseConfirmDialog open={open} onClose={() => setOpen(false)} />;
}
