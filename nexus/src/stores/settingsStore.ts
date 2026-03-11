import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export interface ApiKeys {
  steamGridDbKey: string;
  igdbClientId: string;
  igdbClientSecret: string;
}

export type FontSize = "small" | "medium" | "large";

export interface WatchedFolder {
  id: string;
  path: string;
  label: string | null;
  autoScan: boolean;
  addedAt: string;
}

export interface SettingsState {
  apiKeys: ApiKeys;
  watchedFolders: WatchedFolder[];
  minimizeToTray: boolean;
  /** Story 20.1: When true, show close-vs-minimize dialog on window close. Default true. */
  askBeforeClose: boolean;
  launchAtStartup: boolean;
  enableNotifications: boolean;
  autoStatusTransitions: boolean;
  accentColor: string;
  windowTransparency: boolean;
  enableAnimations: boolean;
  fontSize: FontSize;
  reducedMotion: boolean;
  hiddenSmartCollections: string[];
  hiddenGameIds: string[];
  defaultSort: string;
  defaultView: "grid" | "list";
  sourcesEnabled: Record<string, boolean>;
  // Library health check state (ephemeral — resets on app restart via no-persist)
  lastHealthCheckAt: string | null;
  healthCheckIssueCount: number;
  healthCheckSnoozedUntil: number | null;
  autoHealthCheck: boolean;
  twitchEnabled: boolean;
  /** Story 19.10: Refresh interval in seconds (30, 60, 120, 300, or 0 = manual only). Default 60. */
  twitchRefreshInterval: number;
  /** Story 19.6/19.10: Go-live toasts on/off (default true). */
  twitchNotificationsEnabled: boolean;
  /** Story 19.6/19.10: Only show toasts for favorited streamers (default false). */
  twitchNotificationsFavoritesOnly: boolean;
  continuePlayingEnabled: boolean;
  continuePlayingMax: number;
  sessionNotePromptEnabled: boolean;
  /** Auto-dismiss timeout in seconds: 30, 60, 90, or 0 = never. */
  sessionNotePromptTimeout: number;
  queueCollapsed: boolean;
  _hydrated: boolean;
}

export interface SettingsActions {
  setApiKeys: (keys: Partial<ApiKeys>) => void;
  addWatchedFolder: (folder: WatchedFolder) => void;
  removeWatchedFolder: (id: string) => void;
  setWatchedFolders: (folders: WatchedFolder[]) => void;
  setMinimizeToTray: (value: boolean) => void;
  setAskBeforeClose: (value: boolean) => void;
  setLaunchAtStartup: (value: boolean) => void;
  setEnableNotifications: (value: boolean) => void;
  setAutoStatusTransitions: (value: boolean) => void;
  setAccentColor: (color: string) => void;
  setWindowTransparency: (value: boolean) => void;
  setEnableAnimations: (value: boolean) => void;
  setFontSize: (size: FontSize) => void;
  setReducedMotion: (value: boolean) => void;
  toggleHiddenSmartCollection: (id: string) => void;
  hideGame: (gameId: string) => void;
  unhideGame: (gameId: string) => void;
  setHiddenGameIds: (ids: string[]) => void;
  setDefaultSort: (sort: string) => void;
  setDefaultView: (view: "grid" | "list") => void;
  setSourceEnabled: (sourceId: string, enabled: boolean) => void;
  setSourcesEnabled: (sources: Record<string, boolean>) => void;
  setHealthCheckResult: (checkedAt: string, issueCount: number) => void;
  setHealthCheckSnoozed: (until: number | null) => void;
  setAutoHealthCheck: (value: boolean) => void;
  setTwitchEnabled: (value: boolean) => void;
  setTwitchRefreshInterval: (value: number) => void;
  setTwitchNotificationsEnabled: (value: boolean) => void;
  setTwitchNotificationsFavoritesOnly: (value: boolean) => void;
  setContinuePlayingEnabled: (value: boolean) => void;
  setContinuePlayingMax: (value: number) => void;
  setSessionNotePromptEnabled: (value: boolean) => void;
  setSessionNotePromptTimeout: (value: number) => void;
  setQueueCollapsed: (value: boolean) => void;
  loadFromBackend: () => Promise<void>;
}

export type SettingsStore = SettingsState & SettingsActions;

const SOURCE_IDS = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox"] as const;

function persistSetting(key: string, value: string) {
  try {
    invoke("set_setting", { key, value })?.catch?.(() => {});
  } catch {
    // Tauri not available (e.g. test environment)
  }
}

const initialState: SettingsState = {
  apiKeys: {
    steamGridDbKey: "",
    igdbClientId: "",
    igdbClientSecret: "",
  },
  watchedFolders: [],
  minimizeToTray: false,
  askBeforeClose: true,
  launchAtStartup: false,
  enableNotifications: true,
  autoStatusTransitions: true,
  accentColor: "#7600da",
  windowTransparency: true,
  enableAnimations: true,
  fontSize: "medium",
  reducedMotion: false,
  hiddenSmartCollections: [],
  hiddenGameIds: [],
  defaultSort: "name",
  defaultView: "grid",
  sourcesEnabled: Object.fromEntries(SOURCE_IDS.map((id) => [id, true])),
  lastHealthCheckAt: null,
  healthCheckIssueCount: 0,
  healthCheckSnoozedUntil: null,
  autoHealthCheck: true,
  twitchEnabled: true,
  twitchRefreshInterval: 60,
  twitchNotificationsEnabled: true,
  twitchNotificationsFavoritesOnly: false,
  continuePlayingEnabled: true,
  continuePlayingMax: 5,
  sessionNotePromptEnabled: true,
  sessionNotePromptTimeout: 60,
  queueCollapsed: false,
  _hydrated: false,
};

export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        loadFromBackend: async () => {
          try {
            const [settings, folders] = await Promise.all([
              invoke<Record<string, string | null>>("get_settings"),
              invoke<WatchedFolder[]>("get_watched_folders"),
            ]);

            const patch: Partial<SettingsState> = {
              watchedFolders: folders,
              _hydrated: true,
            };

            if (settings.steamgrid_api_key) {
              patch.apiKeys = {
                steamGridDbKey: settings.steamgrid_api_key ?? "",
                igdbClientId: settings.igdb_client_id ?? "",
                igdbClientSecret: settings.igdb_client_secret ?? "",
              };
            }

            const sources: Record<string, boolean> = {};
            for (const id of SOURCE_IDS) {
              const key = `source_${id}_enabled`;
              sources[id] = settings[key] !== "false";
            }
            patch.sourcesEnabled = sources;

            if (settings.theme_accent_color) patch.accentColor = settings.theme_accent_color;
            if (settings.library_view_mode) patch.defaultView = settings.library_view_mode as "grid" | "list";
            if (settings.library_sort_by) patch.defaultSort = settings.library_sort_by;
            if (settings.ask_before_close !== undefined) {
              patch.askBeforeClose = settings.ask_before_close !== "false";
            }
            if (settings.auto_health_check !== undefined) {
              patch.autoHealthCheck = settings.auto_health_check !== "false";
            }
            if (settings.twitch_enabled !== undefined) {
              patch.twitchEnabled = settings.twitch_enabled !== "false";
            }
            if (settings.twitch_refresh_interval !== undefined && settings.twitch_refresh_interval !== null) {
              const n = parseInt(settings.twitch_refresh_interval, 10);
              if (!Number.isNaN(n) && n >= 0) patch.twitchRefreshInterval = n;
            }
            if (settings.twitch_notifications_enabled !== undefined) {
              patch.twitchNotificationsEnabled = settings.twitch_notifications_enabled !== "false";
            }
            if (settings.twitch_notifications_favorites_only !== undefined) {
              patch.twitchNotificationsFavoritesOnly = settings.twitch_notifications_favorites_only === "true";
            }
            if (settings.continue_playing_enabled !== undefined) {
              patch.continuePlayingEnabled = settings.continue_playing_enabled !== "false";
            }
            if (settings.continue_playing_max !== undefined && settings.continue_playing_max !== null) {
              const n = parseInt(settings.continue_playing_max, 10);
              if (!Number.isNaN(n) && n > 0) patch.continuePlayingMax = n;
            }
            if (settings.session_note_prompt_enabled !== undefined) {
              patch.sessionNotePromptEnabled = settings.session_note_prompt_enabled !== "false";
            }
            if (settings.session_note_prompt_timeout !== undefined && settings.session_note_prompt_timeout !== null) {
              const n = parseInt(settings.session_note_prompt_timeout, 10);
              if (!Number.isNaN(n) && n >= 0) patch.sessionNotePromptTimeout = n;
            }

            set(patch, false, "loadFromBackend");
          } catch {
            set({ _hydrated: true }, false, "loadFromBackend/fallback");
          }
        },

        setApiKeys: (keys) =>
          set(
            (state) => {
              const merged = { ...state.apiKeys, ...keys };
              if (keys.steamGridDbKey !== undefined) persistSetting("steamgrid_api_key", keys.steamGridDbKey);
              if (keys.igdbClientId !== undefined) persistSetting("igdb_client_id", keys.igdbClientId);
              if (keys.igdbClientSecret !== undefined) persistSetting("igdb_client_secret", keys.igdbClientSecret);
              return { apiKeys: merged };
            },
            false,
            "setApiKeys",
          ),
        addWatchedFolder: (folder) =>
          set(
            (state) => ({
              watchedFolders: state.watchedFolders.some((f) => f.id === folder.id)
                ? state.watchedFolders
                : [...state.watchedFolders, folder],
            }),
            false,
            "addWatchedFolder",
          ),
        removeWatchedFolder: (id) =>
          set(
            (state) => ({
              watchedFolders: state.watchedFolders.filter((f) => f.id !== id),
            }),
            false,
            "removeWatchedFolder",
          ),
        setWatchedFolders: (folders) =>
          set({ watchedFolders: folders }, false, "setWatchedFolders"),
        setMinimizeToTray: (value) =>
          set({ minimizeToTray: value }, false, "setMinimizeToTray"),
        setAskBeforeClose: (value) => {
          persistSetting("ask_before_close", String(value));
          set({ askBeforeClose: value }, false, "setAskBeforeClose");
        },
        setLaunchAtStartup: (value) =>
          set({ launchAtStartup: value }, false, "setLaunchAtStartup"),
        setEnableNotifications: (value) =>
          set({ enableNotifications: value }, false, "setEnableNotifications"),
        setAutoStatusTransitions: (value) => {
          persistSetting("auto_status_transitions", String(value));
          set({ autoStatusTransitions: value }, false, "setAutoStatusTransitions");
        },
        setAccentColor: (color) => {
          persistSetting("theme_accent_color", color);
          set({ accentColor: color }, false, "setAccentColor");
        },
        setWindowTransparency: (value) => {
          persistSetting("window_transparency", String(value));
          set({ windowTransparency: value }, false, "setWindowTransparency");
        },
        setEnableAnimations: (value) => {
          persistSetting("enable_animations", String(value));
          set({ enableAnimations: value }, false, "setEnableAnimations");
        },
        setFontSize: (size) => {
          persistSetting("font_size", size);
          set({ fontSize: size }, false, "setFontSize");
        },
        setReducedMotion: (value) =>
          set({ reducedMotion: value }, false, "setReducedMotion"),
        toggleHiddenSmartCollection: (id) =>
          set(
            (state) => ({
              hiddenSmartCollections: state.hiddenSmartCollections.includes(id)
                ? state.hiddenSmartCollections.filter((x) => x !== id)
                : [...state.hiddenSmartCollections, id],
            }),
            false,
            "toggleHiddenSmartCollection",
          ),
        hideGame: (gameId) =>
          set(
            (state) => ({
              hiddenGameIds: state.hiddenGameIds.includes(gameId)
                ? state.hiddenGameIds
                : [...state.hiddenGameIds, gameId],
            }),
            false,
            "hideGame",
          ),
        unhideGame: (gameId) =>
          set(
            (state) => ({
              hiddenGameIds: state.hiddenGameIds.filter((id) => id !== gameId),
            }),
            false,
            "unhideGame",
          ),
        setHiddenGameIds: (ids) =>
          set({ hiddenGameIds: ids }, false, "setHiddenGameIds"),
        setDefaultSort: (sort) => {
          persistSetting("library_sort_by", sort);
          set({ defaultSort: sort }, false, "setDefaultSort");
        },
        setDefaultView: (view) => {
          persistSetting("library_view_mode", view);
          set({ defaultView: view }, false, "setDefaultView");
        },
        setSourceEnabled: (sourceId, enabled) => {
          persistSetting(`source_${sourceId}_enabled`, String(enabled));
          set(
            (state) => ({
              sourcesEnabled: { ...state.sourcesEnabled, [sourceId]: enabled },
            }),
            false,
            "setSourceEnabled",
          );
        },
        setSourcesEnabled: (sources) =>
          set({ sourcesEnabled: sources }, false, "setSourcesEnabled"),
        setHealthCheckResult: (checkedAt, issueCount) =>
          set(
            { lastHealthCheckAt: checkedAt, healthCheckIssueCount: issueCount },
            false,
            "setHealthCheckResult",
          ),
        setHealthCheckSnoozed: (until) =>
          set({ healthCheckSnoozedUntil: until }, false, "setHealthCheckSnoozed"),
        setAutoHealthCheck: (value) => {
          persistSetting("auto_health_check", String(value));
          set({ autoHealthCheck: value }, false, "setAutoHealthCheck");
        },
        setTwitchEnabled: (value) => {
          persistSetting("twitch_enabled", String(value));
          set({ twitchEnabled: value }, false, "setTwitchEnabled");
        },
        setTwitchRefreshInterval: (value) => {
          persistSetting("twitch_refresh_interval", String(value));
          set({ twitchRefreshInterval: value }, false, "setTwitchRefreshInterval");
        },
        setTwitchNotificationsEnabled: (value) => {
          persistSetting("twitch_notifications_enabled", String(value));
          set({ twitchNotificationsEnabled: value }, false, "setTwitchNotificationsEnabled");
        },
        setTwitchNotificationsFavoritesOnly: (value) => {
          persistSetting("twitch_notifications_favorites_only", String(value));
          set({ twitchNotificationsFavoritesOnly: value }, false, "setTwitchNotificationsFavoritesOnly");
        },
        setContinuePlayingEnabled: (value) => {
          persistSetting("continue_playing_enabled", String(value));
          set({ continuePlayingEnabled: value }, false, "setContinuePlayingEnabled");
        },
        setContinuePlayingMax: (value) => {
          persistSetting("continue_playing_max", String(value));
          set({ continuePlayingMax: value }, false, "setContinuePlayingMax");
        },
        setSessionNotePromptEnabled: (value) => {
          persistSetting("session_note_prompt_enabled", String(value));
          set({ sessionNotePromptEnabled: value }, false, "setSessionNotePromptEnabled");
        },
        setSessionNotePromptTimeout: (value) => {
          persistSetting("session_note_prompt_timeout", String(value));
          set({ sessionNotePromptTimeout: value }, false, "setSessionNotePromptTimeout");
        },
        setQueueCollapsed: (value) =>
          set({ queueCollapsed: value }, false, "setQueueCollapsed"),
      }),
      { name: "nexus-settings" },
    ),
    { name: "SettingsStore", enabled: import.meta.env.DEV },
  ),
);
