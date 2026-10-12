import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));

import { RatingsColumn, comparison, libraryRank, verdict } from "@/modern/game/RatingsColumn";
import { useGameStore, type Game } from "@/stores/gameStore";

function game(id: string, over: Partial<Game> = {}): Game {
  return {
    id, name: id, source: "steam", folderPath: null, exePath: null, exeName: null, launchUrl: null,
    igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null,
    iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: [],
    releaseDate: "2015-03-11", criticScore: null, criticScoreCount: null, communityScore: null,
    communityScoreCount: null, trailerUrl: null, status: "unset", rating: null, totalPlayTimeS: 0,
    lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false, hltbMainH: null,
    hltbMainExtraH: null, hltbCompletionistH: null, hltbId: null, hltbFetchedAt: null, notes: null,
    progress: null, milestonesJson: null, completed: false, ...over,
  };
}

describe("ratings helpers", () => {
  it("names score bands", () => {
    expect(verdict(93)).toBe("Outstanding");
    expect(verdict(84)).toBe("Great");
    expect(verdict(72)).toBe("Good");
    expect(verdict(55)).toBe("Mixed");
    expect(verdict(30)).toBe("Poor");
  });

  it("compares your stars with a 0-100 score", () => {
    expect(comparison(4, 82, "critics")).toBe("You agree with the critics.");
    expect(comparison(5, 70, "critics")).toBe("You rate it higher than the critics.");
    expect(comparison(2, 88, "critics")).toBe("You rate it lower than the critics.");
    expect(comparison(null, 88, "critics")).toBeNull();
    expect(comparison(4, null, "critics")).toBeNull();
  });

  it("ranks a game's critic score within the library", () => {
    const lib = [90, 85, 80, 70, 60, 50, 40, 30].map((s, i) => game(`g${i}`, { criticScore: s }));
    expect(libraryRank(lib, lib[0])).toBe("Top 13% of your library by critic score.");
    expect(libraryRank(lib, lib[5])).toBe("#6 of 8 in your library by critic score.");
    expect(libraryRank(lib.slice(0, 3), lib[0])).toBeNull(); // too few scored games
    expect(libraryRank(lib, game("x"))).toBeNull();
  });
});

describe("RatingsColumn", () => {
  beforeEach(() => {
    useGameStore.setState({ games: [] });
  });

  it("shows both scores, your rating line and the key dates", () => {
    const g = game("Ori", { criticScore: 88, criticScoreCount: 50, communityScore: null, rating: 3 });
    useGameStore.setState({ games: [g] });
    render(<RatingsColumn game={g} />);
    expect(screen.getByLabelText("Critic score 88 out of 100, Great")).toBeInTheDocument();
    expect(screen.getByLabelText("No community score yet")).toBeInTheDocument();
    expect(screen.getByText("Great · 50 reviews")).toBeInTheDocument();
    expect(screen.getByTestId("game-ratings-compare")).toHaveTextContent("You rate it lower than the critics.");
    expect(screen.getByTestId("game-dates")).toHaveTextContent("Released");
    expect(screen.getByTestId("game-dates")).toHaveTextContent("Added to library");
    expect(screen.getByTestId("game-dates")).toHaveTextContent("Never");
  });

  it("invites a rating when there is none", () => {
    const g = game("Ori");
    render(<RatingsColumn game={g} />);
    expect(screen.getByText("How did it land for you?")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Your rating" })).toBeInTheDocument();
  });
});
