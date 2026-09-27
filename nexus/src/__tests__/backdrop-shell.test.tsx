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
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";

describe("BackdropShell", () => {
  beforeEach(() => {
    useUiStore.setState({ activeNav: "library", sidebarOpen: false });
  });

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

  it("hides the Twitch rail item when Twitch is disabled", () => {
    useSettingsStore.setState({ twitchEnabled: false });
    render(<BackdropShell>content</BackdropShell>);
    expect(screen.queryByTestId("nav-twitch")).not.toBeInTheDocument();
    useSettingsStore.setState({ twitchEnabled: true });
  });

  it("shows the settings button with health badge when issues exist", () => {
    useSettingsStore.setState({ healthCheckIssueCount: 2 });
    render(<BackdropShell>content</BackdropShell>);
    expect(screen.getByTestId("settings-button")).toBeInTheDocument();
    expect(screen.getByTestId("settings-health-badge")).toBeInTheDocument();
    useSettingsStore.setState({ healthCheckIssueCount: 0 });
  });
});
