import * as React from "react";
import { getPerGameSessionStats } from "@/lib/tauri";
import type { PerGameSessionStats } from "@/types/analytics";

export interface UsePerGameSessionStatsResult {
  stats: PerGameSessionStats | null;
  isLoading: boolean;
  error: string | null;
  /** Trigger the fetch. No-op if already fetched and cached. */
  fetch: () => void;
  /** Optimistically update a session's note in the cached stats. */
  patchNote: (sessionId: string, note: string | null) => void;
}

/**
 * Lazy-loading hook for per-game session analytics.
 * Data is only fetched when `fetch()` is called (i.e. when the user expands
 * the session details section). The result is cached for the lifetime of the
 * component — subsequent calls to `fetch()` are no-ops.
 */
export function usePerGameSessionStats(
  gameId: string,
): UsePerGameSessionStatsResult {
  const [stats, setStats] = React.useState<PerGameSessionStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fetchedRef = React.useRef(false);

  const fetch = React.useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setIsLoading(true);
    setError(null);

    getPerGameSessionStats(gameId)
      .then((result) => {
        setStats(result);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load session stats");
        fetchedRef.current = false;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [gameId]);

  const patchNote = React.useCallback((sessionId: string, note: string | null) => {
    setStats((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionId ? { ...s, note } : s,
        ),
      };
    });
  }, []);

  return { stats, isLoading, error, fetch, patchNote };
}
