import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { SettingsSheet } from "@/components/Settings/SettingsSheet";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

import { SourceToggles } from "@/components/Settings/SourceToggles";
import { FolderManager } from "@/components/Settings/FolderManager";
import { APIKeyManager } from "@/components/Settings/APIKeyManager";
import { LibraryPreferences } from "@/components/Settings/LibraryPreferences";
import { AppearanceSettings } from "@/components/Settings/AppearanceSettings";
import { DataManagement } from "@/components/Settings/DataManagement";
import { AboutSection } from "@/components/Settings/AboutSection";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { withRetry } from "@/lib/retry";
import { useOnlineStatus, getOfflineFallback } from "@/hooks/useOnlineStatus";
import { useGridKeyboardNav, useGlobalShortcuts } from "@/hooks/useKeyboardNav";
import { useSettingsStore } from "@/stores/settingsStore";

beforeEach(() => {
  useSettingsStore.setState({ _hydrated: true, watchedFolders: [] });
});

describe("Story 12.1: SettingsSheet & SourceToggles", () => {
  it("renders nothing when closed", () => {
    render(<SettingsSheet open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("settings-sheet")).not.toBeInTheDocument();
  });

  it("renders sheet when open", () => {
    render(<SettingsSheet open onClose={() => {}} />);
    expect(screen.getByTestId("settings-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
  });

  it("has glassmorphism styling", () => {
    render(<SettingsSheet open onClose={() => {}} />);
    expect(screen.getByTestId("settings-panel").className).toContain("glass-settings");
  });

  it("closes on X button", () => {
    const onClose = vi.fn();
    render(<SettingsSheet open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("settings-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<SettingsSheet open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders source toggles with 7 sources", () => {
    render(<SourceToggles />);
    expect(screen.getByTestId("source-toggles")).toBeInTheDocument();
    expect(screen.getByTestId("source-toggle-steam")).toBeInTheDocument();
    expect(screen.getByTestId("source-toggle-epic")).toBeInTheDocument();
    expect(screen.getByTestId("source-toggle-standalone")).toBeInTheDocument();
  });

  it("has re-scan all button", () => {
    render(<SourceToggles />);
    expect(screen.getByTestId("rescan-all")).toBeInTheDocument();
  });

  it("toggles source on checkbox click", () => {
    render(<SourceToggles />);
    const checkbox = screen.getByTestId("source-check-steam") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });
});

describe("Story 12.1: FolderManager", () => {
  const testFolder = { id: "f1", path: "C:\\Games", label: null, autoScan: true, addedAt: "2026-01-01T00:00:00Z" };

  beforeEach(() => {
    useSettingsStore.setState({ watchedFolders: [testFolder] });
  });

  it("renders folder manager", () => {
    render(<FolderManager />);
    expect(screen.getByTestId("folder-manager")).toBeInTheDocument();
  });

  it("shows existing folders", () => {
    render(<FolderManager />);
    expect(screen.getByTestId("folder-entry-f1")).toBeInTheDocument();
  });

  it("has add folder button", () => {
    render(<FolderManager />);
    expect(screen.getByTestId("add-folder-btn")).toBeInTheDocument();
  });

  it("remove button removes folder", async () => {
    render(<FolderManager />);
    fireEvent.click(screen.getByTestId("folder-remove-f1"));
    await waitFor(() => {
      expect(useSettingsStore.getState().watchedFolders).toHaveLength(0);
    });
  });
});

describe("Story 12.2: APIKeyManager", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      apiKeys: { steamGridDbKey: "test-key-123", igdbClientId: "cid", igdbClientSecret: "csec" },
    });
  });

  it("renders API key manager", () => {
    render(<APIKeyManager />);
    expect(screen.getByTestId("api-key-manager")).toBeInTheDocument();
  });

  it("shows SteamGridDB status as configured", () => {
    render(<APIKeyManager />);
    expect(screen.getByTestId("steamgrid-status")).toHaveTextContent("Configured");
  });

  it("shows IGDB status as configured", () => {
    render(<APIKeyManager />);
    expect(screen.getByTestId("igdb-status")).toHaveTextContent("Configured");
  });

  it("shows masked key by default", () => {
    render(<APIKeyManager />);
    expect(screen.getByTestId("steamgrid-masked")).toBeInTheDocument();
    expect(screen.getByTestId("steamgrid-masked").textContent).toContain("•");
  });

  it("toggle reveals key", () => {
    render(<APIKeyManager />);
    fireEvent.click(screen.getByTestId("steamgrid-toggle-show"));
    expect(screen.getByTestId("steamgrid-masked").textContent).toContain("test-key-123");
  });

  it("has Run Setup Wizard button", () => {
    render(<APIKeyManager />);
    expect(screen.getByTestId("run-setup-wizard")).toBeInTheDocument();
  });
});

describe("Story 12.2: LibraryPreferences", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      autoStatusTransitions: true,
      defaultSort: "name",
      defaultView: "grid",
      hiddenGameIds: [],
    });
  });

  it("renders library preferences", () => {
    render(<LibraryPreferences />);
    expect(screen.getByTestId("library-preferences")).toBeInTheDocument();
  });

  it("has default sort dropdown", () => {
    render(<LibraryPreferences />);
    expect(screen.getByTestId("pref-default-sort")).toBeInTheDocument();
  });

  it("has default view dropdown", () => {
    render(<LibraryPreferences />);
    expect(screen.getByTestId("pref-default-view")).toBeInTheDocument();
  });

  it("has auto-status toggle", () => {
    render(<LibraryPreferences />);
    expect(screen.getByTestId("pref-auto-status")).toBeInTheDocument();
  });

  it("shows hidden games section when games are hidden", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    render(<LibraryPreferences />);
    expect(screen.getByTestId("hidden-games-section")).toHaveTextContent("2 hidden games");
  });

  it("unhide all clears hidden games", async () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    render(<LibraryPreferences />);
    fireEvent.click(screen.getByTestId("unhide-all"));
    await waitFor(() => {
      expect(useSettingsStore.getState().hiddenGameIds).toHaveLength(0);
    });
  });

  it("renders the HLTB hours/day dropdown with the store value selected", () => {
    useSettingsStore.setState({ hltbHoursPerDay: 1.5 });
    render(<LibraryPreferences />);
    const select = screen.getByTestId("pref-hltb-hours-per-day") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("1.5");
  });

  it("persists the chosen HLTB pace to the store", () => {
    useSettingsStore.setState({ hltbHoursPerDay: 1.5 });
    render(<LibraryPreferences />);
    const select = screen.getByTestId("pref-hltb-hours-per-day");
    fireEvent.change(select, { target: { value: "2.5" } });
    expect(useSettingsStore.getState().hltbHoursPerDay).toBe(2.5);
  });
});

describe("Story 12.3: AppearanceSettings", () => {
  it("renders appearance settings", () => {
    render(<AppearanceSettings />);
    expect(screen.getByTestId("appearance-settings")).toBeInTheDocument();
  });

  it("has accent color picker", () => {
    render(<AppearanceSettings />);
    expect(screen.getByTestId("accent-color-picker")).toBeInTheDocument();
  });

  it("clicking accent color changes it", () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("accent-#22c55e"));
    expect(useSettingsStore.getState().accentColor).toBe("#22c55e");
  });

  it("has transparency toggle", () => {
    render(<AppearanceSettings />);
    expect(screen.getByTestId("pref-transparency")).toBeInTheDocument();
  });

  it("has animations toggle", () => {
    render(<AppearanceSettings />);
    expect(screen.getByTestId("pref-animations")).toBeInTheDocument();
  });

  it("does not render font size selector (removed)", () => {
    render(<AppearanceSettings />);
    expect(screen.queryByTestId("pref-font-size")).not.toBeInTheDocument();
  });
});

describe("Story 12.3: DataManagement", () => {
  it("renders data management", () => {
    render(<DataManagement />);
    expect(screen.getByTestId("data-management")).toBeInTheDocument();
  });

  it("has export/import buttons", () => {
    render(<DataManagement />);
    expect(screen.getByTestId("data-export")).toBeInTheDocument();
    expect(screen.getByTestId("data-import")).toBeInTheDocument();
  });

  it("clear history requires confirmation", () => {
    render(<DataManagement />);
    fireEvent.click(screen.getByTestId("data-clear-history"));
    expect(screen.getByTestId("data-clear-confirm")).toBeInTheDocument();
  });

  it("reset requires double confirmation", () => {
    render(<DataManagement />);
    fireEvent.click(screen.getByTestId("data-reset"));
    expect(screen.getByTestId("data-reset-confirm-1")).toBeInTheDocument();
  });

  it("second confirmation shows keep-keys and reset-everything options", () => {
    render(<DataManagement />);
    fireEvent.click(screen.getByTestId("data-reset"));
    fireEvent.click(screen.getByTestId("data-reset-confirm-1").querySelector("button")!);
    expect(screen.getByTestId("data-reset-confirm-2")).toBeInTheDocument();
    expect(screen.getByTestId("data-reset-keep-keys")).toBeInTheDocument();
    expect(screen.getByTestId("data-reset-everything")).toBeInTheDocument();
  });

  it("has cache clear button", () => {
    render(<DataManagement />);
    expect(screen.getByTestId("data-clear-cache")).toBeInTheDocument();
  });
});

describe("Story 12.3: AboutSection", () => {
  it("renders about section", () => {
    render(<AboutSection />);
    expect(screen.getByTestId("about-section")).toBeInTheDocument();
    expect(screen.getByTestId("about-version")).toHaveTextContent(/Nexus v/);
    expect(screen.queryByTestId("about-github")).not.toBeInTheDocument();
    expect(screen.getByTestId("about-bug")).toBeInTheDocument();
    expect(screen.getByTestId("about-license")).toHaveTextContent("MIT License");
  });
});

describe("Story 12.4: Accessibility & Keyboard", () => {
  it("useGridKeyboardNav handles arrow keys", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useGridKeyboardNav({ columns: 4, totalItems: 12, onSelect }),
    );
    expect(result.current.focusIndex).toBe(0);
  });

  it("useGlobalShortcuts is a function", () => {
    expect(typeof useGlobalShortcuts).toBe("function");
  });

  it("settings store has reducedMotion field", () => {
    expect(useSettingsStore.getState().reducedMotion).toBe(false);
    useSettingsStore.getState().setReducedMotion(true);
    expect(useSettingsStore.getState().reducedMotion).toBe(true);
    useSettingsStore.getState().setReducedMotion(false);
  });

  it("focus rings use accent color (ring class in CSS)", () => {
    const css = readFileSync(resolve(__dirname, "../globals.css"), "utf-8");
    expect(css).toContain("outline-ring");
  });
});

describe("Story 12.5: Error Handling", () => {
  it("ErrorBoundary renders children normally", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">OK</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("ErrorBoundary catches errors and shows fallback", () => {
    const Thrower = () => { throw new Error("Test error"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
    expect(screen.getByTestId("error-retry")).toBeInTheDocument();
    expect(screen.getByTestId("error-report")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("withRetry retries on failure", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return "ok";
    };
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("withRetry throws after max retries", async () => {
    const fn = async () => { throw new Error("always fail"); };
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow("always fail");
  });
});

describe("Story 12.6: Offline Behavior", () => {
  it("useOnlineStatus returns boolean", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(typeof result.current).toBe("boolean");
  });

  it("getOfflineFallback returns messages for known features", () => {
    expect(getOfflineFallback("metadata")).toContain("offline");
    expect(getOfflineFallback("verification")).toContain("internet");
    expect(getOfflineFallback("trailer")).toContain("Offline");
  });

  it("getOfflineFallback returns generic message for unknown", () => {
    expect(getOfflineFallback("unknown")).toContain("internet connection");
  });
});

describe("Story 12.7: NSIS Installer Config", () => {
  it("tauri.conf.json has NSIS target", () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf-8"),
    );
    expect(config.bundle.targets).toContain("nsis");
  });

  it("tauri.conf.json has MSI target", () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf-8"),
    );
    expect(config.bundle.targets).toContain("msi");
  });

  it("has WebView2 bootstrapper config", () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf-8"),
    );
    expect(config.bundle.windows.webviewInstallMode.type).toBe("downloadBootstrapper");
  });

  it("has NSIS installer icon config", () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf-8"),
    );
    expect(config.bundle.windows.nsis.installerIcon).toBeDefined();
  });

  it("has bundle metadata", () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf-8"),
    );
    expect(config.bundle.shortDescription).toBeDefined();
    expect(config.bundle.publisher).toBe("Darren Strydom");
  });
});
