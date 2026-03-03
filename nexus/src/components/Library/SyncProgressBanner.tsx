import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, X, CheckCircle } from "lucide-react";
import { useSyncStore } from "@/stores/syncStore";
import { SyncErrorPopover } from "@/components/Library/SyncErrorPopover";

const COMPLETION_DISPLAY_MS = 3000;

const GLASS_STYLE: React.CSSProperties = {
  background: "hsla(240, 10%, 8%, 0.75)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid hsla(240, 10%, 20%, 0.4)",
};

function getActivePhaseLabel(phases: { phase: "artwork" | "metadata"; completed: number; total: number }[]): string {
  const active = phases.filter((p) => p.total > 0 && p.completed < p.total);
  const artwork = active.find((p) => p.phase === "artwork");
  const metadata = active.find((p) => p.phase === "metadata");
  if (artwork) return "Fetching artwork…";
  if (metadata) return "Fetching metadata…";
  return "Syncing…";
}

function getCurrentGameName(phases: { phase: "artwork" | "metadata"; completed: number; total: number; currentGame: string | null }[]): string | null {
  const active = phases.filter((p) => p.total > 0 && p.completed < p.total);
  const artwork = active.find((p) => p.phase === "artwork");
  const metadata = active.find((p) => p.phase === "metadata");
  const phase = artwork ?? metadata;
  return phase?.currentGame ?? null;
}

export interface SyncProgressBannerProps {
  /** When provided, banner is controlled by parent (e.g. LibraryView for shared state with SyncActivityDot). */
  dismissed?: boolean;
  onDismiss?: () => void;
}

export function SyncProgressBanner({ dismissed: controlledDismissed, onDismiss }: SyncProgressBannerProps = {}) {
  const isActive = useSyncStore((s) => s.isActive);
  const phases = useSyncStore((s) => s.phases);
  const overallCompleted = useSyncStore((s) => s.overallCompleted);
  const overallTotal = useSyncStore((s) => s.overallTotal);
  const startedAt = useSyncStore((s) => s.startedAt);

  const [internalDismissed, setInternalDismissed] = React.useState(false);
  const prevStartedAt = React.useRef<number | null>(null);
  const prevIsActive = React.useRef(isActive);
  const completionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isControlled = controlledDismissed !== undefined && onDismiss !== undefined;
  const dismissed = isControlled ? controlledDismissed : internalDismissed;
  const setDismissed = isControlled ? onDismiss : setInternalDismissed;

  const [completionState, setCompletionState] = React.useState<{
    gamesUpdated: number;
    errorCount: number;
  } | null>(null);

  React.useEffect(() => {
    if (startedAt !== prevStartedAt.current) {
      prevStartedAt.current = startedAt;
      if (startedAt !== null && !isControlled) setInternalDismissed(false);
    }
  }, [startedAt, isControlled]);

  React.useEffect(() => {
    const wasActive = prevIsActive.current;
    prevIsActive.current = isActive;

    if (dismissed) {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    }

    if (!isActive && wasActive && !dismissed) {
      const gamesUpdated = overallCompleted;
      const errorCount = phases.flatMap((p) => p.errors).length;
      setCompletionState({ gamesUpdated, errorCount });
      const t = setTimeout(() => {
        setCompletionState(null);
        setDismissed(true);
      }, COMPLETION_DISPLAY_MS);
      completionTimerRef.current = t;
      return () => {
        clearTimeout(t);
        completionTimerRef.current = null;
      };
    }
  }, [isActive, dismissed, overallCompleted, phases, setDismissed]);

  const allErrors = React.useMemo(
    () => phases.flatMap((p) => p.errors),
    [phases],
  );
  const phaseLabel = getActivePhaseLabel(phases);
  const currentGame = getCurrentGameName(phases);
  const progressRatio = overallTotal > 0 ? overallCompleted / overallTotal : 0;

  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const show = (isActive && !dismissed) || completionState !== null;

  const handleDismiss = React.useCallback(() => {
    setCompletionState(null);
    setDismissed(true);
  }, [setDismissed]);

  const transition = prefersReducedMotion
    ? { duration: 0.15 }
    : { duration: 0.3, ease: "easeOut" as const };
  const initial = prefersReducedMotion
    ? { opacity: 0 }
    : { y: -48, opacity: 0 };
  const animate = prefersReducedMotion
    ? { opacity: 1 }
    : { y: 0, opacity: 1 };
  const exit = prefersReducedMotion
    ? { opacity: 0, transition: { duration: 0.15 } }
    : { y: -48, opacity: 0, transition: { duration: 0.2, ease: "easeOut" as const } };

  const isCompletion = completionState !== null;
  const completionErrors = isCompletion
    ? allErrors
    : [];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-label={isCompletion ? "Sync complete" : `Sync progress: ${overallCompleted} of ${overallTotal} games`}
          data-testid="sync-progress-banner"
          data-completion={isCompletion ? "true" : undefined}
          initial={initial}
          animate={animate}
          exit={exit}
          transition={transition}
          className="absolute left-0 right-0 top-0 z-[20] mx-4 mt-2 flex flex-col gap-1.5 rounded-lg px-4 py-2.5"
          style={GLASS_STYLE}
        >
          {isCompletion ? (
            <div className="flex flex-1 items-center gap-3">
              <CheckCircle
                className="size-4 shrink-0 text-success"
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={
                    completionState.errorCount > 0
                      ? "text-sm font-medium text-amber-600 dark:text-amber-400"
                      : "text-sm font-medium"
                  }
                >
                  {completionState.errorCount > 0
                    ? `Sync complete with ${completionState.errorCount} errors`
                    : "Sync complete"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {completionState.gamesUpdated === 0 && completionState.errorCount === 0
                    ? "Library is up to date"
                    : `${completionState.gamesUpdated} games updated`}
                </span>
              </div>
              <div className="min-w-0 flex-1" />
              {completionState.errorCount > 0 && (
                <SyncErrorPopover errors={completionErrors} />
              )}
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                onClick={handleDismiss}
                aria-label="Dismiss sync progress"
                data-testid="sync-banner-dismiss"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-1 items-center gap-3">
                <RefreshCw
                  className="size-4 shrink-0 text-primary animate-spin"
                  aria-hidden
                />
                <span className="text-sm font-medium">
                  {phaseLabel}
                </span>
                {currentGame && (
                  <span
                    className="max-w-[200px] shrink-0 truncate text-xs text-muted-foreground"
                    title={currentGame}
                  >
                    {currentGame}
                  </span>
                )}
                <span
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                  aria-hidden
                >
                  {overallCompleted} / {overallTotal}
                </span>
                <div className="min-w-0 flex-1" />
                {allErrors.length > 0 && (
                  <SyncErrorPopover errors={allErrors} />
                )}
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  onClick={handleDismiss}
                  aria-label="Dismiss sync progress"
                  data-testid="sync-banner-dismiss"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 w-full origin-left bg-primary transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${progressRatio})` }}
                  aria-hidden
                />
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
