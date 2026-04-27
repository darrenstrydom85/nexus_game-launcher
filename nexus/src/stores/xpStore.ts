import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getXpSummary,
  getXpHistory,
  getXpBreakdown,
  type XpSummary,
  type XpEvent,
  type XpBreakdownRow,
} from "@/lib/tauri";
import { notifyLevelUp } from "@/lib/notifications";

interface XpState {
  summary: XpSummary | null;
  history: XpEvent[];
  breakdown: XpBreakdownRow[];
  loading: boolean;
  pendingLevelUp: { level: number; totalXp: number } | null;
}

interface XpActions {
  fetchXp: () => Promise<void>;
  refreshXp: () => Promise<void>;
  showLevelUp: (level: number, totalXp: number) => void;
  dismissLevelUp: () => void;
}

export type XpStore = XpState & XpActions;

export const useXpStore = create<XpStore>()(
  devtools(
    (set) => ({
      summary: null,
      history: [],
      breakdown: [],
      loading: false,
      pendingLevelUp: null,

      fetchXp: async () => {
        set({ loading: true }, false, "fetchXp/start");
        try {
          const [summary, history, breakdown] = await Promise.all([
            getXpSummary(),
            getXpHistory(20),
            getXpBreakdown(),
          ]);
          set(
            { summary, history, breakdown, loading: false },
            false,
            "fetchXp/done",
          );
        } catch {
          set({ loading: false }, false, "fetchXp/error");
        }
      },

      refreshXp: async () => {
        try {
          const [summary, history, breakdown] = await Promise.all([
            getXpSummary(),
            getXpHistory(20),
            getXpBreakdown(),
          ]);
          set({ summary, history, breakdown }, false, "refreshXp");
        } catch {
          // Non-critical — don't block UI
        }
      },

      showLevelUp: (level, totalXp) => {
        set({ pendingLevelUp: { level, totalXp } }, false, "showLevelUp");
        notifyLevelUp(level, totalXp);
      },

      dismissLevelUp: () => {
        set({ pendingLevelUp: null }, false, "dismissLevelUp");
      },
    }),
    { name: "XpStore", enabled: import.meta.env.DEV },
  ),
);
