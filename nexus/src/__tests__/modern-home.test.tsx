import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { pickSpotlight, Spotlight } from "@/modern/home/Spotlight";
import { AchievementsTile, LevelTile, RandomTile, ThisPcTile, TwitchTile, UpNextTile, WeekTile } from "@/modern/home/Tiles";
import { dayKey } from "@/hooks/useDailyActivity";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGameStore, type Game, type ActiveSession } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQueueStore } from "@/stores/queueStore";
import { useXpStore } from "@/stores/xpStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { useTwitchStore } from "@/stores/twitchStore";
import type { AchievementStatus, PlayQueueEntry } from "@/lib/tauri";

function game(id: string, over: Partial<Game> = {}): Game {
  return {
    id, name: id, source: "steam", folderPath: null, exePath: null, exeName: null, launchUrl: null,
    igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null,
    iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: [],
    releaseDate: null, criticScore: null, criticScoreCount: null, communityScore: null,
    communityScoreCount: null, trailerUrl: null, status: "unset", rating: null, totalPlayTimeS: 0,
    lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false, hltbMainH: null,
    hltbMainExtraH: null, hltbCompletionistH: null, hltbId: null, hltbFetchedAt: null, notes: null,
    progress: null, milestonesJson: null, completed: false, ...over,
  };
}

const session = (gameId: string): ActiveSession => ({
  sessionId: "s", gameId, gameName: gameId, coverUrl: null, heroUrl: null, startedAt: new Date().toISOString(),
  dominantColor: "", pid: 1, exeName: null, folderPath: null, potentialExeNames: null, processDetected: true, hasDbSession: true,
});

const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue([]);
  useGameStore.setState({ games: [], activeSession: null, lastSessionEndedAt: 0 });
  useUiStore.setState({ activeNav: "home", quickViewGameId: null, quickViewIds: [], statsScrollTarget: null, twitchPanelScrollToGameName: null });
  useSettingsStore.setState({ hiddenGameIds: [], twitchEnabled: true, showHardwareOnHome: true });
  useQueueStore.setState({ entries: [] });
});

describe("spotlight", () => {
  const older = game("Old", { lastPlayedAt: "2026-09-01T10:00:00Z" });
  const newer = game("New", { lastPlayedAt: "2026-10-10T10:00:00Z" });
  const never = game("Fresh", { addedAt: "2026-10-11T10:00:00Z" });

  it("puts the running game first, then most recently played", () => {
    expect(pickSpotlight([older, newer, never], null).list.map((g) => g.id)).toEqual(["New", "Old"]);
    expect(pickSpotlight([older, newer, never], "Old").list.map((g) => g.id)).toEqual(["Old", "New"]);
  });

  it("starts a fresh library on its best-rated unplayed games, artwork first", () => {
    const res = pickSpotlight([never, game("Great", { criticScore: 92, heroUrl: "h.jpg" }), game("Good", { criticScore: 95 })], null);
    expect(res.mode).toBe("picks");
    expect(res.list.map((g) => g.id)).toEqual(["Great", "Good", "Fresh"]);
  });

  it("continues the last played game and switches with the thumbnails", () => {
    useGameStore.setState({ games: [older, newer] });
    const onPlay = vi.fn();
    wrap(<Spotlight onPlay={onPlay} onStop={vi.fn()} />);
    expect(screen.getByTestId("spotlight-eyebrow")).toHaveTextContent(/Continue · last played/);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New");
    fireEvent.click(screen.getByTestId("spotlight-thumb-Old"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Old");
    fireEvent.click(screen.getByTestId("spotlight-play"));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "Old" }));
    fireEvent.click(screen.getByTestId("spotlight-quick-view"));
    expect(useUiStore.getState().quickViewGameId).toBe("Old");
    expect(useUiStore.getState().quickViewIds).toEqual(["New", "Old"]);
  });

  it("shows the running game with a Stop button", () => {
    useGameStore.setState({ games: [older, newer], activeSession: session("Old") });
    const onStop = vi.fn();
    wrap(<Spotlight onPlay={vi.fn()} onStop={onStop} />);
    expect(screen.getByTestId("spotlight-eyebrow")).toHaveTextContent("Now playing");
    fireEvent.click(screen.getByTestId("spotlight-play"));
    expect(onStop).toHaveBeenCalledOnce();
  });

});

describe("tiles", () => {
  it("Up next plays and removes queued games, and expands past four", () => {
    const entries: PlayQueueEntry[] = ["A", "B", "C", "D", "E"].map((id, i) => ({
      id, gameId: id, position: i, addedAt: "", name: id, coverUrl: null, customCover: null, status: "backlog", source: "steam",
    }));
    const remove = vi.fn();
    useQueueStore.setState({ entries, remove });
    useGameStore.setState({ games: [game("A")] });
    const onPlay = vi.fn();
    wrap(<UpNextTile onPlay={onPlay} />);
    expect(screen.queryByTestId("up-next-E")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Show all 5"));
    expect(screen.getByTestId("up-next-E")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("up-next-play-A"));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "A" }));
    fireEvent.click(screen.getByLabelText("Remove B from queue"));
    expect(remove).toHaveBeenCalledWith("B", "B");
  });

  it("This week totals the last seven days against the week before", async () => {
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 8);
    mockInvoke.mockResolvedValue([
      { period: dayKey(today), totalTime: 7200, sessionCount: 1 },
      { period: dayKey(lastWeek), totalTime: 3600, sessionCount: 1 },
    ]);
    wrap(<WeekTile />);
    await waitFor(() => expect(screen.getByText("+1h 0m vs last week")).toBeInTheDocument());
    expect(screen.getByText("2h 0m")).toBeInTheDocument();
  });

  it("Can't decide picks from the backlog and rerolls", () => {
    useGameStore.setState({ games: [game("A", { status: "backlog" }), game("B", { status: "backlog" }), game("Done", { status: "completed", completed: true })] });
    wrap(<RandomTile onPlay={vi.fn()} onOpenPack={vi.fn()} />);
    const first = screen.getByTestId("random-pick").textContent;
    expect(["A", "B"]).toContain(first);
    fireEvent.click(screen.getByTestId("random-reroll"));
    expect(screen.getByTestId("random-pick").textContent).not.toBe(first);
  });

  it("Level opens Stats at the XP section", () => {
    useXpStore.setState({ summary: { totalXp: 5121, currentLevel: 7, currentLevelXp: 121, nextLevelXp: 2100, progressToNextLevel: 0.06, leveledUp: false, newLevel: null } });
    wrap(<LevelTile />);
    expect(screen.getByText(/979 XP to level 8$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(useUiStore.getState().statsScrollTarget).toBe("xp");
  });

  it("Achievements shows the latest unlock and the closest one", () => {
    const base = { icon: "Award", category: "library", points: 10, contextJson: null } as const;
    const statuses = [
      { ...base, id: "a", name: "First Launch", description: "", rarity: "common", unlocked: true, unlockedAt: "2026-01-01" },
      { ...base, id: "b", name: "Hoarder", description: "Add 200 games", rarity: "rare", unlocked: true, unlockedAt: "2026-10-12" },
      { ...base, id: "c", name: "Century Gamer", description: "", rarity: "rare", unlocked: false, unlockedAt: null, progressCurrent: 86, progressTarget: 100 },
      { ...base, id: "d", name: "Veteran", description: "", rarity: "epic", unlocked: false, unlockedAt: null, progressCurrent: 86, progressTarget: 500 },
    ] as unknown as AchievementStatus[];
    useAchievementStore.setState({ statuses });
    wrap(<AchievementsTile />);
    expect(screen.getByText("2 of 4 unlocked")).toBeInTheDocument();
    expect(screen.getByText("Hoarder")).toBeInTheDocument();
    expect(screen.getByText("Next: Century Gamer")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hoarder"));
    expect(useAchievementStore.getState().highlightId).toBe("b");
    expect(useUiStore.getState().activeNav).toBe("achievements");
  });

  it("Twitch only shows when connected and something is live", () => {
    useTwitchStore.setState({ isAuthenticated: false, trendingGames: [] });
    const { container } = wrap(<TwitchTile />);
    expect(container).toBeEmptyDOMElement();
    act(() =>
      useTwitchStore.setState({
        isAuthenticated: true,
        trendingGames: [{ gameId: "g", gameName: "Hades", twitchGameName: "Hades", twitchViewerCount: 12400, twitchStreamCount: 38, twitchRank: 14 }],
      }),
    );
    expect(screen.getByText("38 channels · 12k watching")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hades"));
    expect(useUiStore.getState().activeNav).toBe("twitch");
    expect(useUiStore.getState().twitchPanelScrollToGameName).toBe("Hades");
  });

  it("This PC shows trimmed hardware names unless switched off", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(
        cmd === "get_system_hardware"
          ? { cpuBrand: "amd", cpuName: "AMD Ryzen 7 9800X3D 8-Core Processor", gpuBrand: "amd", gpuName: "AMD Radeon RX 9070 XT" }
          : [],
      ),
    );
    const view = wrap(<ThisPcTile />);
    await waitFor(() => expect(screen.getByText("Ryzen 7 9800X3D 8-Core Processor")).toBeInTheDocument());
    expect(screen.getByText("Radeon RX 9070 XT")).toBeInTheDocument();
    act(() => useSettingsStore.setState({ showHardwareOnHome: false }));
    expect(view.container).toBeEmptyDOMElement();
  });
});
