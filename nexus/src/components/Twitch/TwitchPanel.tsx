import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw } from "lucide-react";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useGameStore } from "@/stores/gameStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatRelativeTime } from "@/lib/time";
import { TwitchConnectPrompt } from "./TwitchConnectPrompt";
import { TwitchEmptyState } from "./TwitchEmptyState";
import { StreamCard } from "./StreamCard";
import { TwitchSidebar } from "./TwitchSidebar";
import { ChannelDetail } from "./ChannelDetail";
import { TrendingTab } from "./TrendingTab";
import { twitchAuthStatus, validateTwitchToken } from "@/lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import type { LiveStreamItem, TwitchChannel } from "@/stores/twitchStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/uiStore";

const MAX_FAVORITES = 20;

type TwitchTab = "live" | "trending";

function isGameInLibrary(gameName: string, libraryNames: string[]): boolean {
  const lower = gameName.toLowerCase();
  return libraryNames.some((n) => n.toLowerCase() === lower);
}

/** Shell that wraps every Twitch view state with a consistent background. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {children}
    </div>
  );
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
  const [gameFilter, setGameFilter] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<TwitchTab>("live");
  const [selectedLogin, setSelectedLogin] = React.useState<string | null>(null);

  // Watching opens a native Tauri window served from
  // `http://localhost:PORT/watch?...` (see `src-tauri/src/twitch/embed_server.rs`),
  // the only way to satisfy Twitch's `frame-ancestors` CSP in packaged builds.
  // Each channel gets its own window keyed by `popout-{login}`.
  const handleWatch = React.useCallback((stream: LiveStreamItem) => {
    void invoke("popout_stream", {
      channelLogin: stream.login,
      channelDisplayName: stream.displayName,
      twitchGameId: stream.gameId || null,
      twitchGameName: stream.gameName || null,
    }).catch((e) => {
      console.error("[twitch] popout_stream failed:", e);
    });
  }, []);

  // Selecting a channel from the rail opens its detail/preview in the main pane.
  const handleSelectChannel = React.useCallback((channel: TwitchChannel) => {
    setSelectedLogin(channel.login);
    setActiveTab("live");
  }, []);

  const activeNav = useUiStore((s) => s.activeNav);
  const twitchPanelScrollToGameName = useUiStore(
    (s) => s.twitchPanelScrollToGameName,
  );
  const setTwitchPanelScrollToGameName = useUiStore(
    (s) => s.setTwitchPanelScrollToGameName,
  );

  // Story 19.8: scroll to game section when opened from library card badge.
  // Clear any open detail and return to the Live grid first so the target
  // cards are mounted.
  React.useEffect(() => {
    if (activeNav !== "twitch" || !twitchPanelScrollToGameName) return;
    setActiveTab("live");
    setSelectedLogin(null);
    const normalized = twitchPanelScrollToGameName.toLowerCase().trim();
    // Defer to the next frame so the grid is mounted before we scroll.
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-twitch-game-name][data-game-name-normalized="${normalized}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    setTwitchPanelScrollToGameName(null);
  }, [activeNav, twitchPanelScrollToGameName, setTwitchPanelScrollToGameName]);

  const favoritesCount = React.useMemo(
    () => channels.filter((c) => c.isFavorite === true).length,
    [channels],
  );
  const [mountRecoveryAttempted, setMountRecoveryAttempted] =
    React.useState(false);

  // Seed auth state and fetch on mount — use validateTwitchToken so expired
  // tokens are refreshed (not just locally checked). Falls back to local-only
  // twitchAuthStatus if validate fails (e.g. no client ID).
  React.useEffect(() => {
    setMountRecoveryAttempted(false);
    validateTwitchToken()
      .then((status) => {
        setIsAuthenticated(status.authenticated);
        setMountRecoveryAttempted(true);
        if (status.authenticated) {
          fetchFollowedStreams();
          fetchTrending();
        }
      })
      .catch(() => {
        twitchAuthStatus()
          .then((status) => {
            setIsAuthenticated(status.authenticated);
            setMountRecoveryAttempted(true);
            if (status.authenticated) {
              fetchFollowedStreams();
              fetchTrending();
            }
          })
          .catch(() => {
            setIsAuthenticated(false);
            setMountRecoveryAttempted(true);
          });
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
    // EventSub push notifications: re-fetch followed streams to converge UI state.
    const unlistenOnline = listen("twitch-stream-online", () => {
      fetchFollowedStreams();
    });
    const unlistenOffline = listen("twitch-stream-offline", () => {
      fetchFollowedStreams();
    });
    return () => {
      unlistenAuth.then((fn) => fn());
      unlistenData.then((fn) => fn());
      unlistenOnline.then((fn) => fn());
      unlistenOffline.then((fn) => fn());
    };
  }, [setIsAuthenticated, setLiveCount, fetchFollowedStreams]);

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

  const uniqueGames = React.useMemo(() => {
    const names = liveStreams.map((s) => s.gameName || "Just Chatting");
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [liveStreams]);

  // Live streams sorted favorites-first, then by viewer count.
  const sortedLiveStreams = React.useMemo(() => {
    return [...liveStreams].sort((a, b) => {
      const aFav =
        channels.find((c) => c.login === a.login)?.isFavorite === true ? 1 : 0;
      const bFav =
        channels.find((c) => c.login === b.login)?.isFavorite === true ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;
      return b.viewerCount - a.viewerCount;
    });
  }, [liveStreams, channels]);

  const filteredLiveStreams = React.useMemo(() => {
    if (!gameFilter) return sortedLiveStreams;
    return sortedLiveStreams.filter(
      (s) => (s.gameName || "Just Chatting") === gameFilter,
    );
  }, [sortedLiveStreams, gameFilter]);

  React.useEffect(() => {
    if (gameFilter && !uniqueGames.includes(gameFilter)) {
      setGameFilter("");
    }
  }, [gameFilter, uniqueGames]);

  // Drop the detail selection if the channel is no longer followed (e.g. after
  // a refresh removes it).
  const selectedChannel = React.useMemo(
    () => channels.find((c) => c.login === selectedLogin) ?? null,
    [channels, selectedLogin],
  );
  React.useEffect(() => {
    if (selectedLogin && !channels.some((c) => c.login === selectedLogin)) {
      setSelectedLogin(null);
    }
  }, [channels, selectedLogin]);

  const selectedStream = React.useMemo(
    () => liveStreams.find((s) => s.login === selectedLogin) ?? null,
    [liveStreams, selectedLogin],
  );

  const handleToggleFavorite = React.useCallback(
    (channelId: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite(channelId);
    },
    [toggleFavorite],
  );

  // Still checking auth on mount — show skeleton, not the connect prompt
  if (!isAuthenticated && !mountRecoveryAttempted) {
    return (
      <Shell>
        <div className="flex flex-1 overflow-hidden">
          <SidebarSkeleton />
          <div className="flex-1 p-6">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-video w-full animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // Unauthenticated (confirmed after mount recovery check)
  if (!isAuthenticated && !isLoading) {
    return (
      <Shell>
        <TwitchConnectPrompt />
      </Shell>
    );
  }

  // Loading (skeleton)
  if (isLoading && channels.length === 0) {
    return (
      <Shell>
        <div className="flex flex-1 overflow-hidden">
          <SidebarSkeleton />
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // Error and no cache
  if (error != null && channels.length === 0) {
    return (
      <Shell>
        <TwitchEmptyState variant="error" onRetry={handleRefresh} />
      </Shell>
    );
  }

  // Empty (authenticated, 0 channels)
  if (channels.length === 0) {
    return (
      <Shell>
        <TwitchEmptyState variant="empty" />
      </Shell>
    );
  }

  return (
    <TooltipProvider>
      <Shell>
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

        <div className="flex flex-1 overflow-hidden">
          <TwitchSidebar
            channels={channels}
            liveStreams={liveStreams}
            favoritesCount={favoritesCount}
            maxFavorites={MAX_FAVORITES}
            isLoading={isLoading}
            isOnline={isOnline}
            cachedAt={cachedAt}
            activeLogin={selectedLogin}
            onRefresh={handleRefresh}
            onSelectChannel={handleSelectChannel}
            onToggleFavorite={handleToggleFavorite}
          />

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TwitchTab)}
            className="flex flex-1 flex-col gap-0 overflow-hidden"
          >
            <div className="border-b border-border px-6 pt-4">
              <TabsList variant="line">
                <TabsTrigger value="live">Live</TabsTrigger>
                <TabsTrigger value="trending">Trending</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="live"
              className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden"
            >
              {selectedChannel ? (
                <ChannelDetail
                  channel={selectedChannel}
                  stream={selectedStream}
                  isFavorite={selectedChannel.isFavorite === true}
                  onToggleFavorite={handleToggleFavorite(selectedChannel.id)}
                  favoritesCount={favoritesCount}
                  maxFavorites={MAX_FAVORITES}
                  onWatch={handleWatch}
                  onClose={() => setSelectedLogin(null)}
                />
              ) : (
                <section aria-labelledby="live-now-heading">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2
                      id="live-now-heading"
                      className="flex items-center gap-2 text-lg font-semibold text-foreground"
                    >
                      <span
                        className={`size-2 rounded-full bg-destructive ${!reduceMotion ? "animate-play-pulse" : ""}`}
                        aria-hidden
                      />
                      Live Now
                    </h2>
                    {liveStreams.length > 0 && uniqueGames.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="twitch-game-filter"
                          className="text-sm text-muted-foreground"
                        >
                          Game
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
                  </div>

                  {liveStreams.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No one is live. Pick a channel from the list to see its
                      details.
                    </p>
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
                            data-game-name-normalized={gameName
                              .toLowerCase()
                              .trim()}
                          >
                            <StreamCard
                              stream={stream}
                              isInLibrary={isGameInLibrary(
                                gameName,
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
                              onSelect={handleWatch}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </TabsContent>

            <TabsContent
              value="trending"
              className="flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden"
            >
              <TrendingTab />
            </TabsContent>
          </Tabs>
        </div>
      </Shell>
    </TooltipProvider>
  );
}

/** Rail-shaped skeleton used while auth/data is loading. */
function SidebarSkeleton() {
  return (
    <aside className="glass-sidebar flex w-72 shrink-0 flex-col gap-3 border-r border-border p-3">
      <h1 className="text-base font-semibold tracking-tight text-foreground">
        Twitch
      </h1>
      <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
      <div className="flex flex-col gap-2 pt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
