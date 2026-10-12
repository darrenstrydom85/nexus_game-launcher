import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getSimilarGames, type SimilarGame } from "@/lib/tauri";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useConnectivityStore } from "@/stores/connectivityStore";

// ponytail: session-only cache; IGDB's similar_games barely changes, no need to persist it.
const cache = new Map<number, SimilarGame[]>();

function open(url: string | null | undefined): void {
  if (url) openUrl(url).catch(() => {});
}

export function SimilarGamesRow({ igdbId }: { igdbId: number | null }) {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const games = useGameStore((s) => s.games);
  const openGame = useUiStore((s) => s.setDetailOverlayGameId);
  const [similar, setSimilar] = React.useState<SimilarGame[]>([]);

  React.useEffect(() => {
    if (igdbId == null || !isOnline) {
      setSimilar([]);
      return;
    }
    const hit = cache.get(igdbId);
    if (hit) {
      setSimilar(hit);
      return;
    }
    let cancelled = false;
    getSimilarGames(igdbId)
      .then((res) => {
        cache.set(igdbId, res);
        if (!cancelled) setSimilar(res);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [igdbId, isOnline]);

  const ownedIdByIgdb = React.useMemo(
    () => new Map(games.filter((g) => g.igdbId != null).map((g) => [g.igdbId!, g.id])),
    [games],
  );

  if (similar.length === 0) return null;

  return (
    <div data-testid="similar-games" className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">More like this</h3>
      {/* Capped tracks: covers stay ~100px however wide the column gets. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,112px))] gap-x-3 gap-y-4">
        {similar.map((s) => {
          const ownedId = ownedIdByIgdb.get(s.igdbId);
          return (
            <li key={s.igdbId} className="flex min-w-0 flex-col gap-1">
              <button
                type="button"
                data-testid={`similar-game-${s.igdbId}`}
                onClick={() => (ownedId ? openGame(ownedId) : open(s.stores[0]?.url ?? s.igdbUrl))}
                className="pressable img-outline group relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={ownedId ? `Open ${s.name} in your library` : `View ${s.name}`}
              >
                {s.coverUrl && (
                  <img
                    src={s.coverUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
                  />
                )}
                {ownedId && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    In library
                  </span>
                )}
              </button>
              <p className="line-clamp-2 text-xs font-medium text-foreground" title={s.name}>
                {s.name}
              </p>
              {!ownedId && s.stores.length > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  {s.stores.map((link) => (
                    <button
                      key={link.store}
                      type="button"
                      onClick={() => open(link.url)}
                      className="py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${s.name} on ${link.store}`}
                    >
                      {link.store}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
