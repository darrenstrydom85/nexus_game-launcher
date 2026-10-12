import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useTwitchStore, type LiveStreamItem } from "@/stores/twitchStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { twitchAuthStatus, validateTwitchToken } from "@/lib/tauri";

export const MAX_FAVORITES = 20;
const JUST_CHATTING = "Just Chatting";

export type TwitchTab = "live" | "trending";

const norm = (s: string) => s.toLowerCase().trim();
export const streamGame = (s: LiveStreamItem) => s.gameName || JUST_CHATTING;

/**
 * Everything the Twitch page does, lifted out of the classic TwitchPanel:
 * auth bootstrap, live events, refresh, favourites, the game filter and the
 * "open Twitch for this game" route from a library live badge.
 */
export function useTwitchPanel() {
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const channels = useTwitchStore((s) => s.channels);
  const liveStreams = useTwitchStore((s) => s.liveStreams);
  const isLoading = useTwitchStore((s) => s.isLoading);
  const error = useTwitchStore((s) => s.error);
  const stale = useTwitchStore((s) => s.stale);
  const cachedAt = useTwitchStore((s) => s.cachedAt);
  const trendingGames = useTwitchStore((s) => s.trendingGames);
  const games = useGameStore((s) => s.games);
  const pendingGame = useUiStore((s) => s.twitchPanelScrollToGameName);

  const [authChecked, setAuthChecked] = React.useState(false);
  const [tab, setTab] = React.useState<TwitchTab>("live");
  const [gameFilter, setGameFilter] = React.useState("");
  const [selectedLogin, setSelectedLogin] = React.useState<string | null>(null);

  // Validate (and refresh) the token on mount; fall back to the local check when that fails.
  React.useEffect(() => {
    const store = useTwitchStore.getState();
    const apply = (authenticated: boolean) => {
      store.setIsAuthenticated(authenticated);
      setAuthChecked(true);
      if (authenticated) {
        store.fetchFollowedStreams();
        store.fetchTrending();
      }
    };
    validateTwitchToken()
      .then((s) => apply(s.authenticated))
      .catch(() =>
        twitchAuthStatus()
          .then((s) => apply(s.authenticated))
          .catch(() => apply(false)),
      );
  }, []);

  React.useEffect(() => {
    const store = useTwitchStore.getState();
    const subs = [
      listen<{ authenticated: boolean }>("twitch-auth-changed", (e) => store.setIsAuthenticated(e.payload.authenticated)),
      listen<{ liveCount: number }>("twitch-data-updated", (e) => store.setLiveCount(e.payload.liveCount)),
      // EventSub pushes: refetch so the grid converges.
      listen("twitch-stream-online", () => store.fetchFollowedStreams()),
      listen("twitch-stream-offline", () => store.fetchFollowedStreams()),
    ];
    return () => subs.forEach((p) => p.then((off) => off()));
  }, []);

  const refresh = React.useCallback(() => {
    const store = useTwitchStore.getState();
    store.clearError();
    validateTwitchToken()
      .then((s) => {
        store.setIsAuthenticated(s.authenticated);
        if (s.authenticated) store.refreshStreams();
      })
      .catch(() => store.refreshStreams());
  }, []);

  const favorites = React.useMemo(() => new Set(channels.filter((c) => c.isFavorite).map((c) => c.login)), [channels]);
  const favoritesCount = favorites.size;

  // Favourites first, then by viewers.
  const sortedLive = React.useMemo(
    () =>
      [...liveStreams].sort(
        (a, b) => Number(favorites.has(b.login)) - Number(favorites.has(a.login)) || b.viewerCount - a.viewerCount,
      ),
    [liveStreams, favorites],
  );

  /** Games among live follows, most streams first. */
  const liveGames = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of liveStreams) counts.set(streamGame(s), (counts.get(streamGame(s)) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [liveStreams]);

  const filteredLive = React.useMemo(
    () => (gameFilter ? sortedLive.filter((s) => streamGame(s) === gameFilter) : sortedLive),
    [sortedLive, gameFilter],
  );

  // A filter for a game nobody is streaming any more falls back to all.
  React.useEffect(() => {
    if (gameFilter && !liveGames.some((g) => g.name === gameFilter)) setGameFilter("");
  }, [gameFilter, liveGames]);

  // From a library card's live badge: show that game's streams. Waits for the
  // auth check and any fetch in flight so the filter has something to match.
  React.useEffect(() => {
    if (!pendingGame || !authChecked || isLoading) return;
    const match = liveGames.find((g) => norm(g.name) === norm(pendingGame));
    setTab("live");
    setSelectedLogin(null);
    setGameFilter(match?.name ?? "");
    useUiStore.getState().setTwitchPanelScrollToGameName(null);
  }, [pendingGame, authChecked, isLoading, liveGames]);

  // Drop a selection that is no longer followed.
  const selectedChannel = channels.find((c) => c.login === selectedLogin) ?? null;
  React.useEffect(() => {
    if (selectedLogin && !channels.some((c) => c.login === selectedLogin)) setSelectedLogin(null);
  }, [channels, selectedLogin]);
  const selectedStream = liveStreams.find((s) => s.login === selectedLogin) ?? null;

  const libraryNames = React.useMemo(() => new Set(games.map((g) => norm(g.name))), [games]);
  const isInLibrary = React.useCallback((s: LiveStreamItem) => libraryNames.has(norm(streamGame(s))), [libraryNames]);

  /** False when adding would pass the cap; removing is always allowed. */
  const canToggleFavorite = React.useCallback(
    (login: string) => favorites.has(login) || favoritesCount < MAX_FAVORITES,
    [favorites, favoritesCount],
  );
  const toggleFavorite = React.useCallback(
    (login: string) => {
      const channel = channels.find((c) => c.login === login);
      if (channel && canToggleFavorite(login)) useTwitchStore.getState().toggleFavorite(channel.id);
    },
    [channels, canToggleFavorite],
  );

  // Watching opens a native popout window (the only way past Twitch's frame-ancestors CSP).
  const watch = React.useCallback((s: LiveStreamItem) => {
    invoke("popout_stream", {
      channelLogin: s.login,
      channelDisplayName: s.displayName,
      twitchGameId: s.gameId || null,
      twitchGameName: s.gameName || null,
    }).catch((e) => {
      console.error("[twitch] popout_stream failed:", e);
      useToastStore.getState().addToast({ type: "error", message: "Couldn’t open the stream." });
    });
  }, []);

  const selectChannel = React.useCallback((login: string | null) => {
    setSelectedLogin(login);
    if (login) setTab("live");
  }, []);

  return {
    authChecked,
    isAuthenticated,
    isLoading,
    error,
    stale,
    cachedAt,
    channels,
    liveStreams,
    trendingGames,
    tab,
    setTab,
    gameFilter,
    setGameFilter,
    liveGames,
    filteredLive,
    favorites,
    favoritesCount,
    canToggleFavorite,
    toggleFavorite,
    selectedChannel,
    selectedStream,
    selectChannel,
    isInLibrary,
    watch,
    refresh,
  };
}
