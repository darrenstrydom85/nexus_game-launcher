import * as React from "react";
import { useUiStore } from "@/stores/uiStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFilterStore } from "@/stores/filterStore";
import { useTagStore } from "@/stores/tagStore";
import type { Game } from "@/stores/gameStore";

/**
 * The library filter pipeline (hidden/removed, collection, source, genre,
 * search, score range, tags), shared by every experience's library view so
 * the sidebar/flyout filters behave identically everywhere.
 */
export function useFilteredGames(games: Game[]) {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const activeCollection = useCollectionStore((s) =>
    s.activeCollectionId ? s.collections.find((c) => c.id === s.activeCollectionId) ?? null : null,
  );
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const filterTags = useFilterStore((s) => s.tags);
  const minCriticScore = useFilterStore((s) => s.minCriticScore);
  const maxCriticScore = useFilterStore((s) => s.maxCriticScore);
  const gameTagMap = useTagStore((s) => s.gameTagMap);

  const visibleGames = React.useMemo(
    () => games.filter((g) => !hiddenGameIds.includes(g.id) && g.status !== "removed"),
    [games, hiddenGameIds],
  );

  const filteredGames = React.useMemo(() => {
    let result = visibleGames;
    if (activeCollection) {
      result = result.filter((g) => activeCollection.gameIds.includes(g.id));
    }
    if (sourceFilter) {
      result = result.filter((g) => g.source === sourceFilter);
    }
    if (genreFilter) {
      result = result.filter((g) =>
        (Array.isArray(g.genres) ? g.genres : []).some((genre) => genre === genreFilter),
      );
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (Array.isArray(g.genres) ? g.genres : []).some((genre) => genre.toLowerCase().includes(q)),
      );
    }
    if (minCriticScore > 0 || maxCriticScore < 100) {
      result = result.filter((g) => {
        if (g.criticScore == null || g.criticScore <= 0) return false;
        return g.criticScore >= minCriticScore && g.criticScore <= maxCriticScore;
      });
    }
    if (filterTags.length > 0) {
      result = result.filter((g) => {
        const gameTags = gameTagMap[g.id] ?? [];
        return filterTags.some((t) => gameTags.includes(t));
      });
    }
    return result;
  }, [visibleGames, searchQuery, sourceFilter, genreFilter, activeCollection, minCriticScore, maxCriticScore, filterTags, gameTagMap]);

  const isFiltered =
    searchQuery.length > 0 ||
    sourceFilter !== null ||
    genreFilter !== null ||
    activeCollectionId !== null ||
    filterTags.length > 0 ||
    minCriticScore > 0 ||
    maxCriticScore < 100;

  return { visibleGames, filteredGames, isFiltered, activeCollection, sourceFilter, genreFilter, searchQuery, activeCollectionId };
}
