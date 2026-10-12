import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { SearchCommand } from "@/components/Search/SearchCommand";
import { RandomPickerModal } from "@/components/RandomPicker/RandomPickerModal";
import { rarityOf } from "@/components/RandomPicker/packs";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSearch } from "@/hooks/useSearch";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useFilterStore } from "@/stores/filterStore";

const makeGame = (id: string, name: string, overrides: Partial<Game> = {}): Game => ({
  id, name, source: "steam", folderPath: null, exePath: null, exeName: null,
  launchUrl: null, igdbId: null, steamgridId: null, description: null,
  coverUrl: null, heroUrl: null, logoUrl: null, iconUrl: null,
  customCover: null, customHero: null, potentialExeNames: null,
  genres: ["RPG"], releaseDate: null,
  criticScore: null, criticScoreCount: null, communityScore: null, communityScoreCount: null, trailerUrl: null,
  status: "unset", rating: null,
  totalPlayTimeS: 3600, lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
  progress: null,
  milestonesJson: null,
  completed: false,
  ...overrides,
});

const games = [
  makeGame("g1", "Cyberpunk 2077", { genres: ["RPG", "Action"], status: "playing", rating: 4 }),
  makeGame("g2", "Elden Ring", { genres: ["Souls-like"], source: "epic", status: "completed" }),
  makeGame("g3", "Hades", { genres: ["Roguelike"], status: "backlog" }),
  makeGame("g4", "Stardew Valley", { genres: ["Simulation"], source: "gog" }),
];

describe("Story 11.1: useSearch hook", () => {
  beforeEach(() => {
    useGameStore.setState({ games });
    useCollectionStore.setState({
      collections: [{ id: "c1", name: "Favorites", icon: "⭐", color: null, sortOrder: 0, isSmart: false, rulesJson: null, gameIds: [] }],
    });
  });

  it("returns empty results for empty query", () => {
    const { result } = renderHook(() => useSearch(""));
    expect(result.current.results).toHaveLength(0);
  });

  it("finds games by name (fuzzy)", () => {
    const { result } = renderHook(() => useSearch("cyber"));
    expect(result.current.gameResults.length).toBeGreaterThan(0);
    expect(result.current.gameResults[0].name).toBe("Cyberpunk 2077");
  });

  it("finds collections by name", () => {
    const { result } = renderHook(() => useSearch("fav"));
    expect(result.current.collectionResults.length).toBeGreaterThan(0);
  });

  it("finds actions by name", () => {
    const { result } = renderHook(() => useSearch("settings"));
    expect(result.current.actionResults.length).toBeGreaterThan(0);
    expect(result.current.actionResults[0].id).toBe("action-settings");
  });

  it("groups results by type", () => {
    const { result } = renderHook(() => useSearch("a"));
    expect(result.current.results.length).toBeGreaterThan(0);
  });
});

describe("Story 11.1: SearchCommand component", () => {
  beforeEach(() => {
    useGameStore.setState({ games });
  });

  it("renders nothing when closed", () => {
    render(<SearchCommand open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("search-command")).not.toBeInTheDocument();
  });

  it("renders search overlay when open", () => {
    render(<SearchCommand open onClose={() => {}} />);
    expect(screen.getByTestId("search-command")).toBeInTheDocument();
    expect(screen.getByTestId("search-input")).toBeInTheDocument();
  });

  it("shows results as user types", () => {
    render(<SearchCommand open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "cyber" } });
    expect(screen.getByTestId("search-results")).toBeInTheDocument();
    expect(screen.getByTestId("search-group-games")).toBeInTheDocument();
  });

  it("shows empty state for no results", () => {
    render(<SearchCommand open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "xyznonexistent" } });
    expect(screen.getByTestId("search-empty")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<SearchCommand open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has clear button when query exists", () => {
    render(<SearchCommand open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "test" } });
    expect(screen.getByTestId("search-clear")).toBeInTheDocument();
  });
});

describe("Random picker: open a pack", () => {
  beforeEach(() => {
    useGameStore.setState({ games });
    useSettingsStore.setState({ hiddenGameIds: [], enableAnimations: true, reducedMotion: false });
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<RandomPickerModal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("random-picker-modal")).not.toBeInTheDocument();
  });

  it("offers packs with their counts, leaving out archived and dropped games", () => {
    useGameStore.setState({
      games: [...games, makeGame("g5", "Archived", { status: "removed" }), makeGame("g6", "Dropped", { status: "dropped" }), makeGame("g7", "Short", { hltbMainH: 6 })],
    });
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("picker-pack-all")).toHaveTextContent("5 games");
    expect(screen.getByTestId("picker-pack-backlog")).toHaveTextContent("1 game");
    expect(screen.getByTestId("picker-pack-quick")).toHaveTextContent("1 game");
  });

  it("disables packs with nothing in them", () => {
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("picker-pack-quick")).toBeDisabled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<RandomPickerModal open onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("random-picker-modal"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("rips the pack open and reveals the pull", () => {
    vi.useFakeTimers();
    const onPlay = vi.fn();
    const onViewDetails = vi.fn();
    render(<RandomPickerModal open onClose={() => {}} onPlay={onPlay} onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByTestId("picker-open"));
    expect(screen.queryByTestId("picker-result")).not.toBeInTheDocument();
    // tear, rise, flip: each step is scheduled after the previous one renders
    for (const ms of [420, 560, 700]) act(() => vi.advanceTimersByTime(ms));
    expect(screen.getByTestId("picker-result")).toHaveTextContent("Cyberpunk 2077");
    fireEvent.click(screen.getByTestId("picker-play"));
    expect(onPlay).toHaveBeenCalledWith(games[0]);
    fireEvent.click(screen.getByTestId("picker-details"));
    expect(onViewDetails).toHaveBeenCalledWith(games[0]);
  });

  it("skips straight to the card on click", () => {
    vi.useFakeTimers();
    render(<RandomPickerModal open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("picker-pack"));
    fireEvent.click(screen.getByTestId("picker-skip"));
    expect(screen.getByTestId("picker-result")).toBeInTheDocument();
  });

  it("reveals at once when animations are off", () => {
    useSettingsStore.setState({ enableAnimations: false });
    render(<RandomPickerModal open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("picker-open"));
    expect(screen.getByTestId("picker-result")).toBeInTheDocument();
  });

  it("never pulls the same game twice in a session", () => {
    useSettingsStore.setState({ enableAnimations: false });
    render(<RandomPickerModal open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("picker-pack-backlog"));
    fireEvent.click(screen.getByTestId("picker-open"));
    expect(screen.getByTestId("picker-result")).toHaveTextContent("Hades");
    expect(screen.getByTestId("picker-another")).toBeDisabled();
  });

  it("frames the card by critic score", () => {
    expect(rarityOf(makeGame("a", "a", { criticScore: 94.2 }))).toBe("legendary");
    expect(rarityOf(makeGame("b", "b", { criticScore: 81 }))).toBe("epic");
    expect(rarityOf(makeGame("c", "c", { criticScore: 70 }))).toBe("rare");
    expect(rarityOf(makeGame("d", "d"))).toBe("common");
  });

  it("explains an empty library", () => {
    useGameStore.setState({ games: [] });
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("picker-empty")).toBeInTheDocument();
  });
});

describe("filterStore", () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
  });

  it("toggleTag adds and removes", () => {
    useFilterStore.getState().toggleTag("t1");
    expect(useFilterStore.getState().tags).toEqual(["t1"]);
    useFilterStore.getState().toggleTag("t1");
    expect(useFilterStore.getState().tags).toEqual([]);
  });

  it("clearAll resets tags and critic score range", () => {
    useFilterStore.getState().toggleTag("t1");
    useFilterStore.getState().setCriticScoreRange(70, 90);
    useFilterStore.getState().clearAll();
    const s = useFilterStore.getState();
    expect(s.tags).toHaveLength(0);
    expect(s.minCriticScore).toBe(0);
    expect(s.maxCriticScore).toBe(100);
  });
});
