import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getMasteryTier,
  getMasteryTiersBulk,
  type GameMasteryTier,
} from "@/lib/tauri";

interface MasteryState {
  tiers: Map<string, GameMasteryTier>;
  loading: boolean;
}

interface MasteryActions {
  fetchAll: () => Promise<void>;
  refreshGame: (gameId: string) => Promise<void>;
  getByGameId: (gameId: string) => GameMasteryTier | undefined;
}

export type MasteryStore = MasteryState & MasteryActions;

export const useMasteryStore = create<MasteryStore>()(
  devtools(
    (set, get) => ({
      tiers: new Map(),
      loading: false,

      fetchAll: async () => {
        set({ loading: true }, false, "fetchAll/start");
        try {
          const list = await getMasteryTiersBulk();
          const map = new Map<string, GameMasteryTier>();
          for (const entry of list) {
            map.set(entry.gameId, entry);
          }
          set({ tiers: map, loading: false }, false, "fetchAll/done");
        } catch {
          set({ loading: false }, false, "fetchAll/error");
        }
      },

      refreshGame: async (gameId: string) => {
        try {
          const tier = await getMasteryTier(gameId);
          const next = new Map(get().tiers);
          next.set(gameId, tier);
          set({ tiers: next }, false, "refreshGame");
        } catch {
          // best-effort — tier stays stale until next bulk fetch
        }
      },

      getByGameId: (gameId: string) => {
        return get().tiers.get(gameId);
      },
    }),
    { name: "MasteryStore", enabled: import.meta.env.DEV },
  ),
);
