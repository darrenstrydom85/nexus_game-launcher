import * as React from "react";
import { cn } from "@/lib/utils";
import type { Game, GameSource } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ContinuePlayingCard } from "./ContinuePlayingCard";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getContinuePlayingGames(
  games: Game[],
  sourceFilter: GameSource | null,
  filterSources: GameSource[],
  maxCards: number,
): Game[] {
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_MS;

  let candidates = games.filter((g) => {
    if (!g.lastPlayedAt) return false;
    const isPlaying = g.status === "playing";
    const isRecent = new Date(g.lastPlayedAt).getTime() >= cutoff;
    return isPlaying || isRecent;
  });

  if (sourceFilter) {
    candidates = candidates.filter((g) => g.source === sourceFilter);
  }
  if (filterSources.length > 0) {
    candidates = candidates.filter((g) => filterSources.includes(g.source));
  }

  candidates.sort(
    (a, b) =>
      new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime(),
  );

  return candidates.slice(0, maxCards);
}

interface ContinuePlayingRowProps {
  games: Game[];
  sourceFilter: GameSource | null;
  filterSources: GameSource[];
  isCollectionActive: boolean;
  onPlay?: (game: Game) => void;
  onGameClick?: (gameId: string) => void;
}

export function ContinuePlayingRow({
  games,
  sourceFilter,
  filterSources,
  isCollectionActive,
  onPlay,
  onGameClick,
}: ContinuePlayingRowProps) {
  const enabled = useSettingsStore((s) => s.continuePlayingEnabled);
  const maxCards = useSettingsStore((s) => s.continuePlayingMax);

  const qualifying = React.useMemo(
    () => getContinuePlayingGames(games, sourceFilter, filterSources, maxCards),
    [games, sourceFilter, filterSources, maxCards],
  );

  const prefersReducedMotion = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  if (!enabled || isCollectionActive || qualifying.length === 0) return null;

  return (
    <section
      data-testid="continue-playing-row"
      className={cn(
        "flex flex-col gap-3 px-6 pt-5",
        !prefersReducedMotion && "animate-[slide-up_200ms_ease-out_both]",
      )}
      aria-label="Continue Playing"
    >
      <h3 className="text-sm font-semibold text-muted-foreground">
        Continue Playing
      </h3>

      {/* Scrollable card strip with fade edges */}
      <div
        className="relative"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 32px, black calc(100% - 32px), transparent)",
        }}
      >
        <div
          data-testid="continue-playing-scroll"
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        >
          {qualifying.map((game) => (
            <ContinuePlayingCard
              key={game.id}
              game={game}
              onPlay={onPlay}
              onClick={onGameClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export { getContinuePlayingGames };
