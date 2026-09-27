import * as React from "react";
import type { Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useDominantColor } from "@/hooks/useDominantColor";

/**
 * The game the experience shells treat as "selected": the explicit
 * selection when set, otherwise the most recently played game.
 * Explicit selection wins; most recently played is the fallback.
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
 * Dominant art colors are frequently dark or muddy (night scenes, military
 * palettes) and unusable on buttons. Lift the color into a bright,
 * saturated "cinematic" range so accent surfaces stay vivid and dark ink
 * text on them stays readable, while keeping the art's hue.
 */
function cinematicAccent(rgb: string): string {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return rgb;
  const r = Number(m[1]) / 255;
  const g = Number(m[2]) / 255;
  const b = Number(m[3]) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  // Grayscale art keeps a neutral accent; anything with hue gets lifted.
  const outS = s < 0.08 ? s : Math.max(s, 0.55);
  const outL = Math.min(0.68, Math.max(0.58, l));
  return `hsl(${Math.round(h)}, ${Math.round(outS * 100)}%, ${Math.round(outL * 100)}%)`;
}

/**
 * Publishes the selected game's dominant art color as `--game-accent` (plus
 * `--game-accent-ink` for text on accent surfaces) on the given element.
 * Falls back to the theme `--primary` when there is no art, so ThemeStudio
 * themes stay authoritative.
 */
export function useGameAccent(
  ref: React.RefObject<HTMLElement | null>,
  game: Game | null,
) {
  const raw = useDominantColor(game?.heroUrl ?? game?.coverUrl);
  const accent = React.useMemo(() => cinematicAccent(raw), [raw]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--game-accent", accent);
    el.style.setProperty("--game-accent-ink", "#100d0a");
    return () => {
      el.style.removeProperty("--game-accent");
      el.style.removeProperty("--game-accent-ink");
    };
  }, [ref, accent]);
  return accent;
}
