import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TwitchPanel } from "@/components/Twitch/TwitchPanel";
import { useTwitchStore } from "@/stores/twitchStore";
import { useGameStore, type GameSource, type GameStatus } from "@/stores/gameStore";

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
};

const mockChannelLive = {
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
};

const mockChannelOffline = {
  id: "c2",
  login: "streamer2",
  displayName: "Streamer2",
  profileImageUrl: "https://example.com/2.jpg",
  isLive: false,
  stream: null,
};

describe("Story 19.4: Followed Streams Panel", () => {
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
        return Promise.resolve({ authenticated: false });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: false });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
  });

  it("shows connect prompt when not authenticated", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: false });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: false });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Connect your Twitch account")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /connect with twitch/i })).toBeInTheDocument();
  });

  it("shows skeleton loading state when loading and no channels", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return new Promise(() => {}); // never resolve to keep loading
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Twitch")).toBeInTheDocument();
    });
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders live streams in a flat grid with game name on each card", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [
            mockChannelLive,
            {
              ...mockChannelLive,
              id: "c3",
              login: "streamer3",
              displayName: "Streamer3",
              profileImageUrl: "https://example.com/3.jpg",
              stream: {
                ...mockChannelLive.stream!,
                gameName: "Test Game",
              },
            },
          ],
          stale: false,
          cachedAt: Math.floor(Date.now() / 1000),
        });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Live Now")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Test Game").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByLabelText(/Streamer1 streaming/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Streamer3 streaming/)).toBeInTheDocument();
  });

  it('shows "In Library" badge for games in user library', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [mockChannelLive],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      const liveSection = screen.getByRole("region", { name: "Live Now" });
      expect(within(liveSection).getByText("Test Game")).toBeInTheDocument();
    });
    expect(screen.getAllByText("In Library").length).toBeGreaterThan(0);
  });

  it("offline section is collapsible and toggles", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [mockChannelLive, mockChannelOffline],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
    const offlineButton = screen.getByRole("button", { name: /offline/i });
    expect(offlineButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(offlineButton);
    await waitFor(() => {
      expect(offlineButton).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText("Streamer2")).toBeInTheDocument();
  });

  it("shows stale data bar when stale is true", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [mockChannelLive],
          stale: true,
          cachedAt: Math.floor(Date.now() / 1000) - 300,
        });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Showing cached data/)).toBeInTheDocument();
    });
  });

  it("clicking stream card calls openUrl with correct Twitch URL", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [mockChannelLive],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Streamer1 streaming/)).toBeInTheDocument();
    });
    const card = screen.getByLabelText(/Streamer1 streaming/);
    fireEvent.click(card);
    expect(openUrl).toHaveBeenCalledWith("https://twitch.tv/streamer1");
  });

  it("shows empty state when following 0 channels", async () => {
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
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText(/not following anyone on Twitch yet/)).toBeInTheDocument();
    });
    expect(screen.getByText("Find streamers on Twitch →")).toBeInTheDocument();
  });

  it("shows error state when fetch fails and no cache", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByText("Couldn't reach Twitch")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows game filter with unique games from live streams and filters by selection", async () => {
    const channelOtherGame = {
      ...mockChannelLive,
      id: "c3",
      login: "streamer3",
      displayName: "Streamer3",
      stream: {
        ...mockChannelLive.stream!,
        gameName: "Just Chatting",
      },
    };
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "twitch_auth_status") {
        return Promise.resolve({ authenticated: true });
      }
      if (cmd === "get_twitch_followed_channels") {
        return Promise.resolve({
          data: [mockChannelLive, channelOtherGame],
          stale: false,
          cachedAt: null,
        });
      }
      return Promise.resolve({});
    });
    render(<TwitchPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("twitch-game-filter")).toBeInTheDocument();
    });
    const filter = screen.getByTestId("twitch-game-filter");
    expect(filter).toHaveValue("");
    expect(screen.getByLabelText(/Streamer1 streaming/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Streamer3 streaming/)).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "Just Chatting" } });
    expect(screen.getByLabelText(/Streamer3 streaming/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Streamer1 streaming/)).not.toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "" } });
    expect(screen.getByLabelText(/Streamer1 streaming/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Streamer3 streaming/)).toBeInTheDocument();
  });
});
