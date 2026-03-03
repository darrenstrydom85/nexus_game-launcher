import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastType } from "@/stores/toastStore";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

const DEFAULT_DURATION = 5000;

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="size-4 text-success" />,
  error: <XCircle className="size-4 text-destructive" />,
  warning: <AlertTriangle className="size-4 text-warning" />,
  info: <Info className="size-4 text-info" />,
};

export function ToastNotifications() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      data-testid="toast-container"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            id={toast.id}
            type={toast.type}
            message={toast.message}
            duration={toast.duration ?? DEFAULT_DURATION}
            action={toast.action}
            progress={toast.progress}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ToastItemProps {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  action?: { label: string; onClick: () => void };
  progress?: number;
  onDismiss: () => void;
}

function ToastItem({
  id,
  type,
  message,
  duration,
  action,
  progress,
  onDismiss,
}: ToastItemProps) {
  React.useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const pct = progress != null ? Math.max(0, Math.min(1, progress)) * 100 : null;

  return (
    <motion.div
      data-testid={`toast-${id}`}
      data-toast-type={type}
      className={cn(
        "glass-toast flex w-80 flex-col rounded-lg shadow-lg overflow-hidden",
      )}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
      layout
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 shrink-0">{TOAST_ICONS[type]}</div>

        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm text-foreground">{message}</p>
          {action && (
            <button
              data-testid={`toast-action-${id}`}
              className={cn(
                "self-start text-xs font-medium text-primary",
                "transition-colors hover:text-primary/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>

        <button
          data-testid={`toast-dismiss-${id}`}
          className={cn(
            "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {pct != null && (
        <div className="h-1 w-full bg-white/10">
          <motion.div
            className="h-full bg-info/70"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
      )}
    </motion.div>
  );
}
