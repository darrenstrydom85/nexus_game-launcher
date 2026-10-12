import * as React from "react";
import { useGameResolver } from "@/hooks/useGameResolver";
import { resolveUrl } from "@/lib/url";

interface ArtSource {
  id: string;
  name: string;
  coverUrl?: string | null;
  heroUrl?: string | null;
}

/**
 * Art for a game in the report: the report's own URLs first, then the library
 * entry (matched by id, then name) when the report has none.
 */
export function useGameArt() {
  const { resolve, openGame } = useGameResolver();
  const art = React.useCallback(
    (g: ArtSource) => {
      const stored = resolve(g.id, g.name);
      return {
        hero: resolveUrl(g.heroUrl ?? null) ?? stored?.game.heroUrl ?? null,
        cover: resolveUrl(g.coverUrl ?? null) ?? stored?.game.coverUrl ?? null,
        inLibrary: stored !== null,
        isRemoved: stored?.isRemoved ?? false,
      };
    },
    [resolve],
  );
  return { art, openGame };
}
