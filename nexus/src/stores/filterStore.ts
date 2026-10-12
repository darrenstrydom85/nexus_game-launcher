import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { GameStatus } from "./gameStore";
import type { MasteryTierValue } from "@/lib/tauri";

export interface FilterState {
  tags: string[];
  minCriticScore: number;
  maxCriticScore: number;
  /** v1 library chips: any-of match; empty = no filter. */
  statuses: GameStatus[];
  tiers: MasteryTierValue[];
}

export interface FilterActions {
  toggleTag: (tagId: string) => void;
  setCriticScoreRange: (min: number, max: number) => void;
  toggleStatus: (status: GameStatus) => void;
  toggleTier: (tier: MasteryTierValue) => void;
  clearAll: () => void;
}

export type FilterStore = FilterState & FilterActions;

const initialState: FilterState = {
  tags: [],
  minCriticScore: 0,
  maxCriticScore: 100,
  statuses: [],
  tiers: [],
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export const useFilterStore = create<FilterStore>()(
  devtools(
    (set) => ({
      ...initialState,
      toggleTag: (tagId) => set((s) => ({ tags: toggle(s.tags, tagId) }), false, "toggleTag"),
      setCriticScoreRange: (min, max) =>
        set({ minCriticScore: min, maxCriticScore: max }, false, "setCriticScoreRange"),
      toggleStatus: (status) => set((s) => ({ statuses: toggle(s.statuses, status) }), false, "toggleStatus"),
      toggleTier: (tier) => set((s) => ({ tiers: toggle(s.tiers, tier) }), false, "toggleTier"),
      clearAll: () => set(initialState, false, "clearAll"),
    }),
    { name: "FilterStore", enabled: import.meta.env.DEV },
  ),
);
