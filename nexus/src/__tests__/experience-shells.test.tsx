import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

import { BackdropShell } from "@/components/Backdrop/BackdropShell";
import { ChannelShell } from "@/components/Channel/ChannelShell";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";

describe("Experience shells (Backdrop / Channel)", () => {
  beforeEach(() => {
    useUiStore.setState({ activeNav: "library", sidebarOpen: false });
  });

  describe("BackdropShell", () => {
    it("renders titlebar, rail, content and children", () => {
      render(<BackdropShell><div data-testid="child">Hello</div></BackdropShell>);
      expect(screen.getByTestId("backdrop-shell")).toBeInTheDocument();
      expect(screen.getByTestId("titlebar")).toBeInTheDocument();
      expect(screen.getByTestId("backdrop-rail")).toBeInTheDocument();
      expect(screen.getByTestId("backdrop-content")).toBeInTheDocument();
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("keeps the shared nav ids and navigates via the rail", () => {
      render(<BackdropShell>content</BackdropShell>);
      for (const id of ["library", "stats", "random", "completed", "archive", "achievements"]) {
        expect(screen.getByTestId(`nav-${id}`)).toBeInTheDocument();
      }
      fireEvent.click(screen.getByTestId("nav-stats"));
      expect(useUiStore.getState().activeNav).toBe("stats");
    });

    it("opens the flyout with the full sidebar content", () => {
      render(<BackdropShell>content</BackdropShell>);
      expect(screen.queryByTestId("backdrop-flyout")).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("backdrop-flyout-toggle"));
      expect(screen.getByTestId("backdrop-flyout")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("accordion-collections")).toBeInTheDocument();
    });

    it("hides the Twitch rail item when Twitch is disabled", () => {
      useSettingsStore.setState({ twitchEnabled: false });
      render(<BackdropShell>content</BackdropShell>);
      expect(screen.queryByTestId("nav-twitch")).not.toBeInTheDocument();
      useSettingsStore.setState({ twitchEnabled: true });
    });
  });

  describe("ChannelShell", () => {
    it("renders titlebar, tabs, status bar and children", () => {
      render(<ChannelShell><div data-testid="child">Hello</div></ChannelShell>);
      expect(screen.getByTestId("channel-shell")).toBeInTheDocument();
      expect(screen.getByTestId("titlebar")).toBeInTheDocument();
      expect(screen.getByTestId("channel-tabs")).toBeInTheDocument();
      expect(screen.getByTestId("channel-status-bar")).toBeInTheDocument();
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("keeps the shared nav ids and navigates via tabs", () => {
      render(<ChannelShell>content</ChannelShell>);
      for (const id of ["library", "stats", "completed", "archive", "achievements"]) {
        expect(screen.getByTestId(`nav-${id}`)).toBeInTheDocument();
      }
      fireEvent.click(screen.getByTestId("nav-achievements"));
      expect(useUiStore.getState().activeNav).toBe("achievements");
    });

    it("opens the search palette from the tab row", () => {
      render(<ChannelShell>content</ChannelShell>);
      fireEvent.click(screen.getByTestId("channel-search"));
      expect(useUiStore.getState().searchOpen).toBe(true);
    });

    it("opens the filters flyout with the full sidebar content", () => {
      render(<ChannelShell>content</ChannelShell>);
      fireEvent.click(screen.getByTestId("channel-filters-toggle"));
      expect(screen.getByTestId("channel-flyout")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });
  });

  describe("experience setting", () => {
    it("defaults to current and persists valid values", () => {
      expect(["current", "backdrop", "channel"]).toContain(
        useSettingsStore.getState().experience,
      );
      useSettingsStore.getState().setExperience("backdrop");
      expect(useSettingsStore.getState().experience).toBe("backdrop");
      useSettingsStore.getState().setExperience("current");
      expect(useSettingsStore.getState().experience).toBe("current");
    });
  });
});
