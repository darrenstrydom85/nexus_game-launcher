import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { TwitchPanel } from "@/components/Twitch/TwitchPanel";
import { StreamCard } from "@/components/Twitch/StreamCard";
import { OfflineChannelRow } from "@/components/Twitch/OfflineChannelRow";
import { useTwitchStore } from "@/stores/twitchStore";
import { useGameStore } from "@/stores/gameStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LiveStreamItem, TwitchChannel } from "@/stores/twitchStore";
import type { GameSource, GameStatus } from "@/stores/gameStore";

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
  progress: null,
  milestonesJson: null,
};

const mockLiveStream: LiveStreamItem = {
  title: "Playing",
  gameName: "Test Game",
  gameId: "123",
  viewerCount: 100,
  thumbnailUrl: "https://example.com/thumb.jpg",
  startedAt: new Date().toISOString(),
  login: "streamer1",
  displayName: "Streamer1",
  profileImageUrl: "https://example.com/1.jpg",
};

const mockChannelLive = (overrides?: Partial<TwitchChannel>): TwitchChannel => ({
  id: "c1",
  login: "streamer1",
  displayName: "Streamer1",
  profileImageUrl: "https://example.com/1.jpg",
  isLive: true,
  stream: {
    title: "Playing Test Game",
    gameName: "Test Game",
    gameId: "123",
    viewerCount: 100,
    thumbnailUrl: "https://example.com/thumb-{width}x{height}.jpg",
    startedAt: new Date().toISOString(),
  },
  isFavorite: false,
  ...overrides,
});

const mockChannelOffline = (
  overrides?: Partial<TwitchChannel>,
): TwitchChannel => ({
  id: "c2",
  login: "streamer2",
  displayName: "Streamer2",
  profileImageUrl: "https://example.com/2.jpg",
  isLive: false,
  stream: null,
  isFavorite: false,
  ...overrides,
});

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("Story 19.7: Streamer Favorites & Pinning", () => {
  beforeEach(() => {
    useTwitchStore.setState({
      liveCount: 0,
      isAuthenticated: false,
      channels: [],
      liveStreams: [],
      isLoading: false,
      error: null,
      stale: false,
      cachedAt: null,
    });
    useGameStore.setState({ games: [defaultGame] });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [],
          stale: false,
          cachedAt: null,
        });
      }
      if (cmd === "set_twitch_favorite") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({});
    });
  });

  it("clicking star toggles favorite state (optimistic + invoke)", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [mockChannelLive({ id: "c1", isFavorite: false })],
          stale: false,
          cachedAt: null,
        });
      }
      if (cmd === "set_twitch_favorite") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({});
    });
    renderWithTooltip(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument();
    });
    const starButton = screen.getByRole("button", {
      name: /Add Streamer1 to favorites/i,
    });
    expect(starButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(starButton);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_twitch_favorite", {
        channelId: "c1",
        isFavorite: true,
      });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Remove Streamer1 from favorites/i }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("favorited live streamers appear in Live Now with star icon", async () => {
    const liveFav = mockChannelLive({
      id: "c1",
      login: "streamer1",
      displayName: "Streamer1",
      isFavorite: true,
    });
    const liveOther = mockChannelLive({
      id: "c3",
      login: "streamer3",
      displayName: "Streamer3",
      profileImageUrl: "https://example.com/3.jpg",
      isFavorite: false,
      stream: {
        ...mockChannelLive().stream!,
        gameName: "Other Game",
      },
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [liveFav, liveOther],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    renderWithTooltip(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument();
    });
    expect(screen.getByText("Streamer1")).toBeInTheDocument();
    expect(screen.getAllByText("Other Game").length).toBeGreaterThan(0);
    // Favorited streamer has Remove button (aria-pressed true), non-favorited has Add button
    expect(screen.getByRole("button", { name: /Remove Streamer1 from favorites/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Add Streamer3 to favorites/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("favorited offline channels sort to top", async () => {
    const offFav = mockChannelOffline({
      id: "c2",
      displayName: "Alpha",
      isFavorite: true,
    });
    const offB = mockChannelOffline({
      id: "c4",
      login: "streamer4",
      displayName: "Beta",
      profileImageUrl: "https://example.com/4.jpg",
      isFavorite: false,
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [offB, offFav],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    renderWithTooltip(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
    const offlineButton = screen.getByRole("button", { name: /offline/i });
    fireEvent.click(offlineButton);
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
    const rows = screen.getAllByRole("link");
    const alphaRow = rows.find((r) => r.textContent?.includes("Alpha"));
    const betaRow = rows.find((r) => r.textContent?.includes("Beta"));
    expect(alphaRow).toBeDefined();
    expect(betaRow).toBeDefined();
    const container = offlineButton.closest("section");
    const text = container?.textContent ?? "";
    const alphaIdx = text.indexOf("Alpha");
    const betaIdx = text.indexOf("Beta");
    expect(alphaIdx).toBeLessThan(betaIdx);
  });

  it("aria-pressed reflects favorite state on star button", () => {
    const onToggle = vi.fn();
    const { rerender } = renderWithTooltip(
      <StreamCard
        stream={mockLiveStream}
        isFavorite={false}
        onToggleFavorite={onToggle}
      />,
    );
    const star = screen.getByRole("button", {
      name: /Add Streamer1 to favorites/i,
    });
    expect(star).toHaveAttribute("aria-pressed", "false");
    rerender(
      <TooltipProvider>
        <StreamCard
          stream={mockLiveStream}
          isFavorite={true}
          onToggleFavorite={onToggle}
        />
      </TooltipProvider>,
    );
    const starFav = screen.getByRole("button", {
      name: /Remove Streamer1 from favorites/i,
    });
    expect(starFav).toHaveAttribute("aria-pressed", "true");
  });

  it("max 20 favorites shows tooltip and does not toggle", async () => {
    const channels = Array.from({ length: 21 }, (_, i) =>
      mockChannelOffline({
        id: `c${i}`,
        login: `user${i}`,
        displayName: `User${i}`,
        profileImageUrl: "https://example.com/a.jpg",
        isFavorite: i < 20,
      }),
    );
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: channels,
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    renderWithTooltip(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
    const offlineButton = screen.getByRole("button", { name: /offline/i });
    fireEvent.click(offlineButton);
    await waitFor(() => {
      expect(screen.getByText("User20")).toBeInTheDocument();
    });
    const addFavoriteButton = screen.getByRole("button", {
      name: /Add User20 to favorites/i,
    });
    expect(addFavoriteButton).toBeInTheDocument();
    vi.mocked(invoke).mockClear();
    fireEvent.click(addFavoriteButton);
    // At limit: toggle is no-op, set_twitch_favorite not called for this channel
    expect(invoke).not.toHaveBeenCalledWith("set_twitch_favorite", {
      channelId: "c20",
      isFavorite: true,
    });
    // Button still shows "Add" (not toggled)
    expect(
      screen.getByRole("button", { name: /Add User20 to favorites/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("favorite state persists when get_twitch_followed_channels returns isFavorite", async () => {
    const ch = mockChannelLive({ id: "c1", isFavorite: true });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [ch],
          stale: false,
          cachedAt: Math.floor(Date.now() / 1000),
        });
      }
      return Promise.resolve({});
    });
    renderWithTooltip(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument();
    });
    const star = screen.getByRole("button", {
      name: /Remove Streamer1 from favorites/i,
    });
    expect(star).toHaveAttribute("aria-pressed", "true");
    expect(useTwitchStore.getState().channels[0]?.isFavorite).toBe(true);
  });
});

describe("Story 19.7: OfflineChannelRow favorites", () => {
  it("shows Add to favorites when not favorited", () => {
    const ch = mockChannelOffline({ displayName: "OfflineUser", isFavorite: false });
    renderWithTooltip(
      <OfflineChannelRow channel={ch} onToggleFavorite={vi.fn()} />,
    );
    const addButton = screen.getByRole("button", {
      name: /Add OfflineUser to favorites/i,
    });
    expect(addButton).toHaveAttribute("aria-pressed", "false");
  });

  it("shows Remove from favorites when favorited", () => {
    const ch = mockChannelOffline({ displayName: "OfflineUser" });
    renderWithTooltip(
      <OfflineChannelRow
        channel={ch}
        isFavorite={true}
        onToggleFavorite={vi.fn()}
      />,
    );
    const removeButton = screen.getByRole("button", {
      name: /Remove OfflineUser from favorites/i,
    });
    expect(removeButton).toHaveAttribute("aria-pressed", "true");
  });
});
