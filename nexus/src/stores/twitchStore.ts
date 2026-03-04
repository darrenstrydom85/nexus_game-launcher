import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import {
  getTwitchStreamsByGame,
  type StreamsByGameData,
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

/** Followed channel from API; stream present when live. */
export interface TwitchChannel {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  isLive: boolean;
  stream: TwitchStream | null;
}

/** Live stream with channel identity for UI cards. */
export interface LiveStreamItem extends TwitchStream {
  login: string;
  displayName: string;
  profileImageUrl: string;
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
}

export interface TwitchActions {
  setLiveCount: (count: number) => void;
  setIsAuthenticated: (value: boolean) => void;
  fetchFollowedStreams: () => Promise<void>;
  refreshStreams: () => Promise<void>;
  clearError: () => void;
  /** Fetch streams for a game (cached 2 min, Story 19.5). */
  fetchStreamsByGame: (gameName: string) => Promise<void>;
}

export type TwitchStore = TwitchState & TwitchActions;

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
};

export const useTwitchStore = create<TwitchStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      setLiveCount: (count) =>
        set({ liveCount: count }, false, "setLiveCount"),
      setIsAuthenticated: (value) =>
        set({ isAuthenticated: value }, false, "setIsAuthenticated"),
      clearError: () => set({ error: null }, false, "clearError"),
      fetchFollowedStreams: async () => {
        set({ isLoading: true, error: null }, false, "fetchFollowedStreams_start");
        try {
          const res = await invoke<TwitchResponse<TwitchChannel[]>>(
            "get_twitch_followed_channels",
          );
          const liveStreams = toLiveStreams(res.data);
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
            },
            false,
            "fetchFollowedStreams_ok",
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isAuth = /auth|token|login|unauthorized/i.test(message);
          set(
            {
              isLoading: false,
              error: message,
              isAuthenticated: isAuth ? false : get().isAuthenticated,
            },
            false,
            "fetchFollowedStreams_err",
          );
        }
      },
      refreshStreams: async () => {
        await get().fetchFollowedStreams();
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
          const message = err instanceof Error ? err.message : String(err);
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
