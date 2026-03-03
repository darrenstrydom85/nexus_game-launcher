import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";

describe("settingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    localStorage.clear();
  });

  it("has correct initial state", () => {
    const state = useSettingsStore.getState();
    expect(state.apiKeys).toEqual({
      steamGridDbKey: "",
      igdbClientId: "",
      igdbClientSecret: "",
    });
    expect(state.watchedFolders).toEqual([]);
    expect(state.minimizeToTray).toBe(false);
    expect(state.launchAtStartup).toBe(false);
    expect(state.enableNotifications).toBe(true);
  });

  it("setApiKeys partially updates API keys", () => {
    useSettingsStore.getState().setApiKeys({ steamGridDbKey: "abc123" });
    const { apiKeys } = useSettingsStore.getState();
    expect(apiKeys.steamGridDbKey).toBe("abc123");
    expect(apiKeys.igdbClientId).toBe("");
    expect(apiKeys.igdbClientSecret).toBe("");
  });

  it("setApiKeys merges multiple updates", () => {
    useSettingsStore.getState().setApiKeys({ steamGridDbKey: "key1" });
    useSettingsStore.getState().setApiKeys({ igdbClientId: "id1" });
    const { apiKeys } = useSettingsStore.getState();
    expect(apiKeys.steamGridDbKey).toBe("key1");
    expect(apiKeys.igdbClientId).toBe("id1");
  });

  it("addWatchedFolder adds a folder", () => {
    const folder = { id: "f1", path: "C:\\Games", label: null, autoScan: true, addedAt: "2026-01-01T00:00:00Z" };
    useSettingsStore.getState().addWatchedFolder(folder);
    expect(useSettingsStore.getState().watchedFolders).toEqual([folder]);
  });

  it("addWatchedFolder prevents duplicates", () => {
    const folder = { id: "f1", path: "C:\\Games", label: null, autoScan: true, addedAt: "2026-01-01T00:00:00Z" };
    useSettingsStore.getState().addWatchedFolder(folder);
    useSettingsStore.getState().addWatchedFolder(folder);
    expect(useSettingsStore.getState().watchedFolders).toHaveLength(1);
  });

  it("removeWatchedFolder removes a folder", () => {
    const f1 = { id: "f1", path: "C:\\Games", label: null, autoScan: true, addedAt: "2026-01-01T00:00:00Z" };
    const f2 = { id: "f2", path: "D:\\MoreGames", label: null, autoScan: true, addedAt: "2026-01-01T00:00:00Z" };
    useSettingsStore.getState().addWatchedFolder(f1);
    useSettingsStore.getState().addWatchedFolder(f2);
    useSettingsStore.getState().removeWatchedFolder("f1");
    expect(useSettingsStore.getState().watchedFolders).toEqual([f2]);
  });

  it("setMinimizeToTray updates value", () => {
    useSettingsStore.getState().setMinimizeToTray(true);
    expect(useSettingsStore.getState().minimizeToTray).toBe(true);
  });

  it("setLaunchAtStartup updates value", () => {
    useSettingsStore.getState().setLaunchAtStartup(true);
    expect(useSettingsStore.getState().launchAtStartup).toBe(true);
  });

  it("setEnableNotifications updates value", () => {
    useSettingsStore.getState().setEnableNotifications(false);
    expect(useSettingsStore.getState().enableNotifications).toBe(false);
  });

  it("persist middleware saves to localStorage", () => {
    useSettingsStore.getState().setApiKeys({ steamGridDbKey: "persisted" });
    const stored = localStorage.getItem("nexus-settings");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.state.apiKeys.steamGridDbKey).toBe("persisted");
  });

  it("persist middleware restores from localStorage", () => {
    const restoredFolder = { id: "r1", path: "C:\\Restored", label: null, autoScan: true, addedAt: "2026-01-01T00:00:00Z" };
    const persistedState = {
      state: {
        apiKeys: {
          steamGridDbKey: "restored",
          igdbClientId: "",
          igdbClientSecret: "",
        },
        watchedFolders: [restoredFolder],
        minimizeToTray: true,
        launchAtStartup: false,
        enableNotifications: true,
      },
      version: 0,
    };
    localStorage.setItem("nexus-settings", JSON.stringify(persistedState));
    useSettingsStore.persist.rehydrate();
    const state = useSettingsStore.getState();
    expect(state.apiKeys.steamGridDbKey).toBe("restored");
    expect(state.watchedFolders).toEqual([restoredFolder]);
    expect(state.minimizeToTray).toBe(true);
  });
});
