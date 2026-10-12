import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const win = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => win,
}));

import { TopBar } from "@/modern/shell/TopBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useStreakStore } from "@/stores/streakStore";
import { useXpStore } from "@/stores/xpStore";
import { useUpdateStore } from "@/stores/updateStore";

function renderBar(props: Partial<React.ComponentProps<typeof TopBar>> = {}) {
  const handlers = {
    onResync: vi.fn(),
    isSyncing: false,
    onOpenSettings: vi.fn(),
    onOpenUpdate: vi.fn(),
    ...props,
  };
  render(
    <TooltipProvider>
      <TopBar {...handlers} />
    </TooltipProvider>,
  );
  return handlers;
}

describe("v1 TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    win.isMaximized.mockResolvedValue(false);
    win.onResized.mockResolvedValue(() => {});
    useUiStore.setState({ activeNav: "home", searchOpen: false, statsScrollTarget: null });
    useSettingsStore.setState({ twitchEnabled: true, retroMode: false, healthCheckIssueCount: 0 });
    useTwitchStore.setState({ liveCount: 0, isAuthenticated: false });
    useStreakStore.setState({ streak: null });
    useXpStore.setState({ summary: null });
    useUpdateStore.setState({ phase: "idle", updateAvailable: false, popupDismissed: false });
  });

  it("is a drag region with the window drag class", () => {
    renderBar();
    const bar = screen.getByTestId("top-bar");
    expect(bar).toHaveAttribute("data-tauri-drag-region");
    expect(bar.className).toContain("titlebar-drag-region");
  });

  it("navigates with the tabs and marks the current one", () => {
    renderBar();
    fireEvent.click(screen.getByTestId("top-tab-library"));
    expect(useUiStore.getState().activeNav).toBe("library");
    expect(screen.getByTestId("top-tab-library")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("top-tab-home")).not.toHaveAttribute("aria-current");
  });

  it("keeps Library current for the completed and archive views", () => {
    useUiStore.setState({ activeNav: "archive" });
    renderBar();
    expect(screen.getByTestId("top-tab-library")).toHaveAttribute("aria-current", "page");
  });

  it("hides the Twitch tab when Twitch is disabled", () => {
    useSettingsStore.setState({ twitchEnabled: false });
    renderBar();
    expect(screen.queryByTestId("top-tab-twitch")).not.toBeInTheDocument();
  });

  it("shows the live count on the Twitch tab", () => {
    useTwitchStore.setState({ liveCount: 3, isAuthenticated: true });
    renderBar();
    expect(screen.getByLabelText("Twitch, 3 live")).toBeInTheDocument();
  });

  it("opens search from the field and from Ctrl+K", () => {
    renderBar();
    fireEvent.click(screen.getByTestId("top-search"));
    expect(useUiStore.getState().searchOpen).toBe(true);
    useUiStore.setState({ searchOpen: false });
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(useUiStore.getState().searchOpen).toBe(true);
  });

  it("drives the window controls", () => {
    renderBar();
    fireEvent.click(screen.getByTestId("top-minimize"));
    fireEvent.click(screen.getByTestId("top-maximize"));
    fireEvent.click(screen.getByTestId("top-close"));
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    expect(win.close).toHaveBeenCalledOnce();
  });

  it("maximises on double-click of empty bar space but not of a control", () => {
    renderBar();
    fireEvent.doubleClick(screen.getByTestId("top-tab-stats"));
    expect(win.toggleMaximize).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByTestId("top-bar"));
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("shows the streak only while one is running", () => {
    renderBar();
    expect(screen.queryByTestId("top-streak")).not.toBeInTheDocument();
  });

  it("streak pill opens Stats", () => {
    useStreakStore.setState({
      streak: { id: "1", currentStreak: 39, longestStreak: 52, lastPlayDate: null, streakStartedAt: null, updatedAt: "" },
    });
    renderBar();
    fireEvent.click(screen.getByTestId("top-streak"));
    expect(useUiStore.getState().activeNav).toBe("stats");
  });

  it("level pill opens Stats at the XP section", () => {
    useXpStore.setState({
      summary: { totalXp: 5121, currentLevel: 7, currentLevelXp: 121, nextLevelXp: 2000, progressToNextLevel: 0.72, leveledUp: false, newLevel: null },
    });
    renderBar();
    fireEvent.click(screen.getByTestId("top-level"));
    expect(useUiStore.getState().activeNav).toBe("stats");
    expect(useUiStore.getState().statsScrollTarget).toBe("xp");
  });

  it("syncs, and disables sync while a sync runs", () => {
    const { onResync } = renderBar();
    fireEvent.click(screen.getByTestId("top-sync"));
    expect(onResync).toHaveBeenCalledOnce();
  });

  it("disables sync while syncing", () => {
    renderBar({ isSyncing: true });
    expect(screen.getByTestId("top-sync")).toBeDisabled();
  });

  it("enters retro mode", () => {
    renderBar();
    fireEvent.click(screen.getByTestId("top-retro"));
    expect(useSettingsStore.getState().retroMode).toBe(true);
  });

  it("flags library health issues on the settings button", () => {
    useSettingsStore.setState({ healthCheckIssueCount: 2 });
    const { onOpenSettings } = renderBar();
    expect(screen.getByTestId("top-settings-dot")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("top-settings"));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  describe("update pill", () => {
    it("is hidden while the update popup has not been dismissed", () => {
      useUpdateStore.setState({ phase: "available", updateAvailable: true, popupDismissed: false });
      renderBar();
      expect(screen.queryByTestId("top-update")).not.toBeInTheDocument();
      expect(screen.getByTestId("top-settings-dot")).toBeInTheDocument();
    });

    it("reopens the update dialog after the popup was dismissed", () => {
      useUpdateStore.setState({ phase: "available", updateAvailable: true, popupDismissed: true });
      const { onOpenUpdate } = renderBar();
      fireEvent.click(screen.getByTestId("top-update"));
      expect(onOpenUpdate).toHaveBeenCalledOnce();
    });

    it("shows download progress", () => {
      useUpdateStore.setState({ phase: "downloading", updateAvailable: true, downloadedBytes: 42, totalBytes: 100 });
      renderBar();
      expect(screen.getByTestId("top-update")).toHaveTextContent("Updating 42%");
    });

    it("restarts once the update is installed", () => {
      const restart = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({ phase: "ready", updateAvailable: true, restart });
      renderBar();
      fireEvent.click(screen.getByTestId("top-update"));
      expect(restart).toHaveBeenCalledOnce();
    });
  });
});
