import * as React from "react";
import { getSessionDistribution } from "@/lib/tauri";
import type { SessionDistribution, SessionScope } from "@/lib/tauri";

export interface UseSessionDistributionResult {
  distribution: SessionDistribution | null;
  isLoading: boolean;
  error: string | null;
  refetch: (scope: SessionScope) => void;
}

/**
 * Fetches a session-length distribution for the given scope.
 * Defaults to `{ type: "Library" }` on mount.
 */
export function useSessionDistribution(
  initialScope: SessionScope = { type: "Library" },
): UseSessionDistributionResult {
  const [distribution, setDistribution] =
    React.useState<SessionDistribution | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const scopeRef = React.useRef<SessionScope>(initialScope);

  const fetch = React.useCallback(async (scope: SessionScope) => {
    scopeRef.current = scope;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getSessionDistribution(scope);
      // Guard against stale responses if scope changed mid-flight
      if (scopeRef.current === scope) {
        setDistribution(result);
      }
    } catch (e) {
      if (scopeRef.current === scope) {
        setError(e instanceof Error ? e.message : "Failed to load distribution");
      }
    } finally {
      if (scopeRef.current === scope) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    fetch(initialScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { distribution, isLoading, error, refetch: fetch };
}
