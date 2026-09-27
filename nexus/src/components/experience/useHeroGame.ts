import * as React from "react";
import type { Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * The game the Backdrop hero treats as "selected": the explicit selection
 * when set, otherwise the most recently played game.
 */
export function useHeroGame(games: Game[]): Game | null {
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  return React.useMemo(() => {
    const byRecency = [...games]
      .filter((g) => g.lastPlayedAt)
      .sort(
        (a, b) =>
          new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime(),
      );
    const fallback = byRecency[0] ?? games[0] ?? null;
    if (selectedGameId) return games.find((g) => g.id === selectedGameId) ?? fallback;
    return fallback;
  }, [games, selectedGameId]);
}
