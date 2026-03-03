import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  DuplicateCandidate,
  DuplicateGroup,
  DuplicateMember,
  DuplicateResolution,
} from "@/lib/tauri";
import {
  findDuplicates,
  resolveDuplicateGroup,
  updateDuplicateResolution,
  getDuplicateGroups,
  getGameSources,
} from "@/lib/tauri";

export interface DedupState {
  candidates: DuplicateCandidate[];
  groups: DuplicateGroup[];
  gameSourcesCache: Record<string, DuplicateMember[]>;
  isScanning: boolean;
  error: string | null;
}

export interface DedupActions {
  scanForDuplicates: () => Promise<void>;
  resolveCandidate: (
    gameIds: string[],
    preferredGameId: string,
    resolution: DuplicateResolution,
  ) => Promise<DuplicateGroup>;
  updateResolution: (
    groupId: string,
    preferredGameId: string,
    resolution: DuplicateResolution,
  ) => Promise<DuplicateGroup>;
  loadGroups: () => Promise<void>;
  loadGameSources: (gameId: string) => Promise<DuplicateMember[]>;
  clearError: () => void;
}

export type DedupStore = DedupState & DedupActions;

const initialState: DedupState = {
  candidates: [],
  groups: [],
  gameSourcesCache: {},
  isScanning: false,
  error: null,
};

export const useDedupStore = create<DedupStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      scanForDuplicates: async () => {
        set({ isScanning: true, error: null }, false, "scanForDuplicates/start");
        try {
          const candidates = await findDuplicates();
          set({ candidates, isScanning: false }, false, "scanForDuplicates/done");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg, isScanning: false }, false, "scanForDuplicates/error");
        }
      },

      resolveCandidate: async (gameIds, preferredGameId, resolution) => {
        try {
          const group = await resolveDuplicateGroup({
            gameIds,
            preferredGameId,
            resolution,
          });
          const state = get();
          set(
            {
              groups: [...state.groups, group],
              candidates: state.candidates.filter(
                (c) =>
                  !(
                    gameIds.includes(c.gameAId) && gameIds.includes(c.gameBId)
                  ),
              ),
            },
            false,
            "resolveCandidate",
          );
          return group;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg }, false, "resolveCandidate/error");
          throw e;
        }
      },

      updateResolution: async (groupId, preferredGameId, resolution) => {
        try {
          const updated = await updateDuplicateResolution({
            groupId,
            preferredGameId,
            resolution,
          });
          const state = get();
          set(
            {
              groups: state.groups.map((g) =>
                g.id === groupId ? updated : g,
              ),
            },
            false,
            "updateResolution",
          );
          return updated;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg }, false, "updateResolution/error");
          throw e;
        }
      },

      loadGroups: async () => {
        try {
          const groups = await getDuplicateGroups();
          set({ groups }, false, "loadGroups");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg }, false, "loadGroups/error");
        }
      },

      loadGameSources: async (gameId: string) => {
        const cached = get().gameSourcesCache[gameId];
        if (cached) return cached;

        try {
          const sources = await getGameSources(gameId);
          set(
            (state) => ({
              gameSourcesCache: {
                ...state.gameSourcesCache,
                [gameId]: sources,
              },
            }),
            false,
            "loadGameSources",
          );
          return sources;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg }, false, "loadGameSources/error");
          return [];
        }
      },

      clearError: () => set({ error: null }, false, "clearError"),
    }),
    { name: "DedupStore", enabled: import.meta.env.DEV },
  ),
);
