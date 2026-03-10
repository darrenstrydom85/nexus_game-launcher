import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

import { LibraryView } from "@/components/Library/LibraryView";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { SkeletonCard } from "@/components/Library/SkeletonCard";
import { useGames } from "@/hooks/useGames";

const makeGame = (id: string, name: string): Game => ({
  id,
  name,
  source: "steam",
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
  genres: ["RPG"],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: "2026-01-01T00:00:00Z",
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
});

describe("Story 6.5: Library View Composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({
      games: [],
      isLoading: false,
      error: null,
    });
    useUiStore.setState({ searchQuery: "" });
  });

  it("renders the library view", async () => {
    const games = [makeGame("g1", "Game 1")];
    mockInvoke.mockResolvedValue(games);
    await act(async () => {
      render(<LibraryView />);
    });
    expect(screen.getByTestId("library-view")).toBeInTheDocument();
  });

  it("shows skeleton cards during loading", () => {
    useGameStore.setState({ isLoading: true });
    render(<LibraryView />);
    expect(screen.getByTestId("library-skeleton")).toBeInTheDocument();
    const skeletons = screen.getAllByTestId("skeleton-card");
    expect(skeletons.length).toBe(12);
  });

  it("shows error state", () => {
    useGameStore.setState({ error: "Connection failed" });
    render(<LibraryView />);
    expect(screen.getByTestId("library-error")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("composes GameGrid when loaded", async () => {
    const games = [makeGame("g1", "Game 1"), makeGame("g2", "Game 2")];
    useGameStore.setState({ games, isLoading: false });
    mockInvoke.mockResolvedValue(games);
    render(<LibraryView />);
    expect(screen.getByTestId("game-grid")).toBeInTheDocument();
  });

  it("filters games by search query", () => {
    const games = [
      makeGame("g1", "Cyberpunk 2077"),
      makeGame("g2", "Elden Ring"),
    ];
    useGameStore.setState({ games, isLoading: false });
    useUiStore.setState({ searchQuery: "cyber" });
    render(<LibraryView />);
    expect(screen.getByTestId("library-heading")).toHaveTextContent(
      'Results for "cyber"',
    );
  });
});

describe("SkeletonCard", () => {
  it("renders with animate-pulse class", () => {
    render(<SkeletonCard />);
    const skeleton = screen.getByTestId("skeleton-card");
    expect(skeleton.className).toContain("animate-pulse");
  });

  it("has 2:3 aspect ratio", () => {
    render(<SkeletonCard />);
    const skeleton = screen.getByTestId("skeleton-card");
    expect(skeleton.style.aspectRatio).toBe("2 / 3");
  });
});

describe("useGames hook", () => {
  it("is exported from hooks/useGames.ts", () => {
    expect(typeof useGames).toBe("function");
  });
});
