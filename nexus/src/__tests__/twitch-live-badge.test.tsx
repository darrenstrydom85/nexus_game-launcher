import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GameCard } from "@/components/GameCard";
import { TwitchLiveBadge } from "@/components/Library/TwitchLiveBadge";
import { useTwitchStore } from "@/stores/twitchStore";
import { useGameStore } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Game, GameSource, GameStatus } from "@/stores/gameStore";
import type { LiveStreamItem } from "@/stores/twitchStore";

vi.mocked(openUrl).mockClear?.();

const baseGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam" as GameSource,
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: ["RPG"],
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

const liveStreamOne: LiveStreamItem = {
  title: "Streaming",
  gameName: "Test Game",
  gameId: "123",
  viewerCount: 50,
  thumbnailUrl: "https://example.com/thumb.jpg",
  startedAt: new Date().toISOString(),
  login: "streamer1",
  displayName: "StreamerOne",
  profileImageUrl: "https://example.com/1.jpg",
};

const liveStreamTwo: LiveStreamItem = {
  ...liveStreamOne,
  gameName: "Test Game",
  login: "streamer2",
  displayName: "StreamerTwo",
  profileImageUrl: "https://example.com/2.jpg",
};

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("Story 19.8: Library Game Cards — Live on Twitch Badge", () => {
  beforeEach(() => {
    useTwitchStore.setState({
      isAuthenticated: true,
      liveStreams: [],
      cachedAt: Date.now(),
    });
    useGameStore.setState({ games: [baseGame] });
    useSettingsStore.setState({ twitchEnabled: true });
    useUiStore.setState({
      activeNav: "library",
      twitchPanelScrollToGameName: null,
      detailOverlayGameId: null,
    });
    vi.mocked(openUrl).mockReset();
  });

  it("badge appears on game card when a followed streamer is playing that game", () => {
    useTwitchStore.setState({
      liveStreams: [liveStreamOne],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<GameCard game={baseGame} />);
    expect(screen.getByTestId("twitch-live-badge")).toBeInTheDocument();
    expect(screen.getByText("1 live")).toBeInTheDocument();
  });

  it("badge shows correct count for multiple streamers", () => {
    useTwitchStore.setState({
      liveStreams: [liveStreamOne, liveStreamTwo],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<GameCard game={baseGame} />);
    expect(screen.getByTestId("twitch-live-badge")).toBeInTheDocument();
    expect(screen.getByText("2 live")).toBeInTheDocument();
  });

  it("badge hidden when no followed streamers are playing the game", () => {
    useTwitchStore.setState({
      liveStreams: [{ ...liveStreamOne, gameName: "Other Game" }],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<GameCard game={baseGame} />);
    expect(screen.queryByTestId("twitch-live-badge")).not.toBeInTheDocument();
  });

  it("badge hidden when not authenticated", () => {
    useTwitchStore.setState({
      isAuthenticated: false,
      liveStreams: [liveStreamOne],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<GameCard game={baseGame} />);
    expect(screen.queryByTestId("twitch-live-badge")).not.toBeInTheDocument();
  });

  it("badge hidden when Twitch integration is disabled in settings", () => {
    useTwitchStore.setState({
      liveStreams: [liveStreamOne],
      cachedAt: Date.now(),
    });
    useSettingsStore.setState({ twitchEnabled: false });
    renderWithTooltip(<GameCard game={baseGame} />);
    expect(screen.queryByTestId("twitch-live-badge")).not.toBeInTheDocument();
  });

  it("tooltip shows correct streamer names for one streamer", async () => {
    const user = userEvent.setup();
    useTwitchStore.setState({
      liveStreams: [liveStreamOne],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<TwitchLiveBadge gameName={baseGame.name} />);
    const badge = screen.getByTestId("twitch-live-badge");
    await user.hover(badge);
    await waitFor(() => {
      const els = screen.getAllByText("StreamerOne is streaming this");
      expect(els.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("tooltip shows correct streamer names for multiple streamers", async () => {
    const user = userEvent.setup();
    useTwitchStore.setState({
      liveStreams: [liveStreamOne, liveStreamTwo],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<TwitchLiveBadge gameName={baseGame.name} />);
    const badge = screen.getByTestId("twitch-live-badge");
    await user.hover(badge);
    await waitFor(() => {
      const els = screen.getAllByText(
        "StreamerOne, StreamerTwo are streaming this",
      );
      expect(els.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("clicking badge with one streamer opens Twitch URL", async () => {
    useTwitchStore.setState({
      liveStreams: [liveStreamOne],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<TwitchLiveBadge gameName={baseGame.name} />);
    const badge = screen.getByTestId("twitch-live-badge");
    fireEvent.click(badge);
    expect(openUrl).toHaveBeenCalledWith("https://twitch.tv/streamer1");
  });

  it("clicking badge with multiple streamers opens Twitch panel and sets scroll target", async () => {
    useTwitchStore.setState({
      liveStreams: [liveStreamOne, liveStreamTwo],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<TwitchLiveBadge gameName={baseGame.name} />);
    const badge = screen.getByTestId("twitch-live-badge");
    fireEvent.click(badge);
    expect(openUrl).not.toHaveBeenCalled();
    expect(useUiStore.getState().activeNav).toBe("twitch");
    expect(useUiStore.getState().twitchPanelScrollToGameName).toBe("Test Game");
  });

  it("badge click does not trigger game card click", () => {
    useTwitchStore.setState({
      liveStreams: [liveStreamOne],
      cachedAt: Date.now(),
    });
    const onCardClick = vi.fn();
    renderWithTooltip(
      <GameCard game={baseGame} onClick={onCardClick} />,
    );
    const badge = screen.getByTestId("twitch-live-badge");
    fireEvent.click(badge);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("matching is case-insensitive", () => {
    useTwitchStore.setState({
      liveStreams: [{ ...liveStreamOne, gameName: "test game" }],
      cachedAt: Date.now(),
    });
    renderWithTooltip(<GameCard game={baseGame} />);
    expect(screen.getByTestId("twitch-live-badge")).toBeInTheDocument();
  });
});
