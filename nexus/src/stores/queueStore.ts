import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getPlayQueue,
  addToPlayQueue,
  removeFromPlayQueue,
  reorderPlayQueue,
  clearPlayQueue,
  type PlayQueueEntry,
} from "@/lib/tauri";
import { useToastStore } from "./toastStore";

interface QueueState {
  entries: PlayQueueEntry[];
  loading: boolean;
}

interface QueueActions {
  fetch: () => Promise<void>;
  add: (gameId: string, gameName?: string) => Promise<void>;
  remove: (gameId: string, gameName?: string) => Promise<void>;
  reorder: (gameIds: string[]) => Promise<void>;
  clear: () => Promise<void>;
  isQueued: (gameId: string) => boolean;
}

export type QueueStore = QueueState & QueueActions;

export const useQueueStore = create<QueueStore>()(
  devtools(
    (set, get) => ({
      entries: [],
      loading: false,

      fetch: async () => {
        set({ loading: true }, false, "queue/fetchStart");
        try {
          const entries = await getPlayQueue();
          set({ entries, loading: false }, false, "queue/fetchDone");
        } catch {
          set({ loading: false }, false, "queue/fetchError");
        }
      },

      add: async (gameId, gameName) => {
        const prev = get().entries;
        try {
          const entry = await addToPlayQueue(gameId);
          set({ entries: [...prev, entry] }, false, "queue/add");
          if (gameName) {
            useToastStore
              .getState()
              .addToast({ type: "success", message: `${gameName} added to queue` });
          }
        } catch {
          useToastStore
            .getState()
            .addToast({ type: "error", message: "Failed to add to queue" });
        }
      },

      remove: async (gameId, gameName) => {
        const prev = get().entries;
        set(
          { entries: prev.filter((e) => e.gameId !== gameId) },
          false,
          "queue/removeOptimistic",
        );
        try {
          await removeFromPlayQueue(gameId);
          await get().fetch();
          if (gameName) {
            useToastStore
              .getState()
              .addToast({ type: "info", message: `${gameName} removed from queue` });
          }
        } catch {
          set({ entries: prev }, false, "queue/removeRevert");
          useToastStore
            .getState()
            .addToast({ type: "error", message: "Failed to remove from queue" });
        }
      },

      reorder: async (gameIds) => {
        const prev = get().entries;
        const reordered = gameIds
          .map((gid, i) => {
            const entry = prev.find((e) => e.gameId === gid);
            return entry ? { ...entry, position: i } : null;
          })
          .filter(Boolean) as PlayQueueEntry[];
        set({ entries: reordered }, false, "queue/reorderOptimistic");
        try {
          await reorderPlayQueue(gameIds);
        } catch {
          set({ entries: prev }, false, "queue/reorderRevert");
          useToastStore
            .getState()
            .addToast({ type: "error", message: "Failed to reorder queue" });
        }
      },

      clear: async () => {
        const prev = get().entries;
        set({ entries: [] }, false, "queue/clearOptimistic");
        try {
          await clearPlayQueue();
        } catch {
          set({ entries: prev }, false, "queue/clearRevert");
          useToastStore
            .getState()
            .addToast({ type: "error", message: "Failed to clear queue" });
        }
      },

      isQueued: (gameId) => get().entries.some((e) => e.gameId === gameId),
    }),
    { name: "QueueStore", enabled: import.meta.env.DEV },
  ),
);
