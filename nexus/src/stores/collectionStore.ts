import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export interface Collection {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  sortOrder: number;
  isSmart: boolean;
  rulesJson: string | null;
  gameIds: string[];
}

export interface CollectionState {
  collections: Collection[];
  activeCollectionId: string | null;
  isLoading: boolean;
}

export interface CollectionActions {
  setCollections: (collections: Collection[]) => void;
  addCollection: (collection: Collection) => void;
  updateCollection: (id: string, updates: Partial<Collection>) => void;
  removeCollection: (id: string) => void;
  setActiveCollectionId: (id: string | null) => void;
  addGameToCollection: (collectionId: string, gameId: string) => void;
  removeGameFromCollection: (collectionId: string, gameId: string) => void;
  reorderCollections: (orderedIds: string[]) => void;
  setLoading: (loading: boolean) => void;
}

export type CollectionStore = CollectionState & CollectionActions;

const initialState: CollectionState = {
  collections: [],
  activeCollectionId: null,
  isLoading: false,
};

export const useCollectionStore = create<CollectionStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setCollections: (collections) =>
        set({ collections }, false, "setCollections"),
      addCollection: (collection) =>
        set(
          (state) => ({ collections: [...state.collections, collection] }),
          false,
          "addCollection",
        ),
      updateCollection: (id, updates) =>
        set(
          (state) => ({
            collections: state.collections.map((c) =>
              c.id === id ? { ...c, ...updates } : c,
            ),
          }),
          false,
          "updateCollection",
        ),
      removeCollection: (id) =>
        set(
          (state) => ({
            collections: state.collections.filter((c) => c.id !== id),
            activeCollectionId:
              state.activeCollectionId === id ? null : state.activeCollectionId,
          }),
          false,
          "removeCollection",
        ),
      setActiveCollectionId: (id) =>
        set({ activeCollectionId: id }, false, "setActiveCollectionId"),
      addGameToCollection: (collectionId, gameId) =>
        set(
          (state) => ({
            collections: state.collections.map((c) =>
              c.id === collectionId && !c.gameIds.includes(gameId)
                ? { ...c, gameIds: [...c.gameIds, gameId] }
                : c,
            ),
          }),
          false,
          "addGameToCollection",
        ),
      removeGameFromCollection: (collectionId, gameId) =>
        set(
          (state) => ({
            collections: state.collections.map((c) =>
              c.id === collectionId
                ? { ...c, gameIds: c.gameIds.filter((gid) => gid !== gameId) }
                : c,
            ),
          }),
          false,
          "removeGameFromCollection",
        ),
      reorderCollections: (orderedIds) =>
        set(
          (state) => {
            const map = new Map(state.collections.map((c) => [c.id, c]));
            const reordered = orderedIds
              .map((id, i) => {
                const c = map.get(id);
                return c ? { ...c, sortOrder: i } : null;
              })
              .filter(Boolean) as Collection[];
            return { collections: reordered };
          },
          false,
          "reorderCollections",
        ),
      setLoading: (loading) =>
        set({ isLoading: loading }, false, "setLoading"),
    }),
    { name: "CollectionStore", enabled: import.meta.env.DEV },
  ),
);

interface BackendCollection {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isSmart: boolean;
  rulesJson: string | null;
  gameIds: string[];
}

export async function refreshCollections(): Promise<void> {
  try {
    const rows = await invoke<BackendCollection[]>(
      "get_collections_with_game_ids",
    );
    const mapped: Collection[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon ?? "",
      color: row.color,
      sortOrder: row.sortOrder,
      isSmart: row.isSmart,
      rulesJson: row.rulesJson,
      gameIds: row.gameIds,
    }));
    useCollectionStore.getState().setCollections(mapped);
  } catch {
    // best-effort refresh
  }
}

/** @deprecated Use refreshCollections instead */
export const refreshSmartCollections = refreshCollections;
