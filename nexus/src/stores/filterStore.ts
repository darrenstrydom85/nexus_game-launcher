import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { GameSource, GameStatus } from "./gameStore";

export interface FilterState {
  sources: GameSource[];
  statuses: GameStatus[];
  genres: string[];
  minRating: number | null;
  maxPlayTimeH: number | null;
  collectionId: string | null;
  minCriticScore: number;
  maxCriticScore: number;
}

export interface FilterActions {
  toggleSource: (source: GameSource) => void;
  toggleStatus: (status: GameStatus) => void;
  toggleGenre: (genre: string) => void;
  setMinRating: (rating: number | null) => void;
  setMaxPlayTimeH: (hours: number | null) => void;
  setCollectionId: (id: string | null) => void;
  setCriticScoreRange: (min: number, max: number) => void;
  removeFilter: (type: string, value?: string) => void;
  clearAll: () => void;
  hasActiveFilters: () => boolean;
}

export type FilterStore = FilterState & FilterActions;

const initialState: FilterState = {
  sources: [],
  statuses: [],
  genres: [],
  minRating: null,
  maxPlayTimeH: null,
  collectionId: null,
  minCriticScore: 0,
  maxCriticScore: 100,
};

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export const useFilterStore = create<FilterStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      toggleSource: (source) =>
        set((s) => ({ sources: toggleInArray(s.sources, source) }), false, "toggleSource"),
      toggleStatus: (status) =>
        set((s) => ({ statuses: toggleInArray(s.statuses, status) }), false, "toggleStatus"),
      toggleGenre: (genre) =>
        set((s) => ({ genres: toggleInArray(s.genres, genre) }), false, "toggleGenre"),
      setMinRating: (rating) =>
        set({ minRating: rating }, false, "setMinRating"),
      setMaxPlayTimeH: (hours) =>
        set({ maxPlayTimeH: hours }, false, "setMaxPlayTimeH"),
      setCollectionId: (id) =>
        set({ collectionId: id }, false, "setCollectionId"),
      setCriticScoreRange: (min, max) =>
        set({ minCriticScore: min, maxCriticScore: max }, false, "setCriticScoreRange"),
      removeFilter: (type, value) =>
        set((s) => {
          switch (type) {
            case "source": return { sources: s.sources.filter((x) => x !== value) };
            case "status": return { statuses: s.statuses.filter((x) => x !== value) };
            case "genre": return { genres: s.genres.filter((x) => x !== value) };
            case "rating": return { minRating: null };
            case "playTime": return { maxPlayTimeH: null };
            case "collection": return { collectionId: null };
            case "criticScore": return { minCriticScore: 0, maxCriticScore: 100 };
            default: return {};
          }
        }, false, "removeFilter"),
      clearAll: () => set(initialState, false, "clearAll"),
      hasActiveFilters: () => {
        const s = get();
        return (
          s.sources.length > 0 ||
          s.statuses.length > 0 ||
          s.genres.length > 0 ||
          s.minRating !== null ||
          s.maxPlayTimeH !== null ||
          s.collectionId !== null ||
          s.minCriticScore > 0 ||
          s.maxCriticScore < 100
        );
      },
    }),
    { name: "FilterStore", enabled: import.meta.env.DEV },
  ),
);
