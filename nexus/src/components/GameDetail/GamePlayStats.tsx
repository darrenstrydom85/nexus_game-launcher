import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Game } from "@/stores/gameStore";
import { formatPlayTime } from "@/components/Library/HeroSection";

interface PlayStats {
  sessionCount: number;
  totalTime: number;
  averageSession: number;
  lastPlayed: string | null;
}

interface GamePlayStatsProps {
  game: Game;
  onViewFullStats?: () => void;
}

export function GamePlayStats({ game, onViewFullStats }: GamePlayStatsProps) {
  const [stats, setStats] = React.useState<PlayStats | null>(null);

  React.useEffect(() => {
    invoke<{
      sessionCount: number;
      totalTime: number;
      averageSession: number;
      lastPlayed: string | null;
    }>("get_play_stats", { gameId: game.id })
      .then((s) => setStats(s))
      .catch(() => setStats(null));
  }, [game.id]);

  const sessionCount = stats?.sessionCount ?? game.playCount ?? 0;
  const totalTime = stats?.totalTime ?? game.totalPlayTimeS ?? 0;
  const avgSession = stats?.averageSession ?? (sessionCount > 0 ? Math.round(totalTime / sessionCount) : 0);
  const lastPlayed = stats?.lastPlayed ?? game.lastPlayedAt;

  return (
    <div data-testid="game-play-stats" className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Play Statistics</h3>
      <dl className="flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Total Play Time</dt>
          <dd data-testid="stats-total-time" className="font-medium tabular-nums text-foreground">
            {formatPlayTime(totalTime)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Sessions</dt>
          <dd data-testid="stats-sessions" className="tabular-nums text-foreground">
            {sessionCount}
          </dd>
        </div>
        {sessionCount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Avg Session</dt>
            <dd data-testid="stats-avg-session" className="tabular-nums text-foreground">
              {formatPlayTime(avgSession)}
            </dd>
          </div>
        )}
        {lastPlayed && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Last Played</dt>
            <dd data-testid="stats-last-played" className="text-foreground">
              {new Date(lastPlayed).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Added</dt>
          <dd data-testid="stats-added" className="text-foreground">
            {new Date(game.addedAt).toLocaleDateString()}
          </dd>
        </div>
      </dl>
      {onViewFullStats && (
        <button
          data-testid="stats-view-full"
          className="mt-3 w-full rounded-md bg-secondary py-1.5 text-center text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={onViewFullStats}
        >
          View full stats
        </button>
      )}
    </div>
  );
}
