import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Tag, TagWithCount } from "@/lib/tauri";
import {
  getTags,
  createTag,
  deleteTag as deleteTagApi,
  renameTag as renameTagApi,
  updateTagColor as updateTagColorApi,
  addTagToGame,
  removeTagFromGame,
  getAllGameTagIds,
} from "@/lib/tauri";

interface TagState {
  tags: TagWithCount[];
  gameTagMap: Record<string, string[]>;
  isLoading: boolean;
}

interface TagActions {
  loadTags: () => Promise<void>;
  loadGameTagMap: () => Promise<void>;
  create: (name: string, color?: string | null) => Promise<Tag>;
  deleteTag: (tagId: string) => Promise<void>;
  rename: (tagId: string, name: string) => Promise<void>;
  updateColor: (tagId: string, color: string | null) => Promise<void>;
  addToGame: (gameId: string, tagId: string) => Promise<void>;
  removeFromGame: (gameId: string, tagId: string) => Promise<void>;
}

export type TagStore = TagState & TagActions;

const initialState: TagState = {
  tags: [],
  gameTagMap: {},
  isLoading: false,
};

export const useTagStore = create<TagStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadTags: async () => {
        set({ isLoading: true }, false, "loadTags/start");
        try {
          const tags = await getTags();
          set({ tags, isLoading: false }, false, "loadTags/done");
        } catch {
          set({ isLoading: false }, false, "loadTags/error");
        }
      },

      loadGameTagMap: async () => {
        try {
          const pairs = await getAllGameTagIds();
          const map: Record<string, string[]> = {};
          for (const [gameId, tagId] of pairs) {
            if (!map[gameId]) map[gameId] = [];
            map[gameId].push(tagId);
          }
          set({ gameTagMap: map }, false, "loadGameTagMap");
        } catch {
          // best-effort
        }
      },

      create: async (name, color) => {
        const tag = await createTag(name, color);
        await get().loadTags();
        return tag;
      },

      deleteTag: async (tagId) => {
        await deleteTagApi(tagId);
        await get().loadTags();
        const map = { ...get().gameTagMap };
        for (const gameId of Object.keys(map)) {
          map[gameId] = map[gameId].filter((id) => id !== tagId);
        }
        set({ gameTagMap: map }, false, "deleteTag/updateMap");
      },

      rename: async (tagId, name) => {
        await renameTagApi(tagId, name);
        await get().loadTags();
      },

      updateColor: async (tagId, color) => {
        await updateTagColorApi(tagId, color);
        await get().loadTags();
      },

      addToGame: async (gameId, tagId) => {
        await addTagToGame(gameId, tagId);
        const map = { ...get().gameTagMap };
        if (!map[gameId]) map[gameId] = [];
        if (!map[gameId].includes(tagId)) {
          map[gameId] = [...map[gameId], tagId];
        }
        set({ gameTagMap: map }, false, "addToGame");
        await get().loadTags();
      },

      removeFromGame: async (gameId, tagId) => {
        await removeTagFromGame(gameId, tagId);
        const map = { ...get().gameTagMap };
        if (map[gameId]) {
          map[gameId] = map[gameId].filter((id) => id !== tagId);
        }
        set({ gameTagMap: map }, false, "removeFromGame");
        await get().loadTags();
      },
    }),
    { name: "TagStore", enabled: import.meta.env.DEV },
  ),
);
