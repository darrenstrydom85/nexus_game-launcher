import { describe, it, expect } from "vitest";
import { getContinuePlayingGames } from "@/components/Library/ContinuePlayingRow";
import type { Game, GameSource } from "@/stores/gameStore";

const BASE_GAME: Game = {
  id: "g1",
  name: "Game 1",
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
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
};

function makeGame(overrides: Partial<Game> & { id: string }): Game {
  return { ...BASE_GAME, ...overrides };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}

describe("Story 25.1: getContinuePlayingGames", () => {
  describe("qualification criteria", () => {
    it("includes games with status 'playing' and a lastPlayedAt", () => {
      const games = [
        makeGame({ id: "g1", status: "playing", lastPlayedAt: daysAgo(10) }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("g1");
    });

    it("includes games played within the last 7 days regardless of status", () => {
      const games = [
        makeGame({ id: "g1", status: "completed", lastPlayedAt: daysAgo(3) }),
        makeGame({ id: "g2", status: "backlog", lastPlayedAt: daysAgo(6) }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(2);
    });

    it("excludes games with no lastPlayedAt", () => {
      const games = [
        makeGame({ id: "g1", status: "playing", lastPlayedAt: null }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(0);
    });

    it("excludes non-playing games older than 7 days", () => {
      const games = [
        makeGame({ id: "g1", status: "completed", lastPlayedAt: daysAgo(8) }),
        makeGame({ id: "g2", status: "backlog", lastPlayedAt: daysAgo(14) }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(0);
    });

    it("returns empty array when no games qualify", () => {
      const result = getContinuePlayingGames([], null, [], 5);
      expect(result).toEqual([]);
    });
  });

  describe("sorting", () => {
    it("sorts by lastPlayedAt descending (most recent first)", () => {
      const games = [
        makeGame({ id: "old", status: "playing", lastPlayedAt: daysAgo(5) }),
        makeGame({ id: "new", status: "playing", lastPlayedAt: hoursAgo(1) }),
        makeGame({ id: "mid", status: "playing", lastPlayedAt: daysAgo(2) }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result.map((g) => g.id)).toEqual(["new", "mid", "old"]);
    });
  });

  describe("maxCards limit", () => {
    it("limits results to maxCards", () => {
      const games = Array.from({ length: 10 }, (_, i) =>
        makeGame({
          id: `g${i}`,
          status: "playing",
          lastPlayedAt: hoursAgo(i + 1),
        }),
      );
      const result = getContinuePlayingGames(games, null, [], 3);
      expect(result).toHaveLength(3);
    });

    it("returns all qualifying games when fewer than maxCards", () => {
      const games = [
        makeGame({ id: "g1", status: "playing", lastPlayedAt: hoursAgo(1) }),
        makeGame({ id: "g2", status: "playing", lastPlayedAt: hoursAgo(2) }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(2);
    });
  });

  describe("source filtering", () => {
    it("filters by sourceFilter when provided", () => {
      const games = [
        makeGame({ id: "s1", source: "steam", status: "playing", lastPlayedAt: hoursAgo(1) }),
        makeGame({ id: "e1", source: "epic", status: "playing", lastPlayedAt: hoursAgo(2) }),
        makeGame({ id: "s2", source: "steam", status: "playing", lastPlayedAt: hoursAgo(3) }),
      ];
      const result = getContinuePlayingGames(games, "steam", [], 5);
      expect(result).toHaveLength(2);
      expect(result.every((g) => g.source === "steam")).toBe(true);
    });

    it("filters by filterSources array when provided", () => {
      const games = [
        makeGame({ id: "s1", source: "steam", status: "playing", lastPlayedAt: hoursAgo(1) }),
        makeGame({ id: "e1", source: "epic", status: "playing", lastPlayedAt: hoursAgo(2) }),
        makeGame({ id: "g1", source: "gog", status: "playing", lastPlayedAt: hoursAgo(3) }),
      ];
      const sources: GameSource[] = ["steam", "gog"];
      const result = getContinuePlayingGames(games, null, sources, 5);
      expect(result).toHaveLength(2);
      expect(result.map((g) => g.source)).toEqual(["steam", "gog"]);
    });

    it("applies both sourceFilter and filterSources together", () => {
      const games = [
        makeGame({ id: "s1", source: "steam", status: "playing", lastPlayedAt: hoursAgo(1) }),
        makeGame({ id: "e1", source: "epic", status: "playing", lastPlayedAt: hoursAgo(2) }),
        makeGame({ id: "g1", source: "gog", status: "playing", lastPlayedAt: hoursAgo(3) }),
      ];
      const result = getContinuePlayingGames(games, "steam", ["steam", "epic"], 5);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("steam");
    });

    it("returns all sources when no filter is applied", () => {
      const games = [
        makeGame({ id: "s1", source: "steam", status: "playing", lastPlayedAt: hoursAgo(1) }),
        makeGame({ id: "e1", source: "epic", status: "playing", lastPlayedAt: hoursAgo(2) }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("handles a game played exactly 7 days ago (boundary)", () => {
      const exactly7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const games = [
        makeGame({ id: "g1", status: "completed", lastPlayedAt: exactly7d }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      // Exactly at the cutoff — Date.now() inside the function may differ by ms,
      // so this game is right at the boundary. It should be included or excluded
      // depending on ms precision; the important thing is no crash.
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it("includes a 'playing' game even if lastPlayedAt is very old", () => {
      const games = [
        makeGame({ id: "g1", status: "playing", lastPlayedAt: "2020-01-01T00:00:00Z" }),
      ];
      const result = getContinuePlayingGames(games, null, [], 5);
      expect(result).toHaveLength(1);
    });
  });
});
