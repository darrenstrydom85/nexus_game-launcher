import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import {
  getTwitchStreamsByGame,
  getTwitchTrendingLibraryGames,
  setTwitchFavorite,
  type StreamsByGameData,
  type TrendingLibraryGame,
} from "@/lib/tauri";

/** Live stream from API (camelCase from backend). */
export interface TwitchStream {
  title: string;
  gameName: string;
  gameId: string;
  viewerCount: number;
  thumbnailUrl: string;
  startedAt: string;
}

/** Followed channel from API; stream present when live. isFavorite (Story 19.7). */
export interface TwitchChannel {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  isLive: boolean;
  stream: TwitchStream | null;
  isFavorite?: boolean;
}

/** Live stream with channel identity for UI cards. */
export interface LiveStreamItem extends TwitchStream {
  login: string;
  displayName: string;
  profileImageUrl: string;
}

/** Payload for a go-live toast (Story 19.6). */
export interface PendingToastItem {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  gameName: string;
  title: string;
  isFavorite?: boolean;
}

export interface TwitchResponse<T> {
  data: T;
  stale: boolean;
  cachedAt: number | null;
}

const STREAMS_BY_GAME_TTL_MS = 2 * 60 * 1000; // 2 minutes (Story 19.5)

export interface StreamsByGameEntry {
  data: StreamsByGameData;
  cachedAt: number;
}

export interface TwitchState {
  liveCount: number;
  isAuthenticated: boolean;
  channels: TwitchChannel[];
  liveStreams: LiveStreamItem[];
  isLoading: boolean;
  error: string | null;
  stale: boolean;
  cachedAt: number | null;
  /** Per-game streams cache for game detail overlay (Story 19.5). Key: game name (trimmed). */
  streamsByGame: Record<string, StreamsByGameEntry>;
  streamsByGameLoading: Record<string, boolean>;
  streamsByGameError: Record<string, string | null>;
  /** Channel IDs that were live in the previous poll (Story 19.6 go-live detection). */
  previousLiveIds: Set<string>;
  /** Queue of go-live toasts to show (Story 19.6). */
  pendingToasts: PendingToastItem[];
  /** Trending in library (Story 19.9). */
  trendingGames: TrendingLibraryGame[];
  trendingStale: boolean;
  trendingCachedAt: number | null;
  trendingLoading: boolean;
  /** Story 19.11: true during recovery refresh so we don't fire go-live toasts. */
  isRecoveryRefresh: boolean;
}

export interface TwitchActions {
  setLiveCount: (count: number) => void;
  setIsAuthenticated: (value: boolean) => void;
  setRecoveryRefresh: (value: boolean) => void;
  fetchFollowedStreams: () => Promise<void>;
  refreshStreams: () => Promise<void>;
  clearError: () => void;
  /** Fetch streams for a game (cached 2 min, Story 19.5). */
  fetchStreamsByGame: (gameName: string) => Promise<void>;
  /** Remove a toast from the queue (Story 19.6). */
  removePendingToast: (id: string) => void;
  /** Toggle favorite for a channel (Story 19.7). Optimistic update; reverts on backend failure. Returns false if adding would exceed max (20). */
  toggleFavorite: (channelId: string) => Promise<boolean>;
  /** Fetch trending library games (Story 19.9). */
  fetchTrending: () => Promise<void>;
}

export type TwitchStore = TwitchState & TwitchActions;

/** Per-game live badge for library cards (Story 19.8). Key: normalized game name. */
export interface GameLiveBadgeInfo {
  count: number;
  streamers: { displayName: string; login: string }[];
}

function normalizeGameName(name: string): string {
  return name.toLowerCase().trim();
}

/** Cross-reference liveStreams (followed streamers) with library game names; case-insensitive. */
export function computeGameLiveBadgesMap(
  liveStreams: LiveStreamItem[],
  libraryGameNames: string[],
): Record<string, GameLiveBadgeInfo> {
  const libSet = new Set(
    libraryGameNames.map((n) => normalizeGameName(n)),
  );
  const byGame = new Map<string, GameLiveBadgeInfo>();
  for (const s of liveStreams) {
    const key = normalizeGameName(s.gameName);
    if (!libSet.has(key)) continue;
    const existing = byGame.get(key);
    const entry = {
      displayName: s.displayName,
      login: s.login,
    };
    if (!existing) {
      byGame.set(key, { count: 1, streamers: [entry] });
    } else {
      existing.count += 1;
      existing.streamers.push(entry);
    }
  }
  return Object.fromEntries(byGame);
}

function toLiveStreams(channels: TwitchChannel[]): LiveStreamItem[] {
  return channels
    .filter((c): c is TwitchChannel & { stream: TwitchStream } => c.stream != null)
    .map((c) => ({
      ...c.stream,
      login: c.login,
      displayName: c.displayName,
      profileImageUrl: c.profileImageUrl,
    }));
}

const initialState: TwitchState = {
  liveCount: 0,
  isAuthenticated: false,
  channels: [],
  liveStreams: [],
  isLoading: false,
  error: null,
  stale: false,
  cachedAt: null,
  streamsByGame: {},
  streamsByGameLoading: {},
  streamsByGameError: {},
  previousLiveIds: new Set(),
  pendingToasts: [],
  trendingGames: [],
  trendingStale: false,
  trendingCachedAt: null,
  trendingLoading: false,
  isRecoveryRefresh: false,
};

export const useTwitchStore = create<TwitchStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      setLiveCount: (count) =>
        set({ liveCount: count }, false, "setLiveCount"),
      setIsAuthenticated: (value) =>
        set({ isAuthenticated: value }, false, "setIsAuthenticated"),
      setRecoveryRefresh: (value) =>
        set({ isRecoveryRefresh: value }, false, "setRecoveryRefresh"),
      clearError: () => set({ error: null }, false, "clearError"),
      fetchFollowedStreams: async () => {
        set({ isLoading: true, error: null }, false, "fetchFollowedStreams_start");
        try {
          const res = await invoke<TwitchResponse<TwitchChannel[]>>(
            "get_twitch_followed_channels",
          );
          const liveStreams = toLiveStreams(res.data);
          const currentLiveIds = new Set(
            res.data.filter((c): c is TwitchChannel & { stream: TwitchStream } => c.stream != null).map((c) => c.id),
          );
          const prev = get().previousLiveIds;
          const isRecovery = get().isRecoveryRefresh;
          const newlyLiveIds =
            !res.stale && !isRecovery && prev.size > 0
              ? [...currentLiveIds].filter((id) => !prev.has(id))
              : [];
          const pendingToastsToAdd: PendingToastItem[] = newlyLiveIds
            .map((id): PendingToastItem | null => {
              const ch = res.data.find((c) => c.id === id && c.stream != null);
              if (!ch?.stream) return null;
              return {
                id: ch.id,
                login: ch.login,
                displayName: ch.displayName,
                profileImageUrl: ch.profileImageUrl,
                gameName: ch.stream.gameName,
                title: ch.stream.title,
                isFavorite: ch.isFavorite ?? false,
              };
            })
            .filter((t): t is PendingToastItem => t != null);
          set(
            {
              channels: res.data,
              liveStreams,
              isLoading: false,
              error: null,
              stale: res.stale,
              cachedAt: res.cachedAt,
              liveCount: liveStreams.length,
              isAuthenticated: true,
              previousLiveIds: currentLiveIds,
              pendingToasts: [...get().pendingToasts, ...pendingToastsToAdd],
              isRecoveryRefresh: false,
            },
            false,
            "fetchFollowedStreams_ok",
          );
        } catch (err) {
          const isAuthErr =
            typeof err === "object" && err !== null && "kind" in err && (err as { kind: string }).kind === "auth";
          const message =
            typeof err === "object" && err !== null && "message" in err
              ? (err as { message: string }).message
              : err instanceof Error
                ? err.message
                : String(err);
          set(
            {
              isLoading: false,
              error: message,
              isAuthenticated: isAuthErr ? false : get().isAuthenticated,
              isRecoveryRefresh: false,
            },
            false,
            "fetchFollowedStreams_err",
          );
        }
      },
      refreshStreams: async () => {
        await get().fetchFollowedStreams();
      },
      removePendingToast: (id) =>
        set(
          (s) => ({ pendingToasts: s.pendingToasts.filter((t) => t.id !== id) }),
          false,
          "removePendingToast",
        ),
      toggleFavorite: async (channelId) => {
        const state = get();
        const channel = state.channels.find((c) => c.id === channelId);
        if (!channel) return true;
        const nextFavorite = !(channel.isFavorite ?? false);
        const favoritesCount = state.channels.filter(
          (c) => c.isFavorite === true,
        ).length;
        if (nextFavorite && favoritesCount >= 20) return false;
        const prevChannels = state.channels;
        set(
          (s) => ({
            channels: s.channels.map((c) =>
              c.id === channelId ? { ...c, isFavorite: nextFavorite } : c,
            ),
          }),
          false,
          "toggleFavorite_optimistic",
        );
        try {
          await setTwitchFavorite(channelId, nextFavorite);
          return true;
        } catch {
          set({ channels: prevChannels }, false, "toggleFavorite_revert");
          set(
            (s) => ({ error: s.error ?? "Failed to update favorite." }),
            false,
            "toggleFavorite_err",
          );
          return true;
        }
      },
      fetchTrending: async () => {
        set({ trendingLoading: true }, false, "fetchTrending_start");
        try {
          const res = await getTwitchTrendingLibraryGames();
          set(
            {
              trendingGames: res.data,
              trendingStale: res.stale,
              trendingCachedAt: res.cachedAt,
              trendingLoading: false,
            },
            false,
            "fetchTrending_ok",
          );
        } catch {
          set(
            {
              trendingGames: [],
              trendingStale: false,
              trendingCachedAt: null,
              trendingLoading: false,
            },
            false,
            "fetchTrending_err",
          );
        }
      },
      fetchStreamsByGame: async (gameName: string) => {
        const key = gameName.trim();
        if (!key) return;
        const state = get();
        const entry = state.streamsByGame[key];
        if (
          entry &&
          Date.now() - entry.cachedAt < STREAMS_BY_GAME_TTL_MS
        ) {
          set(
            (s) => ({
              streamsByGameLoading: { ...s.streamsByGameLoading, [key]: false },
            }),
            false,
            "fetchStreamsByGame_cached",
          );
          return;
        }
        set(
          (s) => ({
            streamsByGameLoading: { ...s.streamsByGameLoading, [key]: true },
            streamsByGameError: { ...s.streamsByGameError, [key]: null },
          }),
          false,
          "fetchStreamsByGame_start",
        );
        try {
          const res = await getTwitchStreamsByGame(key);
          const cachedAt = res.cachedAt != null ? res.cachedAt * 1000 : Date.now();
          set(
            (s) => ({
              streamsByGame: {
                ...s.streamsByGame,
                [key]: { data: res.data, cachedAt },
              },
              streamsByGameLoading: { ...s.streamsByGameLoading, [key]: false },
              streamsByGameError: { ...s.streamsByGameError, [key]: null },
            }),
            false,
            "fetchStreamsByGame_ok",
          );
        } catch (err) {
          const message =
            typeof err === "object" && err !== null && "message" in err
              ? (err as { message: string }).message
              : err instanceof Error
                ? err.message
                : String(err);
          set(
            (s) => ({
              streamsByGameLoading: { ...s.streamsByGameLoading, [key]: false },
              streamsByGameError: { ...s.streamsByGameError, [key]: message },
            }),
            false,
            "fetchStreamsByGame_err",
          );
        }
      },
    }),
    { name: "TwitchStore", enabled: import.meta.env.DEV },
  ),
);
