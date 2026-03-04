/**
 * Connectivity state for Twitch (Story 19.11).
 * Tracks isOnline; updated on startup, before Twitch calls, and when restoration triggers refresh.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { checkConnectivity } from "@/lib/tauri";

export interface ConnectivityState {
  isOnline: boolean;
}

export interface ConnectivityActions {
  checkConnectivity: () => Promise<void>;
  setIsOnline: (online: boolean) => void;
}

export type ConnectivityStore = ConnectivityState & ConnectivityActions;

export const useConnectivityStore = create<ConnectivityStore>()(
  devtools(
    (set, get) => ({
      isOnline: true,

      checkConnectivity: async () => {
        try {
          const { online } = await checkConnectivity();
          set({ isOnline: online }, false, "checkConnectivity");
        } catch {
          set({ isOnline: false }, false, "checkConnectivity_err");
        }
      },

      setIsOnline: (online) =>
        set({ isOnline: online }, false, "setIsOnline"),
    }),
    { name: "ConnectivityStore", enabled: import.meta.env.DEV },
  ),
);
