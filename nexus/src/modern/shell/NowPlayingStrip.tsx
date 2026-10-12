import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crosshair, Square } from "lucide-react";
import { cn, formatRunningTimer } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { useGameStore } from "@/stores/gameStore";

interface NowPlayingStripProps {
  onStop: () => void;
  onForceIdentify: () => void;
  onQuickView: (gameId: string) => void;
}

/**
 * Pinned under the top bar while a game runs, so it is visible on every page
 * and never covers content. Only opacity animates; the layout shift is instant.
 */
export function NowPlayingStrip({ onStop, onForceIdentify, onQuickView }: NowPlayingStripProps) {
  const session = useGameStore((s) => s.activeSession);

  return (
    <AnimatePresence initial={false}>
      {session && (
        <motion.div
          key={session.sessionId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
        >
          <StripContent
            gameId={session.gameId}
            gameName={session.gameName}
            coverUrl={session.coverUrl}
            startedAt={session.startedAt}
            launching={!session.processDetected}
            onStop={onStop}
            onForceIdentify={onForceIdentify}
            onQuickView={onQuickView}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StripContent({
  gameId,
  gameName,
  coverUrl,
  startedAt,
  launching,
  onStop,
  onForceIdentify,
  onQuickView,
}: {
  gameId: string;
  gameName: string;
  coverUrl: string | null;
  startedAt: string;
  launching: boolean;
  onStop: () => void;
  onForceIdentify: () => void;
  onQuickView: (gameId: string) => void;
}) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const startedLabel = new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      role="status"
      aria-label={launching ? `Launching ${gameName}` : `Now playing ${gameName}`}
      data-testid="now-playing-strip"
      data-state={launching ? "launching" : "running"}
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-3.5 gap-y-1 border-b py-1.5 pl-5 pr-3",
        launching ? "border-warning/25 bg-warning/8" : "border-success/20 bg-success/8",
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {/* Ping only while waiting on the process; a running game can last hours. */}
        {launching && (
          <span className="absolute inline-flex size-full rounded-full bg-warning opacity-60 motion-safe:animate-ping" />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", launching ? "bg-warning" : "bg-success")} />
      </span>
      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.08em]",
          // Token colours fail 4.5:1 on the light theme at this size.
          launching ? "text-amber-700 dark:text-warning" : "text-green-700 dark:text-success",
        )}
      >
        {launching ? "Launching" : "Now playing"}
      </span>

      {coverUrl ? (
        <img src={coverUrl} alt="" className="img-outline size-[26px] shrink-0 rounded-md object-cover" draggable={false} />
      ) : null}
      <span data-testid="now-playing-strip-name" className="min-w-0 truncate text-sm font-semibold text-foreground">
        {gameName}
      </span>
      <span data-testid="now-playing-strip-timer" className="font-mono text-[15px] tabular-nums text-foreground">
        {formatRunningTimer(elapsed)}
      </span>
      <span className="text-[13px] text-muted-foreground max-[900px]:hidden">Started {startedLabel}</span>

      <span className="flex-1" />

      {launching && (
        <button
          type="button"
          data-testid="now-playing-strip-identify"
          onClick={onForceIdentify}
          className="pressable flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Crosshair className="size-3.5" strokeWidth={1.5} />
          Can&apos;t find game?
        </button>
      )}
      <button
        type="button"
        data-testid="now-playing-strip-details"
        onClick={() => onQuickView(gameId)}
        className="pressable h-8 rounded-md bg-foreground/[0.06] px-3 text-[13px] font-medium text-foreground outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Quick view
      </button>
      <button
        type="button"
        data-testid="now-playing-strip-stop"
        onClick={onStop}
        className="pressable flex h-8 items-center gap-1.5 rounded-md bg-destructive/15 px-3 text-[13px] font-semibold text-destructive outline-none hover:bg-destructive/25 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Square className="size-3 fill-current" strokeWidth={2} />
        Stop
      </button>
    </div>
  );
}
