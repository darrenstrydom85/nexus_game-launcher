import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { Square, Info, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatTimer(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours >= 10) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  if (hours >= 1) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

interface NowPlayingProps {
  onStop?: () => void;
  onDetails?: (gameId: string) => void;
  onForceIdentify?: () => void;
}

export function NowPlaying({ onStop, onDetails, onForceIdentify }: NowPlayingProps) {
  const activeSession = useGameStore((s) => s.activeSession);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarVisible = useUiStore((s) => s.sidebarVisible);
  const [elapsed, setElapsed] = React.useState(0);

  const processDetected = activeSession?.processDetected ?? false;

  React.useEffect(() => {
    if (!activeSession) {
      setElapsed(0);
      return;
    }
    const startTime = new Date(activeSession.startedAt).getTime();
    const updateElapsed = () => setElapsed(Date.now() - startTime);
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const isFloating = !sidebarVisible;

  return (
    <AnimatePresence>
      {activeSession && (
        <motion.div
          data-testid="now-playing"
          className={cn(
            "overflow-hidden rounded-lg",
            "border border-primary/20 shadow-[0_0_12px_var(--glow)]",
            isFloating
              ? "glass-panel backdrop-blur-xl"
              : "glass-sidebar mx-2 mb-2",
          )}
          initial={
            isFloating
              ? { opacity: 0, y: 20 }
              : { opacity: 0, y: -20, height: 0 }
          }
          animate={
            isFloating
              ? { opacity: 1, y: 0 }
              : { opacity: 1, y: 0, height: "auto" }
          }
          exit={
            isFloating
              ? { opacity: 0, y: 20 }
              : { opacity: 0, y: -20, height: 0 }
          }
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {isFloating ? (
            /* Floating bottom bar layout */
            <div className="flex items-center gap-3 px-4 py-2.5">
              {activeSession.coverUrl ? (
                <div className="size-10 shrink-0 overflow-hidden rounded">
                  <img
                    src={activeSession.coverUrl}
                    alt={activeSession.gameName}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded bg-secondary text-xs font-bold text-muted-foreground">
                  {activeSession.gameName.charAt(0)}
                </div>
              )}

              <span
                data-testid="now-playing-dot"
                className="relative flex size-2 shrink-0"
              >
                {!processDetected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                )}
                <span className={cn(
                  "relative inline-flex size-2 rounded-full",
                  processDetected ? "bg-success" : "bg-warning animate-pulse",
                )} />
              </span>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  processDetected ? "text-success" : "text-warning",
                )}>
                  {processDetected ? "Now Playing" : "Launching…"}
                </span>
                <span
                  data-testid="now-playing-name"
                  className="truncate text-sm font-semibold text-foreground"
                >
                  {activeSession.gameName}
                </span>
              </div>

              <span
                data-testid="now-playing-timer"
                className="shrink-0 font-mono text-sm tabular-nums text-foreground"
              >
                {formatTimer(elapsed)}
              </span>

              {!processDetected && (
                <button
                  data-testid="now-playing-force-identify"
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  onClick={onForceIdentify}
                  aria-label="Identify game process"
                >
                  <Crosshair className="size-3.5" />
                  Can&apos;t find game?
                </button>
              )}

              <div className="flex shrink-0 gap-2">
                <Button
                  data-testid="now-playing-stop"
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={onStop}
                >
                  <Square className="size-3" />
                  Stop
                </Button>
                <Button
                  data-testid="now-playing-details"
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  onClick={() => onDetails?.(activeSession.gameId)}
                >
                  <Info className="size-3" />
                  Details
                </Button>
              </div>
            </div>
          ) : sidebarOpen ? (
            /* Expanded layout (240px sidebar) */
            <div className="flex flex-col gap-2 p-3">
              {activeSession.coverUrl && (
                <div className="h-16 w-full overflow-hidden rounded">
                  <img
                    src={activeSession.heroUrl ?? activeSession.coverUrl}
                    alt={activeSession.gameName}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span
                  data-testid="now-playing-dot"
                  className="relative flex size-2"
                >
                  {!processDetected && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                  )}
                  <span className={cn(
                    "relative inline-flex size-2 rounded-full",
                    processDetected ? "bg-success" : "bg-warning animate-pulse",
                  )} />
                </span>
                <span className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  processDetected ? "text-success" : "text-warning",
                )}>
                  {processDetected ? "Now Playing" : "Launching…"}
                </span>
              </div>

              <span
                data-testid="now-playing-name"
                className="truncate text-sm font-semibold text-foreground"
              >
                {activeSession.gameName}
              </span>

              {!processDetected && (
                <button
                  data-testid="now-playing-force-identify"
                  className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  onClick={onForceIdentify}
                  aria-label="Identify game process"
                >
                  <Crosshair className="size-3.5" />
                  Can&apos;t find game?
                </button>
              )}

              <span
                data-testid="now-playing-timer"
                className="font-mono text-lg tabular-nums text-foreground"
              >
                {formatTimer(elapsed)}
              </span>

              <div className="flex gap-2">
                <Button
                  data-testid="now-playing-stop"
                  variant="destructive"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={onStop}
                >
                  <Square className="size-3" />
                  Stop
                </Button>
                <Button
                  data-testid="now-playing-details"
                  variant="secondary"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => onDetails?.(activeSession.gameId)}
                >
                  <Info className="size-3" />
                  Details
                </Button>
              </div>
            </div>
          ) : (
            /* Collapsed layout (64px sidebar) */
            <div
              className="flex flex-col items-center gap-1 p-2"
              title={`${activeSession.gameName} — ${formatTimer(elapsed)}${!processDetected ? " (launching…)" : ""}`}
            >
              {activeSession.coverUrl ? (
                <div className="size-12 overflow-hidden rounded">
                  <img
                    src={activeSession.coverUrl}
                    alt={activeSession.gameName}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex size-12 items-center justify-center rounded bg-secondary text-xs font-bold text-muted-foreground">
                  {activeSession.gameName.charAt(0)}
                </div>
              )}
              <span
                data-testid="now-playing-dot"
                className="relative flex size-2"
              >
                {!processDetected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                )}
                <span className={cn(
                  "relative inline-flex size-2 rounded-full",
                  processDetected ? "bg-success" : "bg-warning animate-pulse",
                )} />
              </span>
              {!processDetected && (
                <button
                  data-testid="now-playing-force-identify"
                  className="rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  onClick={onForceIdentify}
                  aria-label="Identify game process"
                  title="Identify game process"
                >
                  <Crosshair className="size-3.5" />
                </button>
              )}
              <span
                data-testid="now-playing-timer-compact"
                className="font-mono text-[10px] tabular-nums text-muted-foreground"
              >
                {formatTimer(elapsed)}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { formatTimer };
