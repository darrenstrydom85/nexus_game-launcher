import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getAchievementStatus,
  evaluateAchievements,
  type AchievementStatus,
  type NewlyUnlocked,
} from "@/lib/tauri";

interface AchievementState {
  statuses: AchievementStatus[];
  loading: boolean;
  newUnlockCount: number;
  pendingNotifications: NewlyUnlocked[];
  highlightId: string | null;
}

interface AchievementActions {
  fetchStatuses: () => Promise<void>;
  evaluate: () => Promise<NewlyUnlocked[]>;
  dismissNotification: () => void;
  clearBadge: () => void;
  setHighlightId: (id: string | null) => void;
}

export type AchievementStore = AchievementState & AchievementActions;

export const useAchievementStore = create<AchievementStore>()(
  devtools(
    (set, get) => ({
      statuses: [],
      loading: false,
      newUnlockCount: 0,
      pendingNotifications: [],
      highlightId: null,

      fetchStatuses: async () => {
        set({ loading: true }, false, "fetchStatuses/start");
        try {
          const statuses = await getAchievementStatus();
          set({ statuses, loading: false }, false, "fetchStatuses/done");
        } catch {
          set({ loading: false }, false, "fetchStatuses/error");
        }
      },

      evaluate: async () => {
        try {
          const newlyUnlocked = await evaluateAchievements();
          if (newlyUnlocked.length > 0) {
            set(
              (state) => ({
                newUnlockCount: state.newUnlockCount + newlyUnlocked.length,
                pendingNotifications: [
                  ...state.pendingNotifications,
                  ...newlyUnlocked,
                ],
              }),
              false,
              "evaluate/unlocked",
            );
            await get().fetchStatuses();
          }
          return newlyUnlocked;
        } catch {
          return [];
        }
      },

      dismissNotification: () => {
        set(
          (state) => ({
            pendingNotifications: state.pendingNotifications.slice(1),
          }),
          false,
          "dismissNotification",
        );
      },

      clearBadge: () => {
        set({ newUnlockCount: 0 }, false, "clearBadge");
      },

      setHighlightId: (id) => {
        set({ highlightId: id }, false, "setHighlightId");
      },
    }),
    { name: "AchievementStore", enabled: import.meta.env.DEV },
  ),
);
