import * as React from "react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { useStreakStore } from "@/stores/streakStore";
import { LevelBadge } from "@/components/Xp/LevelBadge";
import { Crosshair, Flame, Square } from "lucide-react";

interface ChannelStatusBarProps {
  onStopGame?: () => void;
  onGameDetails?: (gameId: string) => void;
  onForceIdentify?: () => void;
  onNavigateToStats?: () => void;
}

function formatElapsed(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Console-style system bar: active session left, streak + level right. */
export function ChannelStatusBar({
  onStopGame,
  onGameDetails,
  onForceIdentify,
  onNavigateToStats,
}: ChannelStatusBarProps) {
  const activeSession = useGameStore((s) => s.activeSession);
  const games = useGameStore((s) => s.games);
  const streak = useStreakStore((s) => s.streak);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  const elapsedS = activeSession
    ? Math.max(0, Math.floor((nowMs - new Date(activeSession.startedAt).getTime()) / 1000))
    : 0;
  const visibleCount = games.filter((g) => g.status !== "removed").length;
  const currentStreak = streak?.currentStreak ?? 0;

  return (
    <div
      data-testid="channel-status-bar"
      className="relative z-10 flex h-12 shrink-0 items-center gap-4 border-t border-border bg-background/85 px-5"
    >
      {activeSession ? (
        <div className="flex items-center gap-3" data-testid="channel-session-strip">
          <span
            className={cn(
              "size-2 rounded-full",
              activeSession.processDetected ? "bg-success animate-play-pulse" : "bg-warning",
            )}
            aria-hidden
          />
          <button
            className="text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onGameDetails?.(activeSession.gameId)}
            title="Open game details"
          >
            {activeSession.gameName}
          </button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatElapsed(elapsedS)}
          </span>
          {!activeSession.processDetected && (
            <button
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onForceIdentify}
              aria-label="Identify game process"
              title="Identify game process"
            >
              <Crosshair className="size-3.5" />
            </button>
          )}
          <button
            data-testid="channel-stop-session"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            onClick={onStopGame}
            aria-label="Stop session"
            title="Stop session"
          >
            <Square className="size-3 fill-current" />
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Nothing playing</span>
      )}

      <div className="flex-1" />

      {currentStreak > 0 && (
        <button
          className="flex items-center gap-1.5 text-sm font-semibold text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onNavigateToStats}
          title={`${currentStreak}-day play streak`}
          aria-label={`${currentStreak}-day play streak`}
        >
          <Flame className="size-4" />
          {currentStreak}
        </button>
      )}
      <LevelBadge sidebarOpen={false} onClick={onNavigateToStats} />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {visibleCount} games
      </span>
    </div>
  );
}
