import { useUiStore } from "@/stores/uiStore";
import type { TopGame } from "../LibraryStats";

interface TopGamesChartProps {
  games: TopGame[];
}

export function TopGamesChart({ games }: TopGamesChartProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
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
            const hours = Math.round(game.totalPlayTimeS / 3600);
            return (
              <button
                key={game.id}
                data-testid={`top-game-${i}`}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/5"
                onClick={() => setDetailOverlayGameId(game.id)}
              >
                <div className="size-8 shrink-0 overflow-hidden rounded">
                  {game.coverUrl ? (
                    <img
                      src={game.coverUrl}
                      alt={game.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-secondary" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs font-medium text-foreground hover:text-primary hover:underline">
                      {game.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {hours}h
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
