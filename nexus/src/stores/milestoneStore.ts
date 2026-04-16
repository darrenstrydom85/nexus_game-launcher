import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  checkSessionMilestones,
  evaluateMilestonesBatch,
  type SessionMilestone,
} from "@/lib/tauri";

export interface MilestoneToastItem {
  id: string;
  milestone: SessionMilestone;
}

interface MilestoneHistoryEntry {
  sessionId: string;
  milestones: SessionMilestone[];
}

interface MilestoneState {
  toastQueue: MilestoneToastItem[];
  history: MilestoneHistoryEntry[] | null;
  historyLoading: boolean;
}

interface MilestoneActions {
  enqueueSessionMilestones: (sessionId: string) => Promise<void>;
  dismissToast: (id: string) => void;
  loadHistory: (sessionIds: string[]) => Promise<void>;
}

export type MilestoneStore = MilestoneState & MilestoneActions;

let toastCounter = 0;

export const useMilestoneStore = create<MilestoneStore>()(
  devtools(
    (set) => ({
      toastQueue: [],
      history: null,
      historyLoading: false,

      enqueueSessionMilestones: async (sessionId: string) => {
        try {
          const milestones = await checkSessionMilestones(sessionId);
          if (milestones.length === 0) return;
          const items: MilestoneToastItem[] = milestones.map((m) => ({
            id: `milestone-${++toastCounter}`,
            milestone: m,
          }));
          set(
            (state) => ({ toastQueue: [...state.toastQueue, ...items] }),
            false,
            "enqueueSessionMilestones",
          );
        } catch {
          // best-effort
        }
      },

      dismissToast: (id: string) => {
        set(
          (state) => ({
            toastQueue: state.toastQueue.filter((t) => t.id !== id),
          }),
          false,
          "dismissToast",
        );
      },

      loadHistory: async (sessionIds: string[]) => {
        set({ historyLoading: true }, false, "loadHistory/start");
        try {
          const results = await evaluateMilestonesBatch(sessionIds);
          const history: MilestoneHistoryEntry[] = results.map(
            ([sessionId, milestones]) => ({ sessionId, milestones }),
          );
          set(
            { history, historyLoading: false },
            false,
            "loadHistory/done",
          );
        } catch {
          set({ historyLoading: false }, false, "loadHistory/error");
        }
      },
    }),
    { name: "MilestoneStore", enabled: import.meta.env.DEV },
  ),
);
