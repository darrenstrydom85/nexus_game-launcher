import * as React from "react";
import { formatPlayTime } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore } from "@/stores/gameStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import type { TopGame } from "../LibraryStats";

interface TopGamesChartProps {
  games: TopGame[];
}

export function TopGamesChart({ games }: TopGamesChartProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const storeGames = useGameStore((s) => s.games);
  const top10 = games.slice(0, 10);
  const maxTime = top10[0]?.totalPlayTimeS ?? 1;

  const storeById = React.useMemo(
    () => new Map(storeGames.map((g) => [g.id, g])),
    [storeGames],
  );
  const storeByName = React.useMemo(
    () => new Map(storeGames.map((g) => [g.name.toLowerCase(), g])),
    [storeGames],
  );

  const resolveStoreGame = (game: TopGame) =>
    storeById.get(game.id) ?? storeByName.get(game.name.toLowerCase()) ?? null;

  const handleClick = (game: TopGame) => {
    const match = resolveStoreGame(game);
    if (match) setDetailOverlayGameId(match.id);
  };

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
            const match = resolveStoreGame(game);
            const coverUrl = game.coverUrl ?? match?.coverUrl ?? null;
            return (
              <button
                key={game.id}
                data-testid={`top-game-${i}`}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/5"
                onClick={() => handleClick(game)}
              >
                <div className="size-8 shrink-0 overflow-hidden rounded">
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
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className={`truncate text-xs font-medium ${match ? "text-foreground hover:text-primary hover:underline" : "text-muted-foreground"}`}>
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
