import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameCard } from "@/components/GameCard/GameCard";
import type { Game } from "@/stores/gameStore";

vi.mock("@/stores/uiStore", () => ({
  useUiStore: (selector: (s: { setDetailOverlayGameId: () => void }) => unknown) =>
    selector({ setDetailOverlayGameId: vi.fn() }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (url: string) => url,
  invoke: vi.fn(),
}));

const baseGame: Game = {
  id: "g1",
  name: "Test Game",
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
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "backlog",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01T00:00:00Z",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
};

describe("GameCard score badge", () => {
  it("does not render score badge when critic score is null", () => {
    render(<GameCard game={baseGame} />);
    expect(screen.queryByTestId("score-badge-card-g1")).toBeNull();
  });

  it("does not render score badge when critic score is 0", () => {
    const game = { ...baseGame, criticScore: 0 };
    render(<GameCard game={game} />);
    expect(screen.queryByTestId("score-badge-card-g1")).toBeNull();
  });

  it("renders score badge container when critic score is present", () => {
    const game = { ...baseGame, criticScore: 87.5 };
    render(<GameCard game={game} />);
    expect(screen.getByTestId("score-badge-card-g1")).toBeTruthy();
  });

  it("score badge is hidden (opacity-0) before hover", () => {
    const game = { ...baseGame, criticScore: 87.5 };
    render(<GameCard game={game} />);
    const container = screen.getByTestId("score-badge-card-g1");
    expect(container.className).toContain("opacity-0");
  });

  it("score badge becomes visible (opacity-100) on hover", () => {
    const game = { ...baseGame, criticScore: 87.5 };
    render(<GameCard game={game} />);
    const card = screen.getByTestId("game-card-g1");
    fireEvent.mouseEnter(card);
    const container = screen.getByTestId("score-badge-card-g1");
    expect(container.className).toContain("opacity-100");
  });

  it("score badge hides again after mouse leave", () => {
    const game = { ...baseGame, criticScore: 87.5 };
    render(<GameCard game={game} />);
    const card = screen.getByTestId("game-card-g1");
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    const container = screen.getByTestId("score-badge-card-g1");
    expect(container.className).toContain("opacity-0");
  });

  it("renders sm-size score badge inside the card", () => {
    const game = { ...baseGame, criticScore: 75 };
    render(<GameCard game={game} />);
    expect(screen.getByTestId("score-badge-sm")).toBeTruthy();
  });
});
