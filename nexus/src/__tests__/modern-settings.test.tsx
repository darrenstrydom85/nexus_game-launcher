import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(() => Promise.resolve("1.0.0")) }));

import { SettingsPage } from "@/modern/settings/SettingsPage";
import { AppearanceSection } from "@/modern/settings/sections/AppearanceSection";
import { AboutSection } from "@/modern/settings/sections/AboutSection";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUpdateStore } from "@/stores/updateStore";
import { TooltipProvider } from "@/components/ui/tooltip";

const updater = {
  runCheck: vi.fn(() => Promise.resolve()),
  downloadAndInstall: vi.fn(() => Promise.resolve()),
  restart: vi.fn(() => Promise.resolve()),
};

async function show(ui: React.ReactElement) {
  render(ui, { wrapper: TooltipProvider });
  await act(async () => {});
}

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_system_hardware") {
      return Promise.resolve({ cpuBrand: "amd", cpuName: "AMD Ryzen 7 9800X3D 8-Core Processor", gpuBrand: "amd", gpuName: "AMD Radeon RX 9070 XT" });
    }
    return Promise.resolve(null);
  });
  Object.values(updater).forEach((fn) => fn.mockClear());
  useUpdateStore.setState({ ...updater, phase: "idle", updateAvailable: false, latestVersion: null, notes: null, downloadedBytes: 0, totalBytes: 0 });
  useUiStore.setState({ activeNav: "settings", settingsCategory: "appearance" });
  useSettingsStore.setState({ healthCheckIssueCount: 0, enableAnimations: true, reducedMotion: false });
});

describe("v1 Settings page", () => {
  it("opens at the stored category and switches from the list", async () => {
    await show(<SettingsPage />);
    expect(screen.getByTestId("settings-content-appearance")).toBeInTheDocument();
    expect(screen.getByTestId("settings-cat-appearance")).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByTestId("settings-cat-about"));
    expect(screen.getByTestId("settings-content-about")).toBeInTheDocument();
    expect(useUiStore.getState().settingsCategory).toBe("about");
  });

  it("searches categories by what they contain, Enter opens the first", async () => {
    await show(<SettingsPage />);
    const search = screen.getByTestId("settings-search");
    fireEvent.change(search, { target: { value: "gpu" } });
    const nav = screen.getByRole("navigation", { name: "Settings categories" });
    expect(within(nav).getAllByRole("button").map((b) => b.dataset.testid)).toEqual(["settings-cat-about"]);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(useUiStore.getState().settingsCategory).toBe("about");
  });

  it("flags health issues and updates in the list", async () => {
    useSettingsStore.setState({ healthCheckIssueCount: 3 });
    useUpdateStore.setState({ updateAvailable: true, latestVersion: "1.0.1" });
    await show(<SettingsPage />);
    expect(screen.getByTestId("settings-cat-data")).toHaveTextContent("3 library issues");
    expect(screen.getByTestId("settings-cat-about")).toHaveTextContent("Update available");
  });

  it("openSettings jumps to a category from anywhere", () => {
    useUiStore.setState({ activeNav: "library", detailOverlayGameId: "g1" });
    act(() => useUiStore.getState().openSettings("about"));
    expect(useUiStore.getState()).toMatchObject({ activeNav: "settings", settingsCategory: "about", detailOverlayGameId: null });
  });
});

describe("Appearance", () => {
  it("toggles settings through the store, and the label toggles too", async () => {
    await show(<AppearanceSection />);
    fireEvent.click(screen.getByTestId("pref-animations"));
    expect(useSettingsStore.getState().enableAnimations).toBe(false);
    expect(screen.getByTestId("pref-reduced-motion")).toBeDisabled();
    fireEvent.click(screen.getByText("Animations"));
    expect(useSettingsStore.getState().enableAnimations).toBe(true);
  });

  it("exposes the settings that had no switch", async () => {
    await show(<AppearanceSection />);
    for (const id of ["pref-reduced-motion", "pref-achievement-notifications", "pref-achievement-sounds", "pref-milestone-sounds"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("role", "switch");
    }
    fireEvent.click(screen.getByTestId("pref-reduced-motion"));
    expect(useSettingsStore.getState().reducedMotion).toBe(true);
    expect(invoke).toHaveBeenCalledWith("set_setting", { key: "reduced_motion", value: "true" });
  });
});

describe("About", () => {
  it("checks for updates when up to date", async () => {
    await show(<AboutSection />);
    expect(screen.getByTestId("about-update-status")).toHaveTextContent("You’re up to date");
    updater.runCheck.mockClear();
    fireEvent.click(screen.getByTestId("about-check-updates"));
    expect(updater.runCheck).toHaveBeenCalledOnce();
  });

  it("downloads an available update, shows progress, then restarts", async () => {
    useUpdateStore.setState({ phase: "available", updateAvailable: true, latestVersion: "1.0.1", notes: "Fixes" });
    await show(<AboutSection />);
    expect(screen.getByTestId("about-update-status")).toHaveTextContent("Version 1.0.1 is available");
    expect(screen.getByText("Fixes")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("about-update-now"));
    expect(updater.downloadAndInstall).toHaveBeenCalledOnce();

    act(() => useUpdateStore.setState({ phase: "downloading", downloadedBytes: 42, totalBytes: 100 }));
    expect(screen.getByRole("progressbar", { name: "Update download" })).toHaveAttribute("aria-valuenow", "42");

    act(() => useUpdateStore.setState({ phase: "ready" }));
    fireEvent.click(screen.getByRole("button", { name: /restart to update/i }));
    expect(updater.restart).toHaveBeenCalledOnce();
  });

  it("lists this PC and keeps the Home tile toggle", async () => {
    await show(<AboutSection />);
    const pc = screen.getByTestId("about-this-pc");
    expect(pc).toHaveTextContent("CPU");
    expect(pc).toHaveTextContent("Graphics");
    fireEvent.click(screen.getByTestId("pref-show-hardware-home"));
    expect(useSettingsStore.getState().showHardwareOnHome).toBe(false);
  });

  it("opens known issues", async () => {
    await show(<AboutSection />);
    fireEvent.click(screen.getByTestId("about-known-issues"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("settings load", () => {
  it("reads animations, transparency and reduced motion back from the backend", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_settings") return Promise.resolve({ enable_animations: "false", window_transparency: "false", reduced_motion: "true" });
      if (cmd === "get_watched_folders") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    useSettingsStore.setState({ enableAnimations: true, windowTransparency: true, reducedMotion: false });
    await act(() => useSettingsStore.getState().loadFromBackend());
    expect(useSettingsStore.getState()).toMatchObject({ enableAnimations: false, windowTransparency: false, reducedMotion: true });
  });
});
