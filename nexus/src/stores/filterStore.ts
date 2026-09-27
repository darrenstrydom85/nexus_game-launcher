import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface FilterState {
  tags: string[];
  minCriticScore: number;
  maxCriticScore: number;
}

export interface FilterActions {
  toggleTag: (tagId: string) => void;
  setCriticScoreRange: (min: number, max: number) => void;
  clearAll: () => void;
}

export type FilterStore = FilterState & FilterActions;

const initialState: FilterState = {
  tags: [],
  minCriticScore: 0,
  maxCriticScore: 100,
};

export const useFilterStore = create<FilterStore>()(
  devtools(
    (set) => ({
      ...initialState,
      toggleTag: (tagId) =>
        set(
          (s) => ({
            tags: s.tags.includes(tagId) ? s.tags.filter((x) => x !== tagId) : [...s.tags, tagId],
          }),
          false,
          "toggleTag",
        ),
      setCriticScoreRange: (min, max) =>
        set({ minCriticScore: min, maxCriticScore: max }, false, "setCriticScoreRange"),
      clearAll: () => set(initialState, false, "clearAll"),
    }),
    { name: "FilterStore", enabled: import.meta.env.DEV },
  ),
);
