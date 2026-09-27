import * as React from "react";
import { useGames } from "@/hooks/useGames";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useQueueStore } from "@/stores/queueStore";
import type { Game } from "@/stores/gameStore";
import { HeroSection } from "@/components/Library/HeroSection";
import { LibraryView, type LibraryViewProps } from "@/components/Library/LibraryView";
import { TileRow } from "@/components/experience/TileRow";

/**
 * Backdrop library: the full-bleed hero stage plus a play-queue shelf on
 * top of the standard library (toolbar, Continue Playing, grid). All
 * behavior lives in the shared components; this file is composition only.
 */
export function BackdropLibrary(props: LibraryViewProps) {
  const { games } = useGames();
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const queueEntries = useQueueStore((s) => s.entries);
  const visibleGames = games.filter(
    (g) => !hiddenGameIds.includes(g.id) && g.status !== "removed",
  );
  const queueGames = React.useMemo(
    () =>
      queueEntries
        .map((e) => visibleGames.find((g) => g.id === e.gameId))
        .filter((g): g is Game => Boolean(g)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queueEntries, games, hiddenGameIds],
  );

  return (
    <div data-testid="backdrop-library" className="flex flex-col">
      <HeroSection
        games={visibleGames}
        onPlay={props.onPlay}
        onDetails={(game) => useUiStore.getState().setDetailOverlayGameId(game.id)}
      />
      <TileRow
        title="Up next"
        count={queueGames.length}
        games={queueGames}
        onTileClick={(id) => useUiStore.getState().setDetailOverlayGameId(id)}
        testid="backdrop-queue-shelf"
      />
      <LibraryView {...props} />
    </div>
  );
}
