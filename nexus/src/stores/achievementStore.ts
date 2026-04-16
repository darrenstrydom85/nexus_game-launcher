import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getAchievementStatus,
  evaluateAchievements,
  type AchievementStatus,
  type NewlyUnlocked,
} from "@/lib/tauri";

const LAST_VIEW_KEY = "last_achievement_view_at";

function persistLastViewAt(iso: string) {
  invoke("set_setting", { key: LAST_VIEW_KEY, value: iso }).catch(() => {});
}

async function loadLastViewAt(): Promise<string | null> {
  try {
    const val = await invoke<string | null>("get_setting", {
      key: LAST_VIEW_KEY,
    });
    return val;
  } catch {
    return null;
  }
}

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
  initBadgeCount: () => Promise<void>;
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

      initBadgeCount: async () => {
        try {
          const [statuses, lastViewAt] = await Promise.all([
            getAchievementStatus(),
            loadLastViewAt(),
          ]);
          const unseen = lastViewAt
            ? statuses.filter(
                (s) => s.unlocked && s.unlockedAt && s.unlockedAt > lastViewAt,
              ).length
            : statuses.filter((s) => s.unlocked).length;
          set(
            { statuses, loading: false, newUnlockCount: unseen },
            false,
            "initBadgeCount",
          );
        } catch {
          // best-effort
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
        persistLastViewAt(new Date().toISOString());
        set({ newUnlockCount: 0 }, false, "clearBadge");
      },

      setHighlightId: (id) => {
        set({ highlightId: id }, false, "setHighlightId");
      },
    }),
    { name: "AchievementStore", enabled: import.meta.env.DEV },
  ),
);
