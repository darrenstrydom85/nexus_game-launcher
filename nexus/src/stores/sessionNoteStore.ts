import { create } from "zustand";
import type { SessionNotePromptItem } from "@/components/Sessions/SessionNotePrompt";

interface SessionNoteState {
  queue: SessionNotePromptItem[];
  enqueue: (item: SessionNotePromptItem) => void;
  dequeue: () => void;
}

export const useSessionNoteStore = create<SessionNoteState>()((set) => ({
  queue: [],
  enqueue: (item) =>
    set((state) => ({ queue: [...state.queue, item] }), false),
  dequeue: () =>
    set((state) => ({ queue: state.queue.slice(1) }), false),
}));
