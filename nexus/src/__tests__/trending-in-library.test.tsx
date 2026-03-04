import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TrendingInLibrary } from "@/components/Twitch/TrendingInLibrary";
import { TrendingGameCard } from "@/components/Twitch/TrendingGameCard";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import type { TrendingLibraryGame } from "@/lib/tauri";

const mockTrendingGames: TrendingLibraryGame[] = [
  {
    gameId: "g1",
    gameName: "Game One",
    twitchGameName: "Game One",
    twitchViewerCount: 50000,
    twitchStreamCount: 120,
    twitchRank: 1,
  },
  {
    gameId: "g2",
    gameName: "Game Two",
    twitchGameName: "Game Two",
    twitchViewerCount: 25000,
    twitchStreamCount: 80,
    twitchRank: 2,
  },
  {
    gameId: "g3",
    gameName: "Game Three",
    twitchGameName: "Game Three",
    twitchViewerCount: 10000,
    twitchStreamCount: 45,
    twitchRank: 3,
  },
];

describe("Story 19.9: Trending in Your Library", () => {
  beforeEach(() => {
    useTwitchStore.setState({
      isAuthenticated: true,
      trendingGames: [],
      trendingStale: false,
      trendingCachedAt: null,
      trendingLoading: false,
    });
    useSettingsStore.setState({ twitchEnabled: true });
    useGameStore.setState({
      games: [
        { id: "g1", name: "Game One", coverUrl: null } as ReturnType<typeof useGameStore.getState>["games"][0],
        { id: "g2", name: "Game Two", coverUrl: null } as ReturnType<typeof useGameStore.getState>["games"][0],
        { id: "g3", name: "Game Three", coverUrl: null } as ReturnType<typeof useGameStore.getState>["games"][0],
      ],
    });
    useUiStore.setState({ detailOverlayGameId: null });
    vi.mocked(openUrl).mockClear?.();
  });

  it("section renders when >= 3 library games are trending", () => {
    useTwitchStore.setState({ trendingGames: mockTrendingGames });
    render(<TrendingInLibrary />);
    expect(
      screen.getByRole("heading", { name: /trending in your library/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: /games in your library trending on twitch/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Game One")).toBeInTheDocument();
    expect(screen.getByText("Game Two")).toBeInTheDocument();
    expect(screen.getByText("Game Three")).toBeInTheDocument();
  });

  it("section hidden when < 3 matches", () => {
    useTwitchStore.setState({
      trendingGames: mockTrendingGames.slice(0, 2),
    });
    const { container } = render(<TrendingInLibrary />);
    expect(
      container.querySelector('[id="trending-in-library-heading"]'),
    ).not.toBeInTheDocument();
  });

  it("games sorted by Twitch rank", () => {
    useTwitchStore.setState({
      trendingGames: [
        mockTrendingGames[2],
        mockTrendingGames[0],
        mockTrendingGames[1],
      ],
    });
    render(<TrendingInLibrary />);
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(3);
    expect(listItems[0]).toHaveTextContent("Game Three");
    expect(listItems[0]).toHaveTextContent("#3");
    expect(listItems[1]).toHaveTextContent("Game One");
    expect(listItems[2]).toHaveTextContent("Game Two");
  });

  it("clicking card opens game detail overlay", () => {
    useTwitchStore.setState({ trendingGames: mockTrendingGames });
    render(<TrendingInLibrary />);
    const card = screen.getByText("Game One").closest("article");
    expect(card).toBeInTheDocument();
    fireEvent.click(card!);
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
  });

  it("clicking Twitch icon opens Twitch directory URL", async () => {
    render(
      <TrendingGameCard game={mockTrendingGames[0]} />,
    );
    const twitchButton = screen.getByRole("button", {
      name: /open game one on twitch/i,
    });
    fireEvent.click(twitchButton);
    expect(openUrl).toHaveBeenCalledWith(
      "https://twitch.tv/directory/game/Game%20One",
    );
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });

  it("section hidden when not authenticated", () => {
    useTwitchStore.setState({
      isAuthenticated: false,
      trendingGames: mockTrendingGames,
    });
    const { container } = render(<TrendingInLibrary />);
    expect(
      container.querySelector('[id="trending-in-library-heading"]'),
    ).not.toBeInTheDocument();
  });

  it("section hidden when Twitch integration disabled in settings", () => {
    useSettingsStore.setState({ twitchEnabled: false });
    useTwitchStore.setState({ trendingGames: mockTrendingGames });
    const { container } = render(<TrendingInLibrary />);
    expect(
      container.querySelector('[id="trending-in-library-heading"]'),
    ).not.toBeInTheDocument();
  });

  it("arrow buttons have accessible labels", () => {
    useTwitchStore.setState({ trendingGames: mockTrendingGames });
    render(<TrendingInLibrary />);
    expect(screen.getByRole("button", { name: /scroll left/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /scroll right/i })).toBeInTheDocument();
  });

  it("viewer count formatted with compact notation", () => {
    useTwitchStore.setState({ trendingGames: mockTrendingGames });
    render(<TrendingInLibrary />);
    expect(screen.getByText("50.0K viewers")).toBeInTheDocument();
    expect(screen.getByText("25.0K viewers")).toBeInTheDocument();
    expect(screen.getByText("10.0K viewers")).toBeInTheDocument();
  });
});
