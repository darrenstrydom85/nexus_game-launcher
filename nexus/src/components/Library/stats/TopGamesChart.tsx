import { formatPlayTime } from "@/lib/utils";
import { HardDriveDownload } from "lucide-react";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { useGameResolver } from "@/hooks/useGameResolver";
import type { TopGame } from "../LibraryStats";

interface TopGamesChartProps {
  games: TopGame[];
}

export function TopGamesChart({ games }: TopGamesChartProps) {
  const { resolve, openGame } = useGameResolver();
  const top10 = games.slice(0, 10);
  const maxTime = top10[0]?.totalPlayTimeS ?? 1;

  return (
    <div data-testid="top-games-chart">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Top 10 Games
      </h3>
      {top10.length === 0 ? (
        <p className="text-sm text-muted-foreground">No play data yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {top10.map((game, i) => {
            const pct = Math.round((game.totalPlayTimeS / maxTime) * 100);
            const resolved = resolve(game.id, game.name);
            const coverUrl = game.coverUrl ?? resolved?.game.coverUrl ?? null;
            const isClickable = !!resolved;
            return (
              <button
                key={game.id}
                data-testid={`top-game-${i}`}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/5"
                onClick={() => openGame(game.id, game.name)}
              >
                <div className="relative size-8 shrink-0 overflow-hidden rounded">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={game.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ background: placeholderGradient(game.name) }}
                    >
                      <span className="text-xs font-bold text-white/80">
                        {game.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {resolved?.isRemoved && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60" title="Uninstalled">
                      <HardDriveDownload className="size-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className={`truncate text-xs font-medium ${isClickable ? "text-foreground hover:text-primary hover:underline" : "text-muted-foreground"}`}>
                      {game.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatPlayTime(game.totalPlayTimeS)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
