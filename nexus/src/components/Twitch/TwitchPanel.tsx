import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, ChevronDown, ChevronRight, WifiOff } from "lucide-react";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useGameStore } from "@/stores/gameStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatRelativeTime } from "@/lib/time";
import { TwitchConnectPrompt } from "./TwitchConnectPrompt";
import { TwitchEmptyState } from "./TwitchEmptyState";
import { StreamCard } from "./StreamCard";
import { OfflineChannelRow } from "./OfflineChannelRow";
import { TrendingInLibrary } from "./TrendingInLibrary";
import { twitchAuthStatus, validateTwitchToken } from "@/lib/tauri";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/uiStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAX_FAVORITES = 20;

function isGameInLibrary(gameName: string, libraryNames: string[]): boolean {
  const lower = gameName.toLowerCase();
  return libraryNames.some((n) => n.toLowerCase() === lower);
}

export function TwitchPanel() {
  const reduceMotion = useReducedMotion();
  const games = useGameStore((s) => s.games);
  const libraryNames = React.useMemo(() => games.map((g) => g.name), [games]);

  const {
    isAuthenticated,
    channels,
    liveStreams,
    isLoading,
    error,
    stale,
    cachedAt,
    fetchFollowedStreams,
    fetchTrending,
    refreshStreams,
    setLiveCount,
    setIsAuthenticated,
    clearError,
    toggleFavorite,
  } = useTwitchStore();

  const isOnline = useConnectivityStore((s) => s.isOnline);
  const [offlineOpen, setOfflineOpen] = React.useState(false);
  const [gameFilter, setGameFilter] = React.useState<string>("");
  const activeNav = useUiStore((s) => s.activeNav);
  const twitchPanelScrollToGameName = useUiStore(
    (s) => s.twitchPanelScrollToGameName,
  );
  const setTwitchPanelScrollToGameName = useUiStore(
    (s) => s.setTwitchPanelScrollToGameName,
  );

  // Story 19.8: scroll to game section when opened from library card badge
  React.useEffect(() => {
    if (activeNav !== "twitch" || !twitchPanelScrollToGameName) return;
    const normalized = twitchPanelScrollToGameName.toLowerCase().trim();
    const el = document.querySelector(
      `[data-twitch-game-name][data-game-name-normalized="${normalized}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTwitchPanelScrollToGameName(null);
  }, [
    activeNav,
    twitchPanelScrollToGameName,
    setTwitchPanelScrollToGameName,
  ]);

  const favoritesCount = React.useMemo(
    () => channels.filter((c) => c.isFavorite === true).length,
    [channels],
  );
  // Seed auth state and fetch on mount — use validateTwitchToken so expired
  // tokens are refreshed (not just locally checked). Falls back to local-only
  // twitchAuthStatus if validate fails (e.g. no client ID).
  React.useEffect(() => {
    validateTwitchToken()
      .then((status) => {
        setIsAuthenticated(status.authenticated);
        if (status.authenticated) {
          fetchFollowedStreams();
          fetchTrending();
        }
      })
      .catch(() => {
        twitchAuthStatus()
          .then((status) => {
            setIsAuthenticated(status.authenticated);
            if (status.authenticated) {
              fetchFollowedStreams();
              fetchTrending();
            }
          })
          .catch(() => setIsAuthenticated(false));
      });
  }, [setIsAuthenticated, fetchFollowedStreams, fetchTrending]);

  // Listen for auth and data events
  React.useEffect(() => {
    const unlistenAuth = listen<{ authenticated: boolean }>(
      "twitch-auth-changed",
      (event) => setIsAuthenticated(event.payload.authenticated),
    );
    const unlistenData = listen<{ liveCount: number }>(
      "twitch-data-updated",
      (event) => setLiveCount(event.payload.liveCount),
    );
    return () => {
      unlistenAuth.then((fn) => fn());
      unlistenData.then((fn) => fn());
    };
  }, [setIsAuthenticated, setLiveCount]);

  const handleRefresh = React.useCallback(() => {
    clearError();
    validateTwitchToken()
      .then((status) => {
        setIsAuthenticated(status.authenticated);
        if (status.authenticated) {
          refreshStreams();
        }
      })
      .catch(() => {
        refreshStreams();
      });
  }, [refreshStreams, clearError, setIsAuthenticated]);

  const offlineChannels = React.useMemo(
    () =>
      channels
        .filter((c) => !c.isLive)
        .sort((a, b) => {
          const aFav = a.isFavorite === true ? 1 : 0;
          const bFav = b.isFavorite === true ? 1 : 0;
          if (bFav !== aFav) return bFav - aFav;
          return a.displayName.localeCompare(b.displayName);
        }),
    [channels],
  );

  const uniqueGames = React.useMemo(() => {
    const names = liveStreams.map((s) => s.gameName || "Just Chatting");
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [liveStreams]);

  const filteredLiveStreams = React.useMemo(() => {
    const base = gameFilter
      ? liveStreams.filter(
          (s) => (s.gameName || "Just Chatting") === gameFilter,
        )
      : liveStreams;
    return [...base].sort((a, b) => {
      const aFav = channels.find((c) => c.login === a.login)?.isFavorite === true ? 1 : 0;
      const bFav = channels.find((c) => c.login === b.login)?.isFavorite === true ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;
      return b.viewerCount - a.viewerCount;
    });
  }, [liveStreams, gameFilter, channels]);

  React.useEffect(() => {
    if (gameFilter && !uniqueGames.includes(gameFilter)) {
      setGameFilter("");
    }
  }, [gameFilter, uniqueGames]);

  const handleToggleFavorite = React.useCallback(
    (channelId: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite(channelId);
    },
    [toggleFavorite],
  );

  // Unauthenticated
  if (!isAuthenticated && !isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <TwitchConnectPrompt />
      </div>
    );
  }

  // Loading (skeleton)
  if (isLoading && channels.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Twitch
          </h1>
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-card"
              >
                <div className="aspect-video w-full animate-pulse bg-muted" />
                <div className="flex flex-col gap-2 p-3">
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="flex items-center gap-2">
                    <div className="size-6 animate-pulse rounded-full bg-muted" />
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error and no cache
  if (error != null && channels.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <TwitchEmptyState variant="error" onRetry={handleRefresh} />
      </div>
    );
  }

  // Empty (authenticated, 0 channels)
  if (channels.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <TwitchEmptyState variant="empty" />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Stale bar (Story 19.11: role and aria-live for a11y) */}
      {stale && cachedAt != null && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-2 border-b border-border bg-warning/10 px-4 py-2 text-warning"
        >
          <span className="text-sm">
            Showing cached data · Last updated {formatRelativeTime(cachedAt)}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded p-1 hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Refresh"
          >
            <RefreshCw className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Twitch
            </h1>
            <p className="text-sm text-muted-foreground">
              Following {channels.length} channels · {liveStreams.length} live
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="flex items-center text-warning"
                    aria-label="Offline — showing cached data"
                  >
                    <WifiOff className="size-[14px]" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>You&apos;re offline. Showing cached data.</p>
                </TooltipContent>
              </Tooltip>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw
                className={`size-4 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden
              />
            </button>
            {cachedAt != null && (
              <span className="text-xs text-muted-foreground">
                Last updated {formatRelativeTime(cachedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Trending in Your Library (Story 19.9) */}
        <TrendingInLibrary />

        {liveStreams.length > 0 && uniqueGames.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <label
              htmlFor="twitch-game-filter"
              className="text-sm text-muted-foreground"
            >
              Filter Streams by Game
            </label>
            <select
              id="twitch-game-filter"
              data-testid="twitch-game-filter"
              aria-label="Filter live streams by game"
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="">All games</option>
              {uniqueGames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Live Now */}
        <section className="mb-8" aria-labelledby="live-now-heading">
          <h2
            id="live-now-heading"
            className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"
          >
            <span
              className={`size-2 rounded-full bg-red-500 ${!reduceMotion ? "animate-play-pulse" : ""}`}
              aria-hidden
            />
            Live Now
          </h2>
          {liveStreams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is live.</p>
          ) : filteredLiveStreams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No streams for this game. Try another filter.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {filteredLiveStreams.map((stream) => {
                const channel = channels.find(
                  (c) => c.login === stream.login,
                );
                const gameName = stream.gameName || "Just Chatting";
                return (
                  <div
                    key={stream.login}
                    data-twitch-game-name
                    data-game-name-normalized={gameName.toLowerCase().trim()}
                  >
                    <StreamCard
                      stream={stream}
                      isInLibrary={isGameInLibrary(gameName, libraryNames)}
                      isFavorite={channel?.isFavorite === true}
                      onToggleFavorite={
                        channel
                          ? handleToggleFavorite(channel.id)
                          : undefined
                      }
                      favoritesCount={favoritesCount}
                      maxFavorites={MAX_FAVORITES}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Offline (collapsible) */}
        <section aria-labelledby="offline-heading">
          <button
            type="button"
            id="offline-heading"
            onClick={() => setOfflineOpen((o) => !o)}
            className="mb-2 flex w-full items-center gap-2 text-left text-lg font-semibold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-expanded={offlineOpen}
          >
            {offlineOpen ? (
              <ChevronDown className="size-5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-5 shrink-0" aria-hidden />
            )}
            Offline
            <span className="text-sm font-normal text-muted-foreground">
              ({offlineChannels.length})
            </span>
          </button>
          {offlineOpen && (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-card/50 p-2">
              {offlineChannels.map((channel) => (
                <OfflineChannelRow
                  key={channel.id}
                  channel={channel}
                  lastSeenGame={null}
                  isFavorite={channel.isFavorite === true}
                  onToggleFavorite={handleToggleFavorite(channel.id)}
                  favoritesCount={favoritesCount}
                  maxFavorites={MAX_FAVORITES}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
    </TooltipProvider>
  );
}
