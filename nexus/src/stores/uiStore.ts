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
export type StatsScrollTarget = "xp" | "milestones";

export type NavItem = "home" | "library" | "stats" | "random" | "twitch" | "wrapped" | "completed" | "archive" | "achievements" | "settings";

export type SettingsCategory =
  | "library"
  | "tags"
  | "appearance"
  | "theme"
  | "integrations"
  | "backup"
  | "data"
  | "export"
  | "about"
  | "developer";

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
  /** v1 quick view drawer: open game, and the list order it steps through. */
  quickViewGameId: string | null;
  quickViewIds: string[];
  activeNav: NavItem;
  sourceFilter: string | null;
  genreFilter: string | null;
  /** Story 19.8: When set, Twitch panel scrolls to this game name then clears. */
  twitchPanelScrollToGameName: string | null;
  /** When set, Stats scrolls to the requested section then clears. */
  statsScrollTarget: StatsScrollTarget | null;
  /** v1 Settings page: the open category. */
  settingsCategory: SettingsCategory;
}

export interface UiActions {
  setViewMode: (mode: ViewMode) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarVisible: (visible: boolean) => void;
  setSortField: (field: SortField) => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setDetailOverlayGameId: (id: string | null) => void;
  setQuickViewGameId: (id: string | null) => void;
  setQuickViewIds: (ids: string[]) => void;
  setActiveNav: (nav: NavItem) => void;
  setSourceFilter: (source: string | null) => void;
  toggleSourceFilter: (source: string) => void;
  setGenreFilter: (genre: string | null) => void;
  toggleGenreFilter: (genre: string) => void;
  setTwitchPanelScrollToGameName: (gameName: string | null) => void;
  setStatsScrollTarget: (target: StatsScrollTarget | null) => void;
  /** v1 shell: go to the Settings page, optionally at a category. */
  openSettings: (category?: SettingsCategory) => void;
  setSettingsCategory: (category: SettingsCategory) => void;
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
  quickViewGameId: null,
  quickViewIds: [],
  activeNav: "library",
  sourceFilter: null,
  genreFilter: null,
  twitchPanelScrollToGameName: null,
  statsScrollTarget: null,
  settingsCategory: "library",
};

export const useUiStore = create<UiStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setViewMode: (mode) => set({ viewMode: mode }, false, "setViewMode"),
      setSidebarOpen: (open) =>
        set({ sidebarOpen: open }, false, "setSidebarOpen"),
      setSidebarVisible: (visible) =>
        set({ sidebarVisible: visible }, false, "setSidebarVisible"),
      setSortField: (field) =>
        set({ sortField: field }, false, "setSortField"),
      setSearchQuery: (query) =>
        set({ searchQuery: query }, false, "setSearchQuery"),
      setSearchOpen: (open) =>
        set({ searchOpen: open }, false, "setSearchOpen"),
      setDetailOverlayGameId: (id) =>
        set({ detailOverlayGameId: id }, false, "setDetailOverlayGameId"),
      setQuickViewGameId: (id) =>
        set({ quickViewGameId: id }, false, "setQuickViewGameId"),
      setQuickViewIds: (ids) =>
        set({ quickViewIds: ids }, false, "setQuickViewIds"),
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
      openSettings: (category) =>
        set(
          (s) => ({ activeNav: "settings", settingsCategory: category ?? s.settingsCategory, detailOverlayGameId: null }),
          false,
          "openSettings",
        ),
      setSettingsCategory: (category) => set({ settingsCategory: category }, false, "setSettingsCategory"),
      setTwitchPanelScrollToGameName: (gameName) =>
        set(
          { twitchPanelScrollToGameName: gameName },
          false,
          "setTwitchPanelScrollToGameName",
        ),
      setStatsScrollTarget: (target) =>
        set({ statsScrollTarget: target }, false, "setStatsScrollTarget"),
    }),
    { name: "UiStore", enabled: import.meta.env.DEV },
  ),
);
