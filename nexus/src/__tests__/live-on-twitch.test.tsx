import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LiveOnTwitch } from "@/components/GameDetail/LiveOnTwitch";
import { TwitchStreamRow } from "@/components/GameDetail/TwitchStreamRow";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import * as tauri from "@/lib/tauri";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/tauri", async (importOriginal) => {
  const mod = await importOriginal<typeof tauri>();
  return { ...mod, getTwitchStreamsByGame: vi.fn() };
});

const mockStream = (
  userId: string,
  login: string,
  displayName: string,
  viewerCount: number,
) => ({
  userId,
  login,
  displayName,
  profileImageUrl: "https://example.com/avatar.png",
  title: "Just chatting",
  gameName: "Test Game",
  gameId: "123",
  viewerCount,
  thumbnailUrl: "https://example.com/thumb.jpg",
  startedAt: new Date(Date.now() - 7200000).toISOString(),
});

describe("Story 19.5: Live on Twitch section", () => {
  beforeEach(() => {
    vi.useRealTimers();
    useConnectivityStore.setState({ isOnline: true });
    useTwitchStore.setState({
      isAuthenticated: false,
      channels: [],
      streamsByGame: {},
      streamsByGameLoading: {},
      streamsByGameError: {},
    });
    vi.mocked(tauri.getTwitchStreamsByGame).mockResolvedValue({
      data: { streams: [], twitchGameName: "" },
      stale: false,
      cachedAt: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("section hidden when not authenticated", () => {
    render(<LiveOnTwitch gameName="Test Game" />);
    expect(screen.queryByTestId("live-on-twitch-section")).not.toBeInTheDocument();
  });

  it("section hidden when offline and no cache", () => {
    useConnectivityStore.setState({ isOnline: false });
    useTwitchStore.setState({
      isAuthenticated: true,
      streamsByGame: {},
      streamsByGameLoading: { "Test Game": false },
      streamsByGameError: { "Test Game": "Network error" },
    });
    render(<LiveOnTwitch gameName="Test Game" />);
    expect(screen.queryByTestId("live-on-twitch-section")).not.toBeInTheDocument();
  });

  it("section renders with stream data when authenticated", async () => {
    useTwitchStore.setState({ isAuthenticated: true });
    vi.mocked(tauri.getTwitchStreamsByGame).mockResolvedValue({
      data: {
        streams: [
          mockStream("u1", "streamer1", "Streamer1", 100),
        ],
        twitchGameName: "Test Game",
      },
      stale: false,
      cachedAt: Date.now() / 1000,
    });
    render(<LiveOnTwitch gameName="Test Game" />);
    await waitFor(() => {
      expect(screen.getByTestId("live-on-twitch-section")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Streamer1")).toBeInTheDocument();
    });
  });

  it("streams sorted by viewer count descending", async () => {
    useTwitchStore.setState({ isAuthenticated: true });
    vi.mocked(tauri.getTwitchStreamsByGame).mockResolvedValue({
      data: {
        streams: [
          mockStream("u1", "low", "Low", 10),
          mockStream("u2", "high", "High", 500),
          mockStream("u3", "mid", "Mid", 100),
        ],
        twitchGameName: "Test Game",
      },
      stale: false,
      cachedAt: Date.now() / 1000,
    });
    render(<LiveOnTwitch gameName="Test Game" />);
    await waitFor(() => {
      expect(screen.getByText("High")).toBeInTheDocument();
    });
    const rows = screen.getAllByRole("link");
    expect(rows[0]).toHaveAttribute("aria-label", expect.stringContaining("High"));
    expect(rows[1]).toHaveAttribute("aria-label", expect.stringContaining("Mid"));
    expect(rows[2]).toHaveAttribute("aria-label", expect.stringContaining("Low"));
  });

  it("max 6 streams shown, View all link when > 6", async () => {
    useTwitchStore.setState({ isAuthenticated: true });
    const streams = Array.from({ length: 8 }, (_, i) =>
      mockStream(`u${i}`, `s${i}`, `Streamer${i}`, 100 - i),
    );
    vi.mocked(tauri.getTwitchStreamsByGame).mockResolvedValue({
      data: { streams, twitchGameName: "Test Game" },
      stale: false,
      cachedAt: Date.now() / 1000,
    });
    render(<LiveOnTwitch gameName="Test Game" />);
    await waitFor(() => {
      expect(screen.getByTestId("live-on-twitch-view-all")).toBeInTheDocument();
    });
    const rows = screen.getAllByRole("link", { name: /streaming to \d+ viewers/ });
    expect(rows.length).toBe(6);
  });

  it("Following badge shown for followed streamers", () => {
    const stream = mockStream("u1", "streamer1", "Streamer1", 100);
    render(
      <TwitchStreamRow
        stream={stream}
        isFollowing={true}
        gameName="Test Game"
      />,
    );
    expect(screen.getByText("Following")).toBeInTheDocument();
  });

  it("No one is streaming message when 0 streams", async () => {
    useTwitchStore.setState({
      isAuthenticated: true,
      streamsByGame: {
        "Test Game": {
          data: { streams: [], twitchGameName: "Test Game" },
          cachedAt: Date.now(),
        },
      },
      streamsByGameLoading: { "Test Game": false },
      streamsByGameError: {},
    });
    render(<LiveOnTwitch gameName="Test Game" />);
    // Section is collapsed when 0 streams; expand to see empty message
    fireEvent.click(screen.getByRole("button", { name: /Live on Twitch/i }));
    expect(screen.getByTestId("live-on-twitch-empty")).toBeInTheDocument();
    expect(screen.getByText(/No one is streaming Test Game right now/)).toBeInTheDocument();
  });

  it("clicking row calls openUrl with correct URL", async () => {
    const stream = mockStream("u1", "streamer1", "Streamer1", 100);
    render(
      <TwitchStreamRow
        stream={stream}
        isFollowing={false}
        gameName="Test Game"
      />,
    );
    const row = screen.getByRole("link", { name: /Streamer1 streaming to 100 viewers/ });
    fireEvent.click(row);
    expect(openUrl).toHaveBeenCalledWith("https://twitch.tv/streamer1");
  });

  it("section shows when loading (skeleton when expanded)", () => {
    useTwitchStore.setState({
      isAuthenticated: true,
      streamsByGame: {},
      streamsByGameLoading: { "Test Game": true },
      streamsByGameError: {},
    });
    render(<LiveOnTwitch gameName="Test Game" />);
    expect(screen.getByTestId("live-on-twitch-section")).toBeInTheDocument();
  });

  it("section has aria-label for game name", async () => {
    useTwitchStore.setState({ isAuthenticated: true });
    vi.mocked(tauri.getTwitchStreamsByGame).mockResolvedValue({
      data: { streams: [], twitchGameName: "Test Game" },
      stale: false,
      cachedAt: Date.now() / 1000,
    });
    render(<LiveOnTwitch gameName="My Game" />);
    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: /Live streams on Twitch for My Game/ }),
      ).toBeInTheDocument();
    });
  });
});
