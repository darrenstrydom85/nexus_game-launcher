import { motion } from "motion/react";
import { formatPlayTime } from "@/lib/utils";
import { resolveUrl } from "@/lib/url";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { WrappedReport } from "@/types/wrapped";

interface TopGamesCardProps {
  report: WrappedReport;
  isVisible: boolean;
}

export function TopGamesCard({ report, isVisible }: TopGamesCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const games = report.topGames.slice(0, 10);
  const maxTime = games[0]?.playTimeS ?? 1;

  return (
    <div
      data-testid="top-games-card"
      className="flex h-full flex-col justify-center gap-6 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Top Games
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          Your most-played titles
        </h2>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto">
        {games.map((game, i) => {
          const coverUrl = resolveUrl(game.coverUrl);
          const barWidth = (game.playTimeS / maxTime) * 100;
          const percent =
            report.totalPlayTimeS > 0
              ? ((game.playTimeS / report.totalPlayTimeS) * 100).toFixed(1)
              : "0.0";

          return (
            <div
              key={game.id}
              data-testid={`top-game-row-${i}`}
              className="flex items-center gap-3"
            >
              {/* Rank */}
              <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {i + 1}
              </span>

              {/* Cover thumbnail */}
              <div className="size-10 shrink-0 overflow-hidden rounded-md bg-card">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={game.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>

              {/* Bar + label */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {game.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatPlayTime(game.playTimeS)} · {percent}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: isVisible ? `${barWidth}%` : 0 }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.5, delay: i * 0.05, ease: "easeOut" }
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
