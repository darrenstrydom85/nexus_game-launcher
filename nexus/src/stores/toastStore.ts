import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: ToastAction;
  /** 0–1 fraction. When present, a progress bar is rendered. */
  progress?: number;
}

interface ToastState {
  toasts: Toast[];
}

interface ToastActions {
  addToast: (toast: Omit<Toast, "id">) => string;
  updateToast: (id: string, updates: Partial<Omit<Toast, "id">>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export type ToastStore = ToastState & ToastActions;

let counter = 0;

export const useToastStore = create<ToastStore>()(
  devtools(
    (set) => ({
      toasts: [],
      addToast: (toast) => {
        const id = `toast-${++counter}`;
        set(
          (state) => ({ toasts: [...state.toasts, { ...toast, id }] }),
          false,
          "addToast",
        );
        return id;
      },
      updateToast: (id, updates) =>
        set(
          (state) => ({
            toasts: state.toasts.map((t) =>
              t.id === id ? { ...t, ...updates } : t,
            ),
          }),
          false,
          "updateToast",
        ),
      removeToast: (id) =>
        set(
          (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
          false,
          "removeToast",
        ),
      clearToasts: () => set({ toasts: [] }, false, "clearToasts"),
    }),
    { name: "ToastStore", enabled: import.meta.env.DEV },
  ),
);
