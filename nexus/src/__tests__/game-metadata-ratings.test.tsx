import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailContent } from "@/components/GameDetail/DetailContent";
import type { Game } from "@/stores/gameStore";

const baseGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: 100,
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
  hltbMainS: null,
  hltbMainPlusS: null,
  hltbCompletionistS: null,
  hltbGameId: null,
  status: "backlog",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01T00:00:00Z",
};

describe("GameMetadata ratings section", () => {
  it("hides ratings section when no scores present", () => {
    render(<DetailContent game={baseGame} />);
    expect(screen.queryByTestId("ratings-section")).toBeNull();
  });

  it("hides ratings section when scores are null", () => {
    const game = { ...baseGame, criticScore: null, communityScore: null };
    render(<DetailContent game={game} />);
    expect(screen.queryByTestId("ratings-section")).toBeNull();
  });

  it("shows ratings section when critic score is present", () => {
    const game = { ...baseGame, criticScore: 87.5, criticScoreCount: 42 };
    render(<DetailContent game={game} />);
    expect(screen.getByTestId("ratings-section")).toBeTruthy();
  });

  it("shows ratings section when community score is present", () => {
    const game = { ...baseGame, communityScore: 74.2, communityScoreCount: 1500 };
    render(<DetailContent game={game} />);
    expect(screen.getByTestId("ratings-section")).toBeTruthy();
  });

  it("shows both badges when both scores are present", () => {
    const game = {
      ...baseGame,
      criticScore: 87.5,
      criticScoreCount: 42,
      communityScore: 74.2,
      communityScoreCount: 1500,
    };
    render(<DetailContent game={game} />);
    const badges = screen.getAllByTestId("score-badge-sm");
    expect(badges).toHaveLength(2);
  });

  it("shows only critic badge when community score is absent", () => {
    const game = { ...baseGame, criticScore: 87.5, criticScoreCount: 42 };
    render(<DetailContent game={game} />);
    const badges = screen.getAllByTestId("score-badge-sm");
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute("aria-label")).toContain("Critic score");
  });

  it("shows only community badge when critic score is absent", () => {
    const game = { ...baseGame, communityScore: 65.0, communityScoreCount: 800 };
    render(<DetailContent game={game} />);
    const badges = screen.getAllByTestId("score-badge-sm");
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute("aria-label")).toContain("Community score");
  });

  it("does not show ratings section when score is 0", () => {
    const game = { ...baseGame, criticScore: 0, communityScore: 0 };
    render(<DetailContent game={game} />);
    expect(screen.queryByTestId("ratings-section")).toBeNull();
  });
});
