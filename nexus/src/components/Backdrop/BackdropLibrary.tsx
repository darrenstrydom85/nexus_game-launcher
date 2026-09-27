import { useGames } from "@/hooks/useGames";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { HeroSection } from "@/components/Library/HeroSection";
import { LibraryView, type LibraryViewProps } from "@/components/Library/LibraryView";

/**
 * Backdrop library: the full-bleed hero stage on top of the standard
 * library (toolbar, Continue Playing, grid). All behavior lives in the
 * shared components; this file is composition only.
 */
export function BackdropLibrary(props: LibraryViewProps) {
  const { games } = useGames();
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const visibleGames = games.filter(
    (g) => !hiddenGameIds.includes(g.id) && g.status !== "removed",
  );

  return (
    <div data-testid="backdrop-library" className="flex flex-col">
      <HeroSection
        games={visibleGames}
        onPlay={props.onPlay}
        onDetails={(game) => useUiStore.getState().setDetailOverlayGameId(game.id)}
      />
      <LibraryView {...props} />
    </div>
  );
}
