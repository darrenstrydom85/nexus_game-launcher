import * as React from "react";
import * as Radix from "radix-ui";
import { cn } from "@/lib/utils";

const AD = Radix.AlertDialog;

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  /** Red confirm button for destructive actions. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Confirmation dialog: focus trapped, Escape and Cancel close it, and focus
 * starts on Cancel so Enter never confirms a destructive action by accident.
 * Modals scale from the centre, not from the trigger.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay
          className={cn(
            "fixed inset-0 z-[80] bg-black/50",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 ease-out",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
          )}
        />
        <AD.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[81] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none ease-out",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
          )}
        >
          <AD.Title className="text-base font-semibold text-foreground">{title}</AD.Title>
          <AD.Description className="mt-1.5 text-sm text-muted-foreground">{description}</AD.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AD.Cancel
              data-testid="confirm-cancel"
              className="pressable h-9 rounded-lg px-4 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </AD.Cancel>
            <AD.Action
              data-testid="confirm-action"
              onClick={onConfirm}
              className={cn(
                "pressable h-9 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {confirmLabel}
            </AD.Action>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
