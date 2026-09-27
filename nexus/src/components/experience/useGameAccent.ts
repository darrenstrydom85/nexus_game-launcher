import * as React from "react";
import type { Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useDominantColor } from "@/hooks/useDominantColor";

/**
 * The game the experience shells treat as "selected": the explicit
 * selection when set, otherwise the most recently played game.
 * Same resolution HeroSection uses, shared so Backdrop and Channel agree.
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

/**
 * Publishes the selected game's dominant art color as the `--game-accent`
 * CSS token on the given element (the shell root). Falls back to the theme
 * `--primary` when there is no art, so ThemeStudio themes stay authoritative.
 */
export function useGameAccent(
  ref: React.RefObject<HTMLElement | null>,
  game: Game | null,
) {
  const accent = useDominantColor(game?.heroUrl ?? game?.coverUrl);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--game-accent", accent);
    return () => {
      el.style.removeProperty("--game-accent");
    };
  }, [ref, accent]);
  return accent;
}
