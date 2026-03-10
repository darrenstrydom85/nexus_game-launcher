import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "@/components/shared/Sidebar";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore, type GameSource, type GameStatus } from "@/stores/gameStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";

const defaultGame = {
  id: "1",
  name: "Test Game",
  source: "steam" as GameSource,
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: null,
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: ["RPG", "Action"],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "unset" as GameStatus,
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
};

describe("Story 19.3: Twitch Sidebar Nav + Live Count Badge", () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true });
    useGameStore.setState({ games: [defaultGame] });
    useSettingsStore.setState({ twitchEnabled: true, reducedMotion: false });
    useTwitchStore.setState({ liveCount: 0, isAuthenticated: false });
  });

  it("renders Twitch nav item in sidebar when Twitch is enabled", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("nav-twitch")).toBeInTheDocument();
    expect(screen.getByText("Twitch")).toBeInTheDocument();
  });

  it("hides Twitch nav item when Twitch integration is disabled", () => {
    useSettingsStore.setState({ twitchEnabled: false });
    render(<Sidebar />);
    expect(screen.queryByTestId("nav-twitch")).not.toBeInTheDocument();
    expect(screen.queryByText("Twitch")).not.toBeInTheDocument();
  });

  it("shows pill badge with live count when liveCount > 0 and authenticated", () => {
    useTwitchStore.setState({ liveCount: 3, isAuthenticated: true });
    render(<Sidebar />);
    const twitchButton = screen.getByTestId("nav-twitch");
    expect(twitchButton).toHaveTextContent("3");
    expect(twitchButton.querySelector(".bg-red-500")).toBeInTheDocument();
  });

  it("hides badge when live count is 0", () => {
    useTwitchStore.setState({ liveCount: 0, isAuthenticated: true });
    render(<Sidebar />);
    const twitchButton = screen.getByTestId("nav-twitch");
    expect(twitchButton).not.toHaveTextContent(/\d/);
  });

  it("hides badge when not authenticated", () => {
    useTwitchStore.setState({ liveCount: 5, isAuthenticated: false });
    render(<Sidebar />);
    const twitchButton = screen.getByTestId("nav-twitch");
    expect(twitchButton).not.toHaveTextContent("5");
  });

  it("calls onNavigate with twitch when Twitch nav item is clicked", () => {
    const onNavigate = vi.fn();
    render(<Sidebar onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId("nav-twitch"));
    expect(onNavigate).toHaveBeenCalledWith("twitch");
  });

  it("collapsed sidebar shows dot instead of pill when live", () => {
    useUiStore.setState({ sidebarOpen: false });
    useTwitchStore.setState({ liveCount: 2, isAuthenticated: true });
    render(<Sidebar />);
    const twitchButton = screen.getByTestId("nav-twitch");
    expect(screen.queryByText("Twitch")).not.toBeInTheDocument();
    expect(twitchButton).not.toHaveTextContent("2");
    const dot = twitchButton.querySelector(".size-2.rounded-full.bg-red-500");
    expect(dot).toBeInTheDocument();
  });

  it("aria-label includes live count when liveCount > 0", () => {
    useTwitchStore.setState({ liveCount: 4, isAuthenticated: true });
    render(<Sidebar />);
    expect(screen.getByTestId("nav-twitch")).toHaveAttribute(
      "aria-label",
      "Twitch, 4 streamers live",
    );
  });

  it("aria-label is Twitch only when liveCount is 0", () => {
    useTwitchStore.setState({ liveCount: 0, isAuthenticated: true });
    render(<Sidebar />);
    expect(screen.getByTestId("nav-twitch")).toHaveAttribute(
      "aria-label",
      "Twitch",
    );
  });

  it("collapsed tooltip shows live count when streamers are live", () => {
    useUiStore.setState({ sidebarOpen: false });
    useTwitchStore.setState({ liveCount: 3, isAuthenticated: true });
    render(<Sidebar />);
    expect(screen.getByTestId("nav-twitch")).toHaveAttribute(
      "title",
      "Twitch (3 live)",
    );
  });

  it("collapsed tooltip is Twitch only when no one is live", () => {
    useUiStore.setState({ sidebarOpen: false });
    useTwitchStore.setState({ liveCount: 0, isAuthenticated: false });
    render(<Sidebar />);
    expect(screen.getByTestId("nav-twitch")).toHaveAttribute(
      "title",
      "Twitch",
    );
  });
});
