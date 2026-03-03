import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameGrid, sortGames } from "@/components/Library/GameGrid";
import { useUiStore } from "@/stores/uiStore";
import type { Game } from "@/stores/gameStore";

const makeGame = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  name: "Alpha Game",
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  ...overrides,
});

const games: Game[] = [
  makeGame({ id: "g1", name: "Alpha Game", totalPlayTimeS: 100, criticScore: 60 }),
  makeGame({ id: "g2", name: "Beta Game", totalPlayTimeS: 500, criticScore: 90 }),
  makeGame({ id: "g3", name: "Charlie Game", totalPlayTimeS: 200, criticScore: 30 }),
];

const renderCard = (game: Game) => (
  <div data-testid={`card-${game.id}`}>{game.name}</div>
);

describe("Story 6.2: Game Grid Layout & Sorting", () => {
  beforeEach(() => {
    useUiStore.setState({
      viewMode: "grid",
      sortField: "name",
      sortDirection: "asc",
    });
  });

  it("renders the game grid", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("game-grid")).toBeInTheDocument();
  });

  it("renders CSS Grid with auto-fill 180px columns", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    const grid = screen.getByTestId("game-grid-cards");
    expect(grid.className).toContain("grid");
  });

  it("renders all game cards", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("card-g1")).toBeInTheDocument();
    expect(screen.getByTestId("card-g2")).toBeInTheDocument();
    expect(screen.getByTestId("card-g3")).toBeInTheDocument();
  });

  it("shows heading in toolbar", () => {
    render(
      <GameGrid games={games} totalCount={10} renderCard={renderCard} heading="All Games" />,
    );
    expect(screen.getByTestId("library-heading")).toHaveTextContent("All Games");
  });

  it("renders sort dropdown with current sort label", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("sort-dropdown-trigger")).toHaveTextContent(
      "Name",
    );
  });

  it("opens sort dropdown and shows all options", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    fireEvent.click(screen.getByTestId("sort-dropdown-trigger"));
    expect(screen.getByTestId("sort-dropdown-menu")).toBeInTheDocument();
    expect(screen.getByTestId("sort-option-name")).toBeInTheDocument();
    expect(screen.getByTestId("sort-option-lastPlayed")).toBeInTheDocument();
    expect(screen.getByTestId("sort-option-totalPlayTime")).toBeInTheDocument();
    expect(screen.getByTestId("sort-option-addedAt")).toBeInTheDocument();
    expect(screen.getByTestId("sort-option-rating")).toBeInTheDocument();
    expect(screen.getByTestId("sort-option-releaseDate")).toBeInTheDocument();
  });

  it("changes sort field when option is selected", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    fireEvent.click(screen.getByTestId("sort-dropdown-trigger"));
    fireEvent.click(screen.getByTestId("sort-option-rating"));
    expect(useUiStore.getState().sortField).toBe("rating");
  });

  it("renders view mode toggle with grid and list buttons", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("view-mode-grid")).toBeInTheDocument();
    expect(screen.getByTestId("view-mode-list")).toBeInTheDocument();
  });

  it("grid button is active by default", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("view-mode-grid")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches to list view when list button is clicked", () => {
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    fireEvent.click(screen.getByTestId("view-mode-list"));
    expect(useUiStore.getState().viewMode).toBe("list");
  });

  it("renders list view with rows", () => {
    useUiStore.setState({ viewMode: "list" });
    render(
      <GameGrid games={games} totalCount={3} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("game-list-rows")).toBeInTheDocument();
    expect(screen.getByTestId("game-list-row-g1")).toBeInTheDocument();
  });

  it("shows empty state with 'No games yet' when no games", () => {
    render(
      <GameGrid games={[]} totalCount={0} renderCard={renderCard} />,
    );
    expect(screen.getByTestId("game-grid-empty")).toBeInTheDocument();
    expect(screen.getByText("No games yet")).toBeInTheDocument();
  });

  it("empty state has Settings link", () => {
    const onSettingsClick = vi.fn();
    render(
      <GameGrid
        games={[]}
        totalCount={0}
        renderCard={renderCard}
        onSettingsClick={onSettingsClick}
      />,
    );
    fireEvent.click(screen.getByTestId("empty-settings-link"));
    expect(onSettingsClick).toHaveBeenCalledOnce();
  });

  it("shows filter empty state with 'No games match'", () => {
    render(
      <GameGrid
        games={[]}
        totalCount={5}
        isFiltered
        renderCard={renderCard}
      />,
    );
    expect(screen.getByTestId("game-grid-filter-empty")).toBeInTheDocument();
    expect(screen.getByText("No games match")).toBeInTheDocument();
  });

  it("filter empty state has Clear filters button", () => {
    const onClearFilters = vi.fn();
    render(
      <GameGrid
        games={[]}
        totalCount={5}
        isFiltered
        renderCard={renderCard}
        onClearFilters={onClearFilters}
      />,
    );
    fireEvent.click(screen.getByTestId("clear-filters-button"));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });
});

describe("sortGames", () => {
  it("sorts by name ascending", () => {
    const sorted = sortGames(games, "name", "asc");
    expect(sorted.map((g) => g.name)).toEqual([
      "Alpha Game",
      "Beta Game",
      "Charlie Game",
    ]);
  });

  it("sorts by totalPlayTime descending", () => {
    const sorted = sortGames(games, "totalPlayTime", "desc");
    expect(sorted[0].name).toBe("Beta Game");
  });

  it("sorts by rating descending", () => {
    const sorted = sortGames(games, "rating", "desc");
    expect(sorted[0].name).toBe("Beta Game");
    expect(sorted[2].name).toBe("Charlie Game");
  });
});
