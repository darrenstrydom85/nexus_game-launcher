import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ViewMode = "grid" | "list";

export type SortField =
  | "name"
  | "lastPlayed"
  | "totalPlayTime"
  | "rating"
  | "addedAt"
  | "releaseDate";

export type SortDirection = "asc" | "desc";

export type NavItem = "library" | "stats" | "random" | "twitch" | "wrapped" | "completed" | "archive" | "achievements";

export interface UiState {
  selectedGameId: string | null;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  sidebarVisible: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  searchQuery: string;
  searchOpen: boolean;
  detailOverlayGameId: string | null;
  activeNav: NavItem;
  sourceFilter: string | null;
  genreFilter: string | null;
  /** Story 19.8: When set, Twitch panel scrolls to this game name then clears. */
  twitchPanelScrollToGameName: string | null;
}

export interface UiActions {
  setSelectedGameId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarVisible: (visible: boolean) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (direction: SortDirection) => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setDetailOverlayGameId: (id: string | null) => void;
  setActiveNav: (nav: NavItem) => void;
  setSourceFilter: (source: string | null) => void;
  toggleSourceFilter: (source: string) => void;
  setGenreFilter: (genre: string | null) => void;
  toggleGenreFilter: (genre: string) => void;
  setTwitchPanelScrollToGameName: (gameName: string | null) => void;
}

export type UiStore = UiState & UiActions;

const initialState: UiState = {
  selectedGameId: null,
  viewMode: "grid",
  sidebarOpen: true,
  sidebarVisible: true,
  sortField: "name",
  sortDirection: "asc",
  searchQuery: "",
  searchOpen: false,
  detailOverlayGameId: null,
  activeNav: "library",
  sourceFilter: null,
  genreFilter: null,
  twitchPanelScrollToGameName: null,
};

export const useUiStore = create<UiStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setSelectedGameId: (id) =>
        set({ selectedGameId: id }, false, "setSelectedGameId"),
      setViewMode: (mode) => set({ viewMode: mode }, false, "setViewMode"),
      toggleSidebar: () =>
        set(
          (state) => ({ sidebarOpen: !state.sidebarOpen }),
          false,
          "toggleSidebar",
        ),
      setSidebarOpen: (open) =>
        set({ sidebarOpen: open }, false, "setSidebarOpen"),
      setSidebarVisible: (visible) =>
        set({ sidebarVisible: visible }, false, "setSidebarVisible"),
      setSortField: (field) =>
        set({ sortField: field }, false, "setSortField"),
      setSortDirection: (direction) =>
        set({ sortDirection: direction }, false, "setSortDirection"),
      setSearchQuery: (query) =>
        set({ searchQuery: query }, false, "setSearchQuery"),
      setSearchOpen: (open) =>
        set({ searchOpen: open }, false, "setSearchOpen"),
      setDetailOverlayGameId: (id) =>
        set({ detailOverlayGameId: id }, false, "setDetailOverlayGameId"),
      setActiveNav: (nav) =>
        set({ activeNav: nav }, false, "setActiveNav"),
      setSourceFilter: (source) =>
        set({ sourceFilter: source }, false, "setSourceFilter"),
      toggleSourceFilter: (source) =>
        set(
          (state) => ({
            sourceFilter: state.sourceFilter === source ? null : source,
          }),
          false,
          "toggleSourceFilter",
        ),
      setGenreFilter: (genre) =>
        set({ genreFilter: genre }, false, "setGenreFilter"),
      toggleGenreFilter: (genre) =>
        set(
          (state) => ({
            genreFilter: state.genreFilter === genre ? null : genre,
          }),
          false,
          "toggleGenreFilter",
        ),
      setTwitchPanelScrollToGameName: (gameName) =>
        set(
          { twitchPanelScrollToGameName: gameName },
          false,
          "setTwitchPanelScrollToGameName",
        ),
    }),
    { name: "UiStore", enabled: import.meta.env.DEV },
  ),
);
