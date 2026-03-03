import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  KeyStatus,
  MetadataProgressEvent,
  MetadataStatus,
} from "../lib/tauri";
import {
  fetchArtwork,
  fetchMetadata,
  getCacheStats,
  getKeyStatus,
  verifyIgdbKeys,
  verifySteamgridKey,
} from "../lib/tauri";

export interface MetadataFetchState {
  gameId: string;
  gameName: string;
  status: MetadataStatus;
  progress?: number;
  error?: string;
}

export interface MetadataState {
  keyStatus: KeyStatus | null;
  fetchQueue: MetadataFetchState[];
  totalCacheBytes: number;
  isVerifyingSteamgrid: boolean;
  isVerifyingIgdb: boolean;
}

export interface MetadataActions {
  loadKeyStatus: () => Promise<void>;
  verifySteamgrid: () => Promise<{ valid: boolean; message: string }>;
  verifyIgdb: () => Promise<{ valid: boolean; message: string }>;
  triggerMetadataFetch: (gameId: string) => Promise<void>;
  triggerArtworkFetch: (gameId: string) => Promise<void>;
  loadCacheStats: () => Promise<void>;
  handleProgressEvent: (event: MetadataProgressEvent) => void;
}

export type MetadataStore = MetadataState & MetadataActions;

const initialState: MetadataState = {
  keyStatus: null,
  fetchQueue: [],
  totalCacheBytes: 0,
  isVerifyingSteamgrid: false,
  isVerifyingIgdb: false,
};

export const useMetadataStore = create<MetadataStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadKeyStatus: async () => {
        try {
          const status = await getKeyStatus();
          set({ keyStatus: status }, false, "loadKeyStatus");
        } catch {
          // Key status unavailable
        }
      },

      verifySteamgrid: async () => {
        set({ isVerifyingSteamgrid: true }, false, "verifySteamgrid/start");
        try {
          const result = await verifySteamgridKey();
          await get().loadKeyStatus();
          return result;
        } finally {
          set(
            { isVerifyingSteamgrid: false },
            false,
            "verifySteamgrid/end",
          );
        }
      },

      verifyIgdb: async () => {
        set({ isVerifyingIgdb: true }, false, "verifyIgdb/start");
        try {
          const result = await verifyIgdbKeys();
          await get().loadKeyStatus();
          return result;
        } finally {
          set({ isVerifyingIgdb: false }, false, "verifyIgdb/end");
        }
      },

      triggerMetadataFetch: async (gameId: string) => {
        set(
          (state) => ({
            fetchQueue: [
              ...state.fetchQueue.filter((f) => f.gameId !== gameId),
              {
                gameId,
                gameName: "",
                status: "queued" as MetadataStatus,
              },
            ],
          }),
          false,
          "triggerMetadataFetch",
        );
        try {
          await fetchMetadata(gameId);
        } catch {
          set(
            (state) => ({
              fetchQueue: state.fetchQueue.map((f) =>
                f.gameId === gameId
                  ? { ...f, status: "failed" as MetadataStatus }
                  : f,
              ),
            }),
            false,
            "triggerMetadataFetch/error",
          );
        }
      },

      triggerArtworkFetch: async (gameId: string) => {
        try {
          await fetchArtwork(gameId);
        } catch {
          // Artwork fetch failed silently
        }
      },

      loadCacheStats: async () => {
        try {
          const stats = await getCacheStats();
          set(
            { totalCacheBytes: stats.totalBytes },
            false,
            "loadCacheStats",
          );
        } catch {
          // Cache stats unavailable
        }
      },

      handleProgressEvent: (event: MetadataProgressEvent) => {
        set(
          (state) => {
            const existing = state.fetchQueue.findIndex(
              (f) => f.gameId === event.gameId,
            );
            const entry: MetadataFetchState = {
              gameId: event.gameId,
              gameName: event.gameName,
              status: event.status,
              progress: event.progress,
              error: event.error,
            };

            if (existing >= 0) {
              const updated = [...state.fetchQueue];
              updated[existing] = entry;
              return { fetchQueue: updated };
            }
            return { fetchQueue: [...state.fetchQueue, entry] };
          },
          false,
          "handleProgressEvent",
        );
      },
    }),
    { name: "MetadataStore", enabled: import.meta.env.DEV },
  ),
);
