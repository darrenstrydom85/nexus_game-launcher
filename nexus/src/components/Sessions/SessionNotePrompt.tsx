import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Save } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { updateSessionNote } from "@/lib/tauri";

export interface SessionNotePromptItem {
  sessionId: string;
  gameName: string;
  durationS: number;
}

interface SessionNotePromptProps {
  queue: SessionNotePromptItem[];
  onDismiss: () => void;
  autoDismissMs?: number;
}

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SessionNotePrompt({
  queue,
  onDismiss,
  autoDismissMs = 60_000,
}: SessionNotePromptProps) {
  const current = queue[0] ?? null;
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [windowVisible, setWindowVisible] = React.useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const interactedRef = React.useRef(false);

  React.useEffect(() => {
    const handler = () => setWindowVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  React.useEffect(() => {
    setNote("");
    interactedRef.current = false;
  }, [current?.sessionId]);

  const shouldShow = current !== null && windowVisible;

  React.useEffect(() => {
    if (!shouldShow || autoDismissMs <= 0) return;

    const startTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, autoDismissMs);
    };

    startTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [shouldShow, current?.sessionId, autoDismissMs, onDismiss]);

  const resetTimer = React.useCallback(() => {
    if (!current || autoDismissMs <= 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
  }, [current, autoDismissMs, onDismiss]);

  const handleSave = React.useCallback(async () => {
    if (!current || !note.trim()) return;
    setSaving(true);
    try {
      await updateSessionNote(current.sessionId, note.trim());
    } catch {
      // best-effort
    } finally {
      setSaving(false);
      onDismiss();
    }
  }, [current, note, onDismiss]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        onDismiss();
      }
    },
    [handleSave, onDismiss],
  );

  const handleInput = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNote(e.target.value);
      if (!interactedRef.current) {
        interactedRef.current = true;
      }
      resetTimer();
    },
    [resetTimer],
  );

  return (
    <AnimatePresence>
      {shouldShow && current && (
        <motion.div
          key={current.sessionId}
          data-testid="session-note-prompt"
          className={cn(
            "fixed bottom-4 right-4 z-[25] w-80",
            "rounded-lg border border-border bg-card/90 backdrop-blur-md",
            "shadow-lg",
          )}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold text-foreground"
                title={current.gameName}
              >
                {current.gameName}
              </p>
              <p className="text-xs text-muted-foreground">
                Session ended &middot;{" "}
                <span className="tabular-nums">
                  {formatPlayTime(current.durationS)}
                </span>
              </p>
            </div>
            <button
              data-testid="session-note-skip"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              )}
              onClick={onDismiss}
              aria-label="Skip"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Input */}
          <div className="px-4 pb-2">
            <textarea
              ref={inputRef}
              data-testid="session-note-input"
              className={cn(
                "w-full resize-none rounded-md border border-border bg-background px-3 py-2",
                "text-sm text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring",
              )}
              rows={2}
              placeholder="What happened this session?"
              value={note}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-4 pb-3">
            <button
              data-testid="session-note-skip-btn"
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              )}
              onClick={onDismiss}
            >
              Skip
            </button>
            <button
              data-testid="session-note-save"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                "bg-primary text-primary-foreground transition-colors hover:bg-primary/90",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
              onClick={handleSave}
              disabled={!note.trim() || saving}
            >
              <Save className="size-3" />
              Save
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
