import type { Game } from "@/stores/gameStore";

const DAY = 86_400_000;
const SHELF_MAX = 14;

/** Games the Home page may suggest: not archived, not hidden. */
export function visibleGames(games: Game[], hiddenIds: string[]): Game[] {
  const hidden = new Set(hiddenIds);
  return games.filter((g) => g.status !== "removed" && !g.isHidden && !hidden.has(g.id));
}

/** Nothing has been played yet: a just-installed launcher. */
export function isFreshLibrary(games: Game[]): boolean {
  return games.length > 0 && !games.some((g) => g.lastPlayedAt);
}

const untouched = (g: Game) => g.playCount === 0 && !g.lastPlayedAt && !g.completed && g.status !== "dropped";
const hasArt = (g: Game) => Boolean(g.heroUrl ?? g.coverUrl);

/** Best-rated games not started yet, artwork first. The fresh-library spotlight and a shelf. */
export function criticsPicks(games: Game[], minScore = 80): Game[] {
  return games
    .filter((g) => untouched(g) && (g.criticScore ?? 0) >= minScore)
    .sort((a, b) => Number(hasArt(b)) - Number(hasArt(a)) || (b.criticScore ?? 0) - (a.criticScore ?? 0))
    .slice(0, SHELF_MAX);
}

/** Unfinished games short enough to beat in a weekend (≤ 10h main story), shortest first. */
export function weekendGames(games: Game[]): Game[] {
  return games
    .filter((g) => !g.completed && g.status !== "completed" && g.status !== "dropped" && g.hltbMainH != null && g.hltbMainH > 0 && g.hltbMainH <= 10)
    .filter((g) => g.totalPlayTimeS / 3600 < g.hltbMainH! * 0.8)
    .sort((a, b) => a.hltbMainH! - b.hltbMainH!)
    .slice(0, SHELF_MAX);
}

/** Started but set aside for three weeks or more, most recent first. */
export function jumpBackIn(games: Game[], now = Date.now()): Game[] {
  return games
    .filter(
      (g) =>
        g.lastPlayedAt &&
        now - new Date(g.lastPlayedAt).getTime() > 21 * DAY &&
        !g.completed &&
        (g.status === "playing" || g.status === "unset" || g.status === "backlog"),
    )
    .sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime())
    .slice(0, SHELF_MAX);
}

/** Added in the last 30 days. Empty for a fresh install, where everything is new. */
export function newlyAdded(games: Game[], now = Date.now()): Game[] {
  if (isFreshLibrary(games)) return [];
  return games
    .filter((g) => now - new Date(g.addedAt).getTime() < 30 * DAY)
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, SHELF_MAX);
}

/** Library shape for the "at a glance" tile: games per source and the most common genres. */
export function libraryShape(games: Game[]) {
  const sources = new Map<string, number>();
  const genres = new Map<string, number>();
  for (const g of games) {
    sources.set(g.source, (sources.get(g.source) ?? 0) + 1);
    for (const genre of g.genres ?? []) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  }
  const byCount = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    total: games.length,
    sources: [...sources.entries()].sort(byCount).map(([id, count]) => ({ id, count })),
    genres: [...genres.entries()].sort(byCount).slice(0, 8).map(([name, count]) => ({ name, count })),
  };
}
