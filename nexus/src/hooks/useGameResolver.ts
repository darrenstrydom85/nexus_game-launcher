import * as React from "react";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";

export interface ResolvedGame {
  game: Game;
  isRemoved: boolean;
}

/**
 * Provides lookup maps and a click handler for resolving games by id or name
 * across stats and wrapped views. Centralises the "is this game uninstalled?"
 * check so every consumer shows a consistent indicator.
 */
export function useGameResolver() {
  const storeGames = useGameStore((s) => s.games);
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);

  const byId = React.useMemo(
    () => new Map(storeGames.map((g) => [g.id, g])),
    [storeGames],
  );

  const byName = React.useMemo(
    () => new Map(storeGames.map((g) => [g.name.toLowerCase(), g])),
    [storeGames],
  );

  const resolve = React.useCallback(
    (id: string, name?: string): ResolvedGame | null => {
      const match = byId.get(id) ?? (name ? byName.get(name.toLowerCase()) : undefined) ?? null;
      if (!match) return null;
      return { game: match, isRemoved: match.status === "removed" };
    },
    [byId, byName],
  );

  const openGame = React.useCallback(
    (id: string, name?: string) => {
      const result = resolve(id, name);
      if (result) setDetailOverlayGameId(result.game.id);
    },
    [resolve, setDetailOverlayGameId],
  );

  return { resolve, openGame };
}
