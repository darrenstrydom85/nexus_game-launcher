import { describe, it, expect } from "vitest";
import { filterGames, hasActiveFilters, type LibraryFilters } from "@/lib/libraryFilter";
import type { Game } from "@/stores/gameStore";

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

const none: LibraryFilters = {
  query: "", source: null, genre: null, statuses: [], tagIds: [], minCriticScore: 0, maxCriticScore: 100, tiers: [],
};
const ctx = { gameTagMap: { b: ["t1"] }, tierOf: (id: string) => (id === "c" ? ("gold" as const) : ("none" as const)) };

const games = [
  game("a", { name: "Ori", source: "steam", genres: ["Platformer"], status: "completed", criticScore: 88 }),
  game("b", { name: "Hades", source: "epic", genres: ["Roguelike"], status: "playing", criticScore: 93 }),
  game("c", { name: "Celeste", source: "steam", genres: ["Platformer"], status: "backlog", criticScore: null }),
];
const ids = (gs: Game[]) => gs.map((g) => g.id);

describe("filterGames", () => {
  it("returns everything with no filters", () => {
    expect(ids(filterGames(games, none, ctx))).toEqual(["a", "b", "c"]);
    expect(hasActiveFilters(none)).toBe(false);
  });

  it("ANDs across filters and ORs within one", () => {
    const f = { ...none, source: "steam", statuses: ["completed", "backlog"] as Game["status"][] };
    expect(ids(filterGames(games, f, ctx))).toEqual(["a", "c"]);
    expect(ids(filterGames(games, { ...f, genre: "Roguelike" }, ctx))).toEqual([]);
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("filters by tags, mastery tier and collection", () => {
    expect(ids(filterGames(games, { ...none, tagIds: ["t1"] }, ctx))).toEqual(["b"]);
    expect(ids(filterGames(games, { ...none, tiers: ["gold"] }, ctx))).toEqual(["c"]);
    expect(ids(filterGames(games, { ...none, collectionGameIds: ["a", "c"] }, ctx))).toEqual(["a", "c"]);
  });

  it("drops unscored games once a critic range is set", () => {
    expect(ids(filterGames(games, { ...none, minCriticScore: 90 }, ctx))).toEqual(["b"]);
  });

  it("matches the query against name and genre", () => {
    expect(ids(filterGames(games, { ...none, query: "plat" }, ctx))).toEqual(["a", "c"]);
    expect(ids(filterGames(games, { ...none, query: "HAD" }, ctx))).toEqual(["b"]);
  });
});
