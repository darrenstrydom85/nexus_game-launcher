import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { getStreak, recalculateStreak, type StreakSnapshot } from "@/lib/tauri";

interface StreakState {
  streak: StreakSnapshot | null;
  loading: boolean;
}

interface StreakActions {
  fetchStreak: () => Promise<void>;
  refreshAfterSession: () => Promise<StreakSnapshot | null>;
}

export type StreakStore = StreakState & StreakActions;

const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

export function checkMilestoneCrossed(
  prev: number,
  next: number,
): number | null {
  for (const milestone of STREAK_MILESTONES) {
    if (next >= milestone && prev < milestone) {
      return milestone;
    }
  }
  return null;
}

export const useStreakStore = create<StreakStore>()(
  devtools(
    (set, get) => ({
      streak: null,
      loading: false,

      fetchStreak: async () => {
        set({ loading: true }, false, "fetchStreak/start");
        try {
          const snapshot = await getStreak();
          set({ streak: snapshot, loading: false }, false, "fetchStreak/done");
        } catch {
          set({ loading: false }, false, "fetchStreak/error");
        }
      },

      refreshAfterSession: async () => {
        const prev = get().streak;
        try {
          const snapshot = await recalculateStreak();
          set({ streak: snapshot }, false, "refreshAfterSession");
          return snapshot;
        } catch {
          return prev;
        }
      },
    }),
    { name: "StreakStore", enabled: import.meta.env.DEV },
  ),
);
