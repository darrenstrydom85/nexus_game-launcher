import * as React from "react";
import { useToastStore, type ToastType } from "@/stores/toastStore";

const TAG: Record<ToastType, string> = {
  success: "OK",
  error: "ERR",
  warning: "WRN",
  info: "INF",
};

const DEFAULT_DURATION_MS = 4000;

/**
 * DOS take on ToastNotifications: one-line teal slips, top-right.
 * The store keeps no timers, so auto-dismiss lives here (duration 0 = sticky,
 * matching the modern component's contract). Click dismisses; the underlined
 * action word triggers the toast action.
 */
export function RetroToasts() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  React.useEffect(() => {
    for (const t of toasts) {
      if (timers.current.has(t.id)) continue;
      const dur = t.duration ?? DEFAULT_DURATION_MS;
      if (dur <= 0) continue;
      timers.current.set(
        t.id,
        setTimeout(() => {
          timers.current.delete(t.id);
          removeToast(t.id);
        }, dur),
      );
    }
    const alive = new Set(toasts.map((t) => t.id));
    for (const [id, handle] of timers.current) {
      if (!alive.has(id)) {
        clearTimeout(handle);
        timers.current.delete(id);
      }
    }
  }, [toasts, removeToast]);

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const [, handle] of map) clearTimeout(handle);
      map.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="retro-toast-stack" data-testid="retro-toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="retro-toast"
          data-testid={`retro-toast-${t.type}`}
          onClick={() => removeToast(t.id)}
        >
          [{TAG[t.type]}] {t.message}
          {t.progress != null && (
            <span> {"#".repeat(Math.round(t.progress * 10)).padEnd(10, ".")}</span>
          )}
          {t.action && (
            <span
              className="retro-toast-action"
              data-testid="retro-toast-action"
              onClick={(e) => {
                e.stopPropagation();
                t.action?.onClick();
                removeToast(t.id);
              }}
            >
              {t.action.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
