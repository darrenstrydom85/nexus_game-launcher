import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, ChevronDown, ChevronRight, Star, WifiOff } from "lucide-react";
import { useTwitchStore, type LiveStreamItem } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useGameStore } from "@/stores/gameStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatRelativeTime } from "@/lib/time";
import { TwitchConnectPrompt } from "./TwitchConnectPrompt";
import { TwitchEmptyState } from "./TwitchEmptyState";
import { StreamCard } from "./StreamCard";
import { OfflineChannelRow } from "./OfflineChannelRow";
import { TrendingInLibrary } from "./TrendingInLibrary";
import { twitchAuthStatus } from "@/lib/tauri";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/uiStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAX_FAVORITES = 20;

function groupByGame(streams: LiveStreamItem[]): [string, LiveStreamItem[]][] {
  const grouped = streams.reduce<Record<string, LiveStreamItem[]>>((acc, s) => {
    const key = s.gameName || "Just Chatting";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});
  return Object.entries(grouped).sort(([, a], [, b]) => b.length - a.length);
}

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
  const favoriteLiveStreams = React.useMemo(() => {
    return liveStreams.filter((s) => {
      const ch = channels.find((c) => c.login === s.login);
      return ch?.isFavorite === true;
    });
  }, [channels, liveStreams]);

  // Seed auth state and fetch on mount
  React.useEffect(() => {
    twitchAuthStatus()
      .then((status) => {
        setIsAuthenticated(status.authenticated);
        if (status.authenticated) {
          fetchFollowedStreams();
          fetchTrending();
        }
      })
      .catch(() => setIsAuthenticated(false));
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
    refreshStreams();
  }, [refreshStreams, clearError]);

  const nonFavoriteLiveStreams = React.useMemo(
    () =>
      liveStreams.filter(
        (s) =>
          !channels.find((c) => c.login === s.login && c.isFavorite === true),
      ),
    [channels, liveStreams],
  );
  const grouped = React.useMemo(
    () => groupByGame(nonFavoriteLiveStreams),
    [nonFavoriteLiveStreams],
  );
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
      <div className="sticky top-0 z-10 flex flex-col gap-1 border-b border-border bg-background px-6 py-4">
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
          {favoriteLiveStreams.length === 0 && grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is live.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Favorites group (Story 19.7) */}
              {favoriteLiveStreams.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Star
                      className="size-3.5 shrink-0 text-yellow-500"
                      fill="currentColor"
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-foreground">
                      Favorites
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {favoriteLiveStreams.length} stream
                      {favoriteLiveStreams.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    {favoriteLiveStreams.map((stream) => {
                      const channel = channels.find(
                        (c) => c.login === stream.login,
                      );
                      return (
                        <StreamCard
                          key={stream.login}
                          stream={stream}
                          isInLibrary={isGameInLibrary(
                            stream.gameName,
                            libraryNames,
                          )}
                          isFavorite={channel?.isFavorite === true}
                          onToggleFavorite={
                            channel
                              ? handleToggleFavorite(channel.id)
                              : undefined
                          }
                          favoritesCount={favoritesCount}
                          maxFavorites={MAX_FAVORITES}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {grouped.map(([gameName, streams]) => (
                <div
                  key={gameName}
                  data-twitch-game-name
                  data-game-name-normalized={gameName.toLowerCase().trim()}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {gameName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {streams.length} stream{streams.length !== 1 ? "s" : ""}
                    </span>
                    {isGameInLibrary(gameName, libraryNames) && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        In Library
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                    {streams.map((stream) => {
                      const channel = channels.find(
                        (c) => c.login === stream.login,
                      );
                      return (
                        <StreamCard
                          key={stream.login}
                          stream={stream}
                          isInLibrary={isGameInLibrary(
                            stream.gameName,
                            libraryNames,
                          )}
                          isFavorite={channel?.isFavorite === true}
                          onToggleFavorite={
                            channel
                              ? handleToggleFavorite(channel.id)
                              : undefined
                          }
                          favoritesCount={favoritesCount}
                          maxFavorites={MAX_FAVORITES}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
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
