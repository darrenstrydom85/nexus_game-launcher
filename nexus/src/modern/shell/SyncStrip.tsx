import * as React from "react";
import { CheckCircle2, RefreshCw, X } from "lucide-react";
import { useSyncStore, type SyncPhase } from "@/stores/syncStore";
import { SyncErrorPopover } from "@/components/Library/SyncErrorPopover";

const DONE_MS = 3000;

function activePhase(phases: SyncPhase[]): SyncPhase | null {
  const running = phases.filter((p) => p.total > 0 && p.completed < p.total);
  return running.find((p) => p.phase === "artwork") ?? running.find((p) => p.phase === "metadata") ?? null;
}

/**
 * Library sync and metadata fetch progress, pinned under the top bar on every
 * page (the first fetch after onboarding runs while you're on Home). Hide it
 * for the current run with X; it says "updated" for a moment when it finishes.
 */
export function SyncStrip() {
  const isActive = useSyncStore((s) => s.isActive);
  const phases = useSyncStore((s) => s.phases);
  const completed = useSyncStore((s) => s.overallCompleted);
  const total = useSyncStore((s) => s.overallTotal);
  const startedAt = useSyncStore((s) => s.startedAt);
  const [hiddenRun, setHiddenRun] = React.useState<number | null>(null);
  const [done, setDone] = React.useState<{ games: number } | null>(null);
  const wasActive = React.useRef(isActive);

  // Finished: show the result briefly, unless this run was hidden.
  React.useEffect(() => {
    const finished = wasActive.current && !isActive;
    wasActive.current = isActive;
    if (isActive) setDone(null);
    if (!finished || hiddenRun === startedAt) return;
    setDone({ games: completed });
    const t = setTimeout(() => setDone(null), DONE_MS);
    return () => clearTimeout(t);
  }, [isActive, completed, hiddenRun, startedAt]);

  const errors = React.useMemo(() => phases.flatMap((p) => p.errors), [phases]);
  const hidden = hiddenRun !== null && hiddenRun === startedAt;
  if ((!isActive || hidden) && !done) return null;

  const phase = activePhase(phases);
  const label = done ? "Library updated" : phase?.phase === "artwork" ? "Fetching artwork" : phase?.phase === "metadata" ? "Fetching metadata" : "Syncing library";
  const ratio = total > 0 ? Math.min(1, completed / total) : 0;

  return (
    <div
      role="status"
      aria-label={done ? `Library updated, ${done.games} games` : `${label}: ${completed} of ${total} games`}
      data-testid="sync-strip"
      data-state={done ? "done" : "active"}
      className="relative flex min-h-11 flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-primary/20 bg-primary/[0.06] py-1.5 pl-5 pr-3"
    >
      {done ? (
        <CheckCircle2 className="size-4 shrink-0 text-green-700 dark:text-green-400" strokeWidth={2} aria-hidden />
      ) : (
        <RefreshCw className="size-4 shrink-0 animate-spin text-primary [animation-duration:1.4s]" strokeWidth={2} aria-hidden />
      )}
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{label}</span>
      {!done && phase?.currentGame && (
        <span data-testid="sync-strip-game" className="min-w-0 max-w-[40ch] truncate text-sm text-muted-foreground">
          {phase.currentGame}
        </span>
      )}
      <span className="flex-1" />
      <span className="text-[13px] tabular-nums text-muted-foreground">
        {done ? `${done.games} ${done.games === 1 ? "game" : "games"}` : `${completed} of ${total} · ${Math.round(ratio * 100)}%`}
      </span>
      {errors.length > 0 && <SyncErrorPopover errors={errors} />}
      {!done && (
        <button
          type="button"
          aria-label="Hide sync progress"
          onClick={() => setHiddenRun(startedAt)}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      )}
      {/* Progress along the bottom edge. Steady, linear motion: it's a progress bar. */}
      {!done && (
        <span aria-hidden className="absolute inset-x-0 bottom-[-1px] h-0.5 overflow-hidden">
          <span
            className="block h-full origin-left bg-primary transition-transform duration-300 ease-linear"
            style={{ transform: `scaleX(${ratio})` }}
          />
        </span>
      )}
    </div>
  );
}
