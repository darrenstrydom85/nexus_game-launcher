import * as React from "react";
import { X, CircleAlert, CheckCircle2 } from "lucide-react";
import { fetchKnownIssues } from "@/lib/tauri";

export interface KnownIssuesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KnownIssuesDialog({ open, onClose }: KnownIssuesDialogProps) {
  const [issues, setIssues] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(false);
    setIssues([]);

    fetchKnownIssues()
      .then((result) => setIssues(result.issues ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;

    const getFocusables = () =>
      el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

    const focusables = getFocusables();
    focusables[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusables();
      const first = items[0];
      const last = items[items.length - 1];
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

  const showEmpty = !loading && !error && issues.length === 0;
  const showEmptyError = !loading && error;
  const showList = !loading && !error && issues.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="known-issues-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        className="w-full max-w-md rounded-lg border border-border bg-card/95 p-4 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300"
      >
        <div className="flex items-center justify-between">
          <h2
            id="known-issues-dialog-title"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            Known Issues
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close known issues dialog"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4">
          {loading && <SkeletonLines />}

          {showList && (
            <ul
              className="flex flex-col gap-3"
              aria-label="Known issues list"
            >
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm text-muted-foreground"
                >
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-yellow-500"
                    aria-hidden
                  />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}

          {(showEmpty || showEmptyError) && (
            <div
              className="flex flex-col items-center gap-2 py-6 text-center"
              data-testid="known-issues-empty"
            >
              <CheckCircle2
                className="size-8 text-green-500"
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">
                No known issues right now — looking good!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonLines() {
  const widths = ["w-full", "w-4/5", "w-11/12", "w-3/5"];
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading known issues"
      data-testid="known-issues-skeleton"
    >
      {widths.map((w, i) => (
        <div
          key={i}
          className={`h-4 rounded ${w} animate-pulse bg-muted/40`}
        />
      ))}
    </div>
  );
}
