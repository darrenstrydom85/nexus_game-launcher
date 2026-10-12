import type { Game, GameStatus } from "@/stores/gameStore";
import type { MasteryTierValue } from "@/lib/tauri";

export interface LibraryFilters {
  query: string;
  source: string | null;
  genre: string | null;
  statuses: GameStatus[];
  tagIds: string[];
  minCriticScore: number;
  maxCriticScore: number;
  tiers: MasteryTierValue[];
  /** Restrict to a collection's games. */
  collectionGameIds?: string[] | null;
}

export interface FilterContext {
  gameTagMap: Record<string, string[]>;
  tierOf: (gameId: string) => MasteryTierValue;
}

export function hasActiveFilters(f: LibraryFilters): boolean {
  return (
    f.query.length > 0 ||
    f.source !== null ||
    f.genre !== null ||
    f.statuses.length > 0 ||
    f.tagIds.length > 0 ||
    f.tiers.length > 0 ||
    f.minCriticScore > 0 ||
    f.maxCriticScore < 100
  );
}

/** All library filters in one pass. Within a filter options OR; across filters AND. */
export function filterGames(games: Game[], f: LibraryFilters, ctx: FilterContext): Game[] {
  const q = f.query.trim().toLowerCase();
  const collection = f.collectionGameIds ? new Set(f.collectionGameIds) : null;
  const scoreActive = f.minCriticScore > 0 || f.maxCriticScore < 100;

  return games.filter((g) => {
    if (collection && !collection.has(g.id)) return false;
    if (f.source && g.source !== f.source) return false;
    const genres = Array.isArray(g.genres) ? g.genres : [];
    if (f.genre && !genres.includes(f.genre)) return false;
    if (f.statuses.length > 0 && !f.statuses.includes(g.status)) return false;
    if (f.tagIds.length > 0) {
      const tags = ctx.gameTagMap[g.id] ?? [];
      if (!f.tagIds.some((t) => tags.includes(t))) return false;
    }
    if (f.tiers.length > 0 && !f.tiers.includes(ctx.tierOf(g.id))) return false;
    if (scoreActive) {
      if (g.criticScore == null || g.criticScore <= 0) return false;
      if (g.criticScore < f.minCriticScore || g.criticScore > f.maxCriticScore) return false;
    }
    if (q) {
      const inName = g.name.toLowerCase().includes(q);
      const inGenre = genres.some((genre) => genre.toLowerCase().includes(q));
      if (!inName && !inGenre) return false;
    }
    return true;
  });
}
