import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { HomePage } from "@/modern/home/HomePage";
import { isFreshLibrary, jumpBackIn, libraryShape, newlyAdded, weekendGames } from "@/modern/home/homePicks";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQueueStore } from "@/stores/queueStore";
import { useTwitchStore } from "@/stores/twitchStore";

const NOW = new Date("2026-10-12T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function game(id: string, over: Partial<Game> = {}): Game {
  return {
    id, name: id, source: "steam", folderPath: null, exePath: null, exeName: null, launchUrl: null,
    igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null,
    iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: [],
    releaseDate: null, criticScore: null, criticScoreCount: null, communityScore: null,
    communityScoreCount: null, trailerUrl: null, status: "unset", rating: null, totalPlayTimeS: 0,
    lastPlayedAt: null, playCount: 0, addedAt: daysAgo(1), isHidden: false, hltbMainH: null,
    hltbMainExtraH: null, hltbCompletionistH: null, hltbId: null, hltbFetchedAt: null, notes: null,
    progress: null, milestonesJson: null, completed: false, ...over,
  };
}

const freshLibrary = [
  game("Hades", { criticScore: 92.6, heroUrl: "hades.jpg", description: "Defy the god of the dead.", genres: ["Roguelike", "Action"], hltbMainH: 22, releaseDate: "2020-09-17" }),
  game("Celeste", { criticScore: 92, hltbMainH: 8, genres: ["Platformer"], source: "epic" }),
  game("Inside", { criticScore: 87, hltbMainH: 3.5, genres: ["Platformer"] }),
  game("Gris", { criticScore: 84, hltbMainH: 4, genres: ["Platformer"] }),
  game("Filler", { genres: ["Action"] }),
];

const menu = { onPlay: vi.fn(), onEdit: vi.fn(), onSearchMetadata: vi.fn(), onNewCollectionWithGame: vi.fn() };

function renderHome(overrides: Partial<React.ComponentProps<typeof HomePage>> = {}) {
  const props = { onPlay: vi.fn(), onStop: vi.fn(), onOpenRandom: vi.fn(), onResync: vi.fn(), onOpenSettings: vi.fn(), menu, ...overrides };
  render(
    <TooltipProvider>
      <HomePage {...props} />
    </TooltipProvider>,
  );
  return props;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue([]);
  useGameStore.setState({ games: freshLibrary, activeSession: null, lastSessionEndedAt: 0 });
  useUiStore.setState({ activeNav: "home", quickViewGameId: null, quickViewIds: [], sourceFilter: null, genreFilter: null });
  useSettingsStore.setState({
    hiddenGameIds: [],
    homeChecklistDismissed: false,
    customTheme: null,
    apiKeys: { steamGridDbKey: "", igdbClientId: "", igdbClientSecret: "" },
  });
  useQueueStore.setState({ entries: [] });
  useTwitchStore.setState({ isAuthenticated: false, liveStreams: [] });
});

describe("Home on a fresh launcher", () => {
  it("spotlights the best-rated game with what it is, not empty play stats", () => {
    renderHome();
    expect(screen.getByTestId("home-page")).toHaveAttribute("data-fresh", "true");
    expect(screen.getByTestId("spotlight-eyebrow")).toHaveTextContent("Start here · critics 93%");
    expect(screen.getByTestId("spotlight-blurb")).toHaveTextContent("Defy the god of the dead.");
    const spotlight = screen.getByTestId("home-spotlight");
    expect(spotlight).toHaveTextContent("Roguelike · Action");
    expect(spotlight).toHaveTextContent("22h to beat");
    expect(spotlight).toHaveTextContent("2020");
    expect(spotlight).toHaveTextContent("Top picks from your library");
  });

  it("walks through getting started, and stays hidden once dismissed", async () => {
    const props = renderHome();
    const card = screen.getByTestId("tile-get-started");
    expect(card).toHaveTextContent("0 of 5");
    fireEvent.click(within(screen.getByTestId("get-started-play")).getByRole("button", { name: "Pick for me" }));
    expect(props.onOpenRandom).toHaveBeenCalledOnce();
    fireEvent.click(within(screen.getByTestId("get-started-artwork")).getByRole("button", { name: "Add key" }));
    expect(props.onOpenSettings).toHaveBeenCalledWith("integrations");

    fireEvent.click(screen.getByRole("button", { name: "Hide the get started checklist" }));
    expect(screen.queryByTestId("tile-get-started")).not.toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("set_setting", { key: "home_checklist_dismissed", value: "true" });
  });

  it("ticks steps off as they happen", () => {
    useSettingsStore.setState({ apiKeys: { steamGridDbKey: "k", igdbClientId: "", igdbClientSecret: "" } });
    useTwitchStore.setState({ isAuthenticated: true });
    renderHome();
    expect(screen.getByTestId("get-started-artwork")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("get-started-twitch")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("tile-get-started")).toHaveTextContent("2 of 5");
  });

  it("shows the library's shape and browses by launcher or genre", () => {
    renderHome();
    const glance = screen.getByTestId("tile-library-glance");
    expect(glance).toHaveTextContent("5games from 2 launchers");
    fireEvent.click(within(glance).getByRole("button", { name: /Epic Games/ }));
    expect(useUiStore.getState()).toMatchObject({ activeNav: "library", sourceFilter: "epic" });
    act(() => useUiStore.setState({ activeNav: "home", sourceFilter: null }));
    fireEvent.click(within(screen.getByTestId("tile-library-glance")).getByRole("button", { name: /Platformer/ }));
    expect(useUiStore.getState()).toMatchObject({ activeNav: "library", genreFilter: "Platformer" });
  });

  it("offers shelves of things worth starting, and opens a poster in quick view", () => {
    renderHome();
    const critics = screen.getByTestId("shelf-critics");
    // Scores arrive as decimals; posters show whole numbers.
    expect(critics).toHaveTextContent("Critics 93%");
    expect(critics).not.toHaveTextContent("92.6");
    expect(within(critics).getAllByTestId(/^lib-card-/).map((el) => el.dataset.testid)).toEqual([
      "lib-card-Hades",
      "lib-card-Celeste",
      "lib-card-Inside",
      "lib-card-Gris",
    ]);
    const weekend = screen.getByTestId("shelf-weekend");
    expect(within(weekend).getAllByTestId(/^lib-card-/).map((el) => el.dataset.testid)).toEqual(["lib-card-Inside", "lib-card-Gris", "lib-card-Celeste"]);
    expect(weekend).toHaveTextContent("3.5h to beat");
    fireEvent.click(within(weekend).getByTestId("lib-card-Gris"));
    expect(useUiStore.getState()).toMatchObject({ quickViewGameId: "Gris", quickViewIds: ["Inside", "Gris", "Celeste"] });
  });

  it("switches to the regular dashboard once something has been played", () => {
    useGameStore.setState({ games: [...freshLibrary, game("Played", { lastPlayedAt: daysAgo(2), playCount: 12 })] });
    renderHome();
    expect(screen.getByTestId("home-page")).toHaveAttribute("data-fresh", "false");
    expect(screen.queryByTestId("tile-library-glance")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tile-get-started")).not.toBeInTheDocument();
    expect(screen.getByTestId("spotlight-eyebrow")).toHaveTextContent(/^Continue/);
  });
});

describe("Home before and without games", () => {
  it("shows a skeleton while the library loads, never the empty welcome", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    useGameStore.setState({ games: [], hasLoaded: false, error: null });
    renderHome();
    expect(screen.getByTestId("home-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("home-welcome")).not.toBeInTheDocument();
  });

  it("welcomes an empty library once it has loaded", () => {
    useGameStore.setState({ games: [], hasLoaded: true });
    const props = renderHome();
    expect(screen.getByTestId("home-welcome")).toHaveTextContent("Every game you own.");
    fireEvent.click(screen.getByTestId("welcome-sync"));
    expect(props.onResync).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("welcome-add-folder"));
    expect(props.onOpenSettings).toHaveBeenCalledWith("library");
  });
});

describe("home picks", () => {
  it("knows a fresh library", () => {
    expect(isFreshLibrary(freshLibrary)).toBe(true);
    expect(isFreshLibrary([...freshLibrary, game("x", { lastPlayedAt: daysAgo(1) })])).toBe(false);
    expect(isFreshLibrary([])).toBe(false);
  });

  it("weekend games skip finished, dropped and nearly-done ones", () => {
    const list = weekendGames([
      game("short", { hltbMainH: 5 }),
      game("done", { hltbMainH: 5, completed: true }),
      game("dropped", { hltbMainH: 5, status: "dropped" }),
      game("almost", { hltbMainH: 5, totalPlayTimeS: 4.5 * 3600 }),
      game("long", { hltbMainH: 30 }),
    ]);
    expect(list.map((g) => g.id)).toEqual(["short"]);
  });

  it("jump back in wants games set aside for three weeks", () => {
    const list = jumpBackIn(
      [
        game("recent", { lastPlayedAt: daysAgo(3), status: "playing" }),
        game("aside", { lastPlayedAt: daysAgo(40), status: "playing" }),
        game("finished", { lastPlayedAt: daysAgo(40), completed: true }),
      ],
      NOW,
    );
    expect(list.map((g) => g.id)).toEqual(["aside"]);
  });

  it("new in library is empty on a fresh install, where everything is new", () => {
    expect(newlyAdded(freshLibrary, NOW)).toEqual([]);
    const lived = [...freshLibrary, game("old", { lastPlayedAt: daysAgo(1), addedAt: daysAgo(200) })];
    expect(newlyAdded(lived, NOW)).toHaveLength(5);
  });

  it("counts launchers and genres", () => {
    const shape = libraryShape(freshLibrary);
    expect(shape.sources).toEqual([{ id: "steam", count: 4 }, { id: "epic", count: 1 }]);
    expect(shape.genres[0]).toEqual({ name: "Platformer", count: 3 });
  });
});
