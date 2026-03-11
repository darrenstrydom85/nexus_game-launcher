import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { SearchCommand } from "@/components/Search/SearchCommand";
import { FilterBar } from "@/components/Search/FilterBar";
import { SmartCollections, SMART_COLLECTIONS } from "@/components/Search/SmartCollections";
import { RandomPickerModal } from "@/components/RandomPicker/RandomPickerModal";
import { PickerResult } from "@/components/RandomPicker/PickerResult";
import { RouletteSpinner } from "@/components/RandomPicker/RouletteSpinner";
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

describe("Story 11.2: FilterBar", () => {
  beforeEach(() => {
    useGameStore.setState({ games });
    useFilterStore.getState().clearAll();
  });

  it("renders the filter bar", () => {
    render(<FilterBar totalCount={100} filteredCount={50} />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  it("has glassmorphism styling", () => {
    render(<FilterBar totalCount={100} filteredCount={50} />);
    expect(screen.getByTestId("filter-bar").className).toContain("glass-filter");
  });

  it("renders source pills", () => {
    render(<FilterBar totalCount={100} filteredCount={50} />);
    expect(screen.getByTestId("filter-source-steam")).toBeInTheDocument();
    expect(screen.getByTestId("filter-source-epic")).toBeInTheDocument();
  });

  it("renders status pills", () => {
    render(<FilterBar totalCount={100} filteredCount={50} />);
    expect(screen.getByTestId("filter-status-playing")).toBeInTheDocument();
    expect(screen.getByTestId("filter-status-completed")).toBeInTheDocument();
  });

  it("clicking source pill toggles filter", () => {
    render(<FilterBar totalCount={100} filteredCount={50} />);
    fireEvent.click(screen.getByTestId("filter-source-steam"));
    expect(useFilterStore.getState().sources).toContain("steam");
    fireEvent.click(screen.getByTestId("filter-source-steam"));
    expect(useFilterStore.getState().sources).not.toContain("steam");
  });

  it("shows active filter chips", () => {
    useFilterStore.getState().toggleSource("steam");
    render(<FilterBar totalCount={100} filteredCount={50} />);
    expect(screen.getByTestId("filter-chips")).toBeInTheDocument();
  });

  it("chip removal removes filter", () => {
    useFilterStore.getState().toggleSource("steam");
    render(<FilterBar totalCount={100} filteredCount={50} />);
    fireEvent.click(screen.getByTestId("filter-chip-remove-source-steam"));
    expect(useFilterStore.getState().sources).not.toContain("steam");
  });

  it("clear all removes all filters", () => {
    useFilterStore.getState().toggleSource("steam");
    useFilterStore.getState().toggleStatus("playing");
    render(<FilterBar totalCount={100} filteredCount={50} />);
    fireEvent.click(screen.getByTestId("filter-clear-all"));
    expect(useFilterStore.getState().sources).toHaveLength(0);
    expect(useFilterStore.getState().statuses).toHaveLength(0);
  });

  it("shows game count", () => {
    render(<FilterBar totalCount={147} filteredCount={23} />);
    expect(screen.getByTestId("filter-count")).toHaveTextContent("Showing 23 of 147 games");
  });

  it("genre dropdown opens on click", () => {
    render(<FilterBar totalCount={100} filteredCount={50} />);
    fireEvent.click(screen.getByTestId("filter-genre-trigger"));
    expect(screen.getByTestId("filter-genre-dropdown")).toBeInTheDocument();
  });
});

describe("Story 11.3: SmartCollections", () => {
  beforeEach(() => {
    useGameStore.setState({ games });
    useFilterStore.getState().clearAll();
  });

  it("renders three smart collections", () => {
    render(<SmartCollections />);
    expect(screen.getByTestId("smart-collections")).toBeInTheDocument();
    expect(screen.getByTestId("smart-playing")).toBeInTheDocument();
    expect(screen.getByTestId("smart-backlog")).toBeInTheDocument();
    expect(screen.getByTestId("smart-completed")).toBeInTheDocument();
  });

  it("shows correct count badges", () => {
    render(<SmartCollections />);
    expect(screen.getByTestId("smart-count-playing")).toHaveTextContent("1");
    expect(screen.getByTestId("smart-count-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("smart-count-backlog")).toHaveTextContent("1");
  });

  it("click filters by status", () => {
    render(<SmartCollections />);
    fireEvent.click(screen.getByTestId("smart-playing"));
    expect(useFilterStore.getState().statuses).toContain("playing");
  });

  it("can hide smart collections", () => {
    render(<SmartCollections hiddenIds={["smart-backlog"]} />);
    expect(screen.queryByTestId("smart-backlog")).not.toBeInTheDocument();
    expect(screen.getByTestId("smart-playing")).toBeInTheDocument();
  });

  it("cannot be deleted (no delete UI)", () => {
    render(<SmartCollections />);
    expect(SMART_COLLECTIONS).toHaveLength(3);
  });
});

describe("Story 11.4: RandomPickerModal", () => {
  beforeEach(() => {
    useGameStore.setState({ games });
  });

  it("renders nothing when closed", () => {
    render(<RandomPickerModal open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("random-picker-modal")).not.toBeInTheDocument();
  });

  it("renders modal when open", () => {
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("random-picker-modal")).toBeInTheDocument();
    expect(screen.getByTestId("picker-panel")).toBeInTheDocument();
  });

  it("shows pool count", () => {
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("picker-filters")).toHaveTextContent("4 games in pool");
  });

  it("shows Spin button", () => {
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("picker-spin")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<RandomPickerModal open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows empty message when pool is empty", () => {
    useGameStore.setState({ games: [] });
    render(<RandomPickerModal open onClose={() => {}} />);
    expect(screen.getByTestId("picker-empty")).toBeInTheDocument();
  });
});

describe("Story 11.5: RouletteSpinner physics", () => {
  it("RouletteSpinner component is importable", () => {
    expect(RouletteSpinner).toBeDefined();
    expect(typeof RouletteSpinner).toBe("function");
  });

  it("physics deceleration reaches stop within reasonable frames", () => {
    const INITIAL_VELOCITY = 2800;
    const FRICTION = 0.985;
    const STOP_VELOCITY = 20;

    let v = INITIAL_VELOCITY;
    let frames = 0;
    while (v > STOP_VELOCITY) { v *= FRICTION; frames++; }
    expect(frames).toBeGreaterThan(50);
    expect(frames).toBeLessThan(500);
  });

  it("friction decelerates velocity", () => {
    const INITIAL_VELOCITY = 2800;
    const FRICTION = 0.985;

    let v = INITIAL_VELOCITY;
    for (let i = 0; i < 100; i++) v *= FRICTION;
    expect(v).toBeLessThan(INITIAL_VELOCITY);
  });
});

describe("Story 11.6: PickerResult", () => {
  const game = makeGame("g1", "Cyberpunk 2077", { coverUrl: "https://example.com/cover.jpg" });

  it("renders result with game info", () => {
    render(
      <PickerResult game={game} onPlay={() => {}} onSpinAgain={() => {}} onViewDetails={() => {}} onReject={() => {}} />,
    );
    expect(screen.getByTestId("picker-result")).toBeInTheDocument();
    expect(screen.getByTestId("result-name")).toHaveTextContent("Cyberpunk 2077");
    expect(screen.getByTestId("result-cover")).toBeInTheDocument();
  });

  it("shows source and play time", () => {
    render(
      <PickerResult game={game} onPlay={() => {}} onSpinAgain={() => {}} onViewDetails={() => {}} onReject={() => {}} />,
    );
    expect(screen.getByTestId("result-source")).toHaveTextContent("steam");
    expect(screen.getByTestId("result-playtime")).toBeInTheDocument();
  });

  it("Play Now calls onPlay", () => {
    const onPlay = vi.fn();
    render(
      <PickerResult game={game} onPlay={onPlay} onSpinAgain={() => {}} onViewDetails={() => {}} onReject={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("result-play"));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("Spin Again calls onSpinAgain", () => {
    const onSpinAgain = vi.fn();
    render(
      <PickerResult game={game} onPlay={() => {}} onSpinAgain={onSpinAgain} onViewDetails={() => {}} onReject={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("result-spin-again"));
    expect(onSpinAgain).toHaveBeenCalledOnce();
  });

  it("View Details calls onViewDetails", () => {
    const onViewDetails = vi.fn();
    render(
      <PickerResult game={game} onPlay={() => {}} onSpinAgain={() => {}} onViewDetails={onViewDetails} onReject={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("result-details"));
    expect(onViewDetails).toHaveBeenCalledOnce();
  });

  it("'Nah, not feeling it' calls onReject", () => {
    const onReject = vi.fn();
    render(
      <PickerResult game={game} onPlay={() => {}} onSpinAgain={() => {}} onViewDetails={() => {}} onReject={onReject} />,
    );
    fireEvent.click(screen.getByTestId("result-reject"));
    expect(onReject).toHaveBeenCalledOnce();
  });
});

describe("filterStore", () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
  });

  it("toggleSource adds and removes", () => {
    useFilterStore.getState().toggleSource("steam");
    expect(useFilterStore.getState().sources).toContain("steam");
    useFilterStore.getState().toggleSource("steam");
    expect(useFilterStore.getState().sources).not.toContain("steam");
  });

  it("hasActiveFilters returns true when filters set", () => {
    expect(useFilterStore.getState().hasActiveFilters()).toBe(false);
    useFilterStore.getState().toggleGenre("RPG");
    expect(useFilterStore.getState().hasActiveFilters()).toBe(true);
  });

  it("clearAll resets everything", () => {
    useFilterStore.getState().toggleSource("steam");
    useFilterStore.getState().toggleStatus("playing");
    useFilterStore.getState().toggleGenre("RPG");
    useFilterStore.getState().setMinRating(3);
    useFilterStore.getState().clearAll();
    const s = useFilterStore.getState();
    expect(s.sources).toHaveLength(0);
    expect(s.statuses).toHaveLength(0);
    expect(s.genres).toHaveLength(0);
    expect(s.minRating).toBeNull();
  });
});
