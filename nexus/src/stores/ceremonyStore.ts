import { create } from "zustand";
import { getGameCeremonyData, type GameCeremonyData } from "@/lib/tauri";

/**
 * Transient ceremony store (Epic 41, Story 41.2).
 *
 * Tracks which game's retirement ceremony is currently open, the loading
 * state, and the fetched data. Nothing is persisted — ceremony data is
 * always re-fetched when the overlay opens.
 */

export type CeremonyTrigger = "retirement" | "replay";

interface CeremonyState {
  open: boolean;
  /** Was the ceremony triggered by a fresh retirement, or replayed later? */
  trigger: CeremonyTrigger;
  loading: boolean;
  error: string | null;
  data: GameCeremonyData | null;
}

interface CeremonyActions {
  openForGame: (gameId: string, trigger?: CeremonyTrigger) => Promise<void>;
  close: () => void;
}

const initial: CeremonyState = {
  open: false,
  trigger: "retirement",
  loading: false,
  error: null,
  data: null,
};

export const useCeremonyStore = create<CeremonyState & CeremonyActions>(
  (set) => ({
    ...initial,

    openForGame: async (gameId, trigger = "retirement") => {
      set({ open: true, loading: true, error: null, data: null, trigger });
      try {
        const data = await getGameCeremonyData(gameId);
        set({ data, loading: false });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Failed to load ceremony data.";
        set({ loading: false, error: message });
      }
    },

    close: () => set({ ...initial }),
  }),
);
