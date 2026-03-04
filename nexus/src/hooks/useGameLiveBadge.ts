import { useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import {
  useTwitchStore,
  computeGameLiveBadgesMap,
  type GameLiveBadgeInfo,
} from "@/stores/twitchStore";

function normalizeGameName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Returns live badge info for a game when followed streamers are playing it (Story 19.8).
 * Memoized: map is computed once per (liveStreams, games) change; O(1) lookup by game name.
 */
export function useGameLiveBadge(gameName: string): GameLiveBadgeInfo | null {
  const liveStreams = useTwitchStore((s) => s.liveStreams);
  const games = useGameStore((s) => s.games);
  const map = useMemo(
    () =>
      computeGameLiveBadgesMap(
        liveStreams,
        games.map((g) => g.name),
      ),
    [liveStreams, games],
  );
  return map[normalizeGameName(gameName)] ?? null;
}
