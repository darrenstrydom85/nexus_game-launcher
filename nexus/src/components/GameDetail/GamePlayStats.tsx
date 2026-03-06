import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPlayTime } from "@/lib/utils";
import type { Game } from "@/stores/gameStore";
import { usePerGameSessionStats } from "@/hooks/usePerGameSessionStats";
import { PerGameSessionPanel } from "./PerGameSessionPanel";

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
  const [expanded, setExpanded] = React.useState(false);
  const { stats: sessionStats, isLoading, fetch: fetchSessionStats } = usePerGameSessionStats(game.id);

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

  const handleToggle = React.useCallback(() => {
    setExpanded((prev) => {
      if (!prev) fetchSessionStats();
      return !prev;
    });
  }, [fetchSessionStats]);

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

      {/* Expandable session details */}
      <div className="mt-3 border-t border-border pt-3">
        <button
          data-testid="session-details-toggle"
          className={cn(
            "flex w-full items-center justify-between text-xs font-medium text-muted-foreground",
            "transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          onClick={handleToggle}
          aria-expanded={expanded}
        >
          View session details
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              data-testid="session-details-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: "hidden" }}
            >
              <div className="pt-3">
                <PerGameSessionPanel
                  stats={sessionStats}
                  isLoading={isLoading}
                  onViewFullStats={onViewFullStats}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
