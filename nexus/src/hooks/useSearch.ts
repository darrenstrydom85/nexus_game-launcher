import * as React from "react";
import Fuse from "fuse.js";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";

export interface SearchResult {
  type: "game" | "collection" | "action";
  id: string;
  name: string;
  subtitle?: string;
  icon?: string;
  game?: Game;
  collection?: Collection;
}

export interface ActionItem {
  id: string;
  name: string;
  icon: string;
}

const ACTIONS: ActionItem[] = [
  { id: "action-settings", name: "Open Settings", icon: "⚙️" },
  { id: "action-random", name: "Random Game", icon: "🎲" },
  { id: "action-scan", name: "Scan for Games", icon: "🔍" },
];

export function useSearch(query: string): {
  results: SearchResult[];
  gameResults: SearchResult[];
  collectionResults: SearchResult[];
  actionResults: SearchResult[];
} {
  const games = useGameStore((s) => s.games);
  const collections = useCollectionStore((s) => s.collections);

  const fuse = React.useMemo(
    () =>
      new Fuse(games, {
        keys: [
          { name: "name", weight: 1.0 },
          { name: "genres", weight: 0.5 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [games],
  );

  const collectionFuse = React.useMemo(
    () =>
      new Fuse(collections, {
        keys: [{ name: "name", weight: 1.0 }],
        threshold: 0.4,
      }),
    [collections],
  );

  return React.useMemo(() => {
    if (!query.trim()) {
      return {
        results: [],
        gameResults: [],
        collectionResults: [],
        actionResults: [],
      };
    }

    const gameResults: SearchResult[] = fuse
      .search(query, { limit: 10 })
      .map((r) => ({
        type: "game" as const,
        id: r.item.id,
        name: r.item.name,
        subtitle: `${r.item.source} · ${Math.floor(r.item.totalPlayTimeS / 3600)}h`,
        game: r.item,
      }));

    const collectionResults: SearchResult[] = collectionFuse
      .search(query, { limit: 5 })
      .map((r) => ({
        type: "collection" as const,
        id: r.item.id,
        name: r.item.name,
        icon: r.item.icon,
        collection: r.item,
      }));

    const q = query.toLowerCase();
    const actionResults: SearchResult[] = ACTIONS.filter((a) =>
      a.name.toLowerCase().includes(q),
    ).map((a) => ({
      type: "action" as const,
      id: a.id,
      name: a.name,
      icon: a.icon,
    }));

    return {
      results: [...gameResults, ...collectionResults, ...actionResults],
      gameResults,
      collectionResults,
      actionResults,
    };
  }, [query, fuse, collectionFuse]);
}
