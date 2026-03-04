import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface TwitchState {
  liveCount: number;
  isAuthenticated: boolean;
}

export interface TwitchActions {
  setLiveCount: (count: number) => void;
  setIsAuthenticated: (value: boolean) => void;
}

export type TwitchStore = TwitchState & TwitchActions;

const initialState: TwitchState = {
  liveCount: 0,
  isAuthenticated: false,
};

export const useTwitchStore = create<TwitchStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setLiveCount: (count) =>
        set({ liveCount: count }, false, "setLiveCount"),
      setIsAuthenticated: (value) =>
        set({ isAuthenticated: value }, false, "setIsAuthenticated"),
    }),
    { name: "TwitchStore", enabled: import.meta.env.DEV },
  ),
);
