import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
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

});
