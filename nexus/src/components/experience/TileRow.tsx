import type { Game } from "@/stores/gameStore";

interface TileRowProps {
  title: string;
  count?: number;
  games: Game[];
  onTileClick: (gameId: string) => void;
  testid?: string;
}

/** Horizontal row of landscape art tiles, shared by the Backdrop shelves and Channel rows. */
export function TileRow({ title, count, games, onTileClick, testid }: TileRowProps) {
  if (games.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 px-6 pt-4" data-testid={testid}>
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
        {count !== undefined && <span className="ml-1.5 text-muted-foreground/60">· {count}</span>}
      </h2>
      <div className="scrollbar-hide flex gap-3 overflow-x-auto">
        {games.map((game) => (
          <button
            key={game.id}
            className="relative h-[84px] w-[150px] shrink-0 overflow-hidden rounded-lg bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onTileClick(game.id)}
            aria-label={game.name}
          >
            {(game.heroUrl ?? game.coverUrl) ? (
              <img
                src={(game.heroUrl ?? game.coverUrl)!}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-muted-foreground">
                {game.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-5 text-left text-[9px] font-medium uppercase tracking-wider text-white">
              {game.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
