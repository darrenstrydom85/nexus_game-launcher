// Regression tests for the v1.0.0 release review (PR #39).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { hideGame, setGameRating } from "@/lib/gameActions";
import { LibraryCard } from "@/modern/library/LibraryCard";
import { WeekTile } from "@/modern/home/Tiles";
import { HomePage } from "@/modern/home/HomePage";
import { AchievementsPage } from "@/modern/achievements/AchievementsPage";
import { ConfirmLibraryStep } from "@/components/Onboarding/ConfirmLibraryStep";
import { SteamGridDBStep } from "@/components/Onboarding/SteamGridDBStep";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { useOnboardingStore } from "@/stores/onboardingStore";

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

const lastToast = () => { const t = useToastStore.getState().toasts; return t[t.length - 1]; };
const menu = { onPlay: vi.fn(), onEdit: vi.fn(), onSearchMetadata: vi.fn(), onNewCollectionWithGame: vi.fn() };

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  useToastStore.setState({ toasts: [] });
  useSettingsStore.setState({ hiddenGameIds: [], apiKeys: { steamGridDbKey: "", igdbClientId: "", igdbClientSecret: "" } });
});

describe("game actions say when a write fails", () => {
  it("hide reports failure and leaves the game visible", async () => {
    mockInvoke.mockRejectedValue(new Error("db locked"));
    expect(await hideGame(game("g1", { name: "Hades" }))).toBe(false);
    expect(useSettingsStore.getState().hiddenGameIds).toEqual([]);
    expect(lastToast()).toMatchObject({ type: "error", message: "Couldn't hide Hades." });
  });

  it("rating reports failure", async () => {
    mockInvoke.mockRejectedValue(new Error("db locked"));
    expect(await setGameRating("g1", 4)).toBe(false);
    expect(lastToast()).toMatchObject({ type: "error" });
  });
});

describe("library card artwork", () => {
  it("tries again when the cover URL changes after a failure", () => {
    const props = { selected: false, onOpen: vi.fn(), onOpenFull: vi.fn(), ...menu };
    const { container, rerender } = render(
      <TooltipProvider>
        <LibraryCard game={game("g1", { coverUrl: "old.jpg" })} {...props} />
      </TooltipProvider>,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(
      <TooltipProvider>
        <LibraryCard game={game("g1", { coverUrl: "new.jpg" })} {...props} />
      </TooltipProvider>,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "new.jpg");
  });
});

describe("failed lookups don't masquerade as empty data", () => {
  it("This week says it couldn't load instead of showing 0h", async () => {
    mockInvoke.mockRejectedValue(new Error("db locked"));
    render(
      <TooltipProvider>
        <WeekTile />
      </TooltipProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("tile-week")).toHaveTextContent("Couldn’t load your play time");
  });

  it("Achievements shows an error, not 'no achievements yet'", async () => {
    useAchievementStore.setState({ statuses: [], loading: false, error: false });
    mockInvoke.mockRejectedValue(new Error("db locked"));
    render(<AchievementsPage />);
    await act(async () => {});
    expect(screen.getByTestId("achievements-error")).toHaveTextContent("Couldn’t load your achievements");
  });

  it("Home shows a library error, not the empty-library welcome", async () => {
    useGameStore.setState({ games: [], hasLoaded: false, error: null });
    mockInvoke.mockImplementation((cmd: string) => (cmd === "get_games" ? Promise.reject(new Error("db locked")) : Promise.resolve([])));
    render(
      <TooltipProvider>
        <HomePage onPlay={vi.fn()} onStop={vi.fn()} onOpenRandom={vi.fn()} onResync={vi.fn()} onOpenSettings={vi.fn()} menu={menu} />
      </TooltipProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("home-error")).toHaveTextContent("Couldn’t load your library");
    expect(screen.queryByTestId("home-welcome")).not.toBeInTheDocument();
  });
});

describe("onboarding", () => {
  it("applies tick choices to games that were already in the library", async () => {
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "confirm" });
    useGameStore.setState({ games: [game("g1"), game("g2")] });
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "confirm_games" ? [{ id: "db1", isHidden: true }, { id: "db2", isHidden: false }] : undefined),
    );
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-card-g2"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-finish"));
    });
    // db1 was hidden but is ticked now; db2 was visible but unticked.
    expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "db1", fields: { isHidden: false } });
    expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "db2", fields: { isHidden: true } });
  });

  it("puts the previous artwork key back when a new one fails verification", async () => {
    useSettingsStore.setState({ apiKeys: { steamGridDbKey: "good-key", igdbClientId: "", igdbClientSecret: "" } });
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "verify_steamgrid_key" ? { valid: false, message: "Key rejected" } : undefined),
    );
    render(<SteamGridDBStep />);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), { target: { value: "typo" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-next"));
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("set_setting", { key: "steamgrid_api_key", value: "good-key" });
    expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe("good-key");
  });
});
