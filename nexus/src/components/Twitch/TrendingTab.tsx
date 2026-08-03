import * as React from "react";
import { TrendingUp, Users, Radio } from "lucide-react";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { formatViewerCount } from "@/lib/utils";
import { TrendingGameCard } from "./TrendingGameCard";

const MAX_GAMES_DISPLAY = 24;

/**
 * Dedicated "Trending" tab: a richer presentation of the games from the user's
 * library that are currently hot on Twitch. Reuses {@link TrendingGameCard}
 * (so the existing behavior/tests stay intact) but wraps the cards in a full
 * poster grid with a summary of aggregate viewers and live streams.
 */
export function TrendingTab() {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const { trendingGames, trendingLoading } = useTwitchStore();

  const games = trendingGames ?? [];
  const displayGames = games.slice(0, MAX_GAMES_DISPLAY);

  const totals = React.useMemo(() => {
    return games.reduce(
      (acc, g) => {
        acc.viewers += g.twitchViewerCount;
        acc.streams += g.twitchStreamCount;
        return acc;
      },
      { viewers: 0, streams: 0 },
    );
  }, [games]);

  return (
    <section aria-labelledby="trending-tab-heading" className="flex flex-col gap-5">
      <div>
        <h2
          id="trending-tab-heading"
          className="flex items-center gap-2 text-lg font-semibold text-foreground"
        >
          <TrendingUp className="size-5 shrink-0 text-primary" aria-hidden />
          Trending in Your Library
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Games you own that are hot on Twitch right now. Open a game to see its
          details, or browse its streams on Twitch.
        </p>
      </div>

      {games.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <TrendingUp className="size-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {games.length}
            </span>
            <span className="text-sm text-muted-foreground">trending</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatViewerCount(totals.viewers)}
            </span>
            <span className="text-sm text-muted-foreground">viewers</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Radio className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatViewerCount(totals.streams)}
            </span>
            <span className="text-sm text-muted-foreground">live streams</span>
          </div>
        </div>
      )}

      {trendingLoading && displayGames.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-md bg-muted"
              style={{ aspectRatio: "2/3" }}
            />
          ))}
        </div>
      ) : displayGames.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <TrendingUp
            className="mx-auto mb-3 size-8 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">
            Nothing trending yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!isOnline
              ? "You're offline. Trending games will appear when you reconnect."
              : "None of your library games are in Twitch's top categories right now. Check back later."}
          </p>
        </div>
      ) : (
        <div
          role="list"
          aria-label="Games in your library trending on Twitch"
          className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4"
        >
          {displayGames.map((game) => (
            <TrendingGameCard key={game.gameId} game={game} fluid />
          ))}
        </div>
      )}
    </section>
  );
}
