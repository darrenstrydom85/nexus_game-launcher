import * as React from "react";
import { useGames } from "@/hooks/useGames";
import { useFilteredGames } from "@/hooks/useFilteredGames";
import { useUiStore } from "@/stores/uiStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useFilterStore } from "@/stores/filterStore";
import { useSyncStore } from "@/stores/syncStore";
import type { Game, GameSource } from "@/stores/gameStore";
import type { GameContextMenuHandlers } from "@/components/GameCard";
import { GameGrid } from "./GameGrid";
import { GameCard } from "@/components/GameCard";
import { SkeletonCard } from "./SkeletonCard";
import { ContinuePlayingRow } from "./ContinuePlayingRow";
import { SyncProgressBanner } from "./SyncProgressBanner";
import { SyncActivityDot } from "./SyncActivityDot";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam", epic: "Epic Games", gog: "GOG", ubisoft: "Ubisoft",
  battlenet: "Battle.net", xbox: "Xbox", standalone: "Standalone",
};

export function buildHeading(opts: {
  searchQuery: string;
  sourceFilter: string | null;
  genreFilter: string | null;
  activeCollection: { name: string } | null;
}): string {
  const { searchQuery, sourceFilter, genreFilter, activeCollection } = opts;

  if (searchQuery) return `Results for "${searchQuery}"`;
  if (activeCollection) return activeCollection.name;
  if (sourceFilter) return `${SOURCE_LABELS[sourceFilter as GameSource] ?? sourceFilter} Games`;
  if (genreFilter) return genreFilter;
  return "All Games";
}

export interface LibraryViewProps extends GameContextMenuHandlers {
  onPlay?: (game: Game) => void;
  onResync?: () => Promise<void>;
  isSyncing?: boolean;
  syncResult?: { added: number; updated: number } | null;
  onSettingsClick?: () => void;
}

export function LibraryView({
  onPlay,
  onResync,
  isSyncing = false,
  syncResult,
  onEdit,
  onRefetchMetadata,
  onSearchMetadata,
  onHide,
  onOpenFolder,
  onSetStatus,
  onSetRating,
  onAddToCollection,
  onRemoveFromCollection,
  activeCollectionName,
  collections,
  onSettingsClick,
}: LibraryViewProps) {
  const { games, isLoading, error } = useGames();
  const startedAt = useSyncStore((s) => s.startedAt);
  const [syncBannerDismissed, setSyncBannerDismissed] = React.useState(false);
  const prevStartedAt = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (startedAt !== prevStartedAt.current) {
      prevStartedAt.current = startedAt;
      if (startedAt !== null) setSyncBannerDismissed(false);
    }
  }, [startedAt]);
  const {
    visibleGames,
    filteredGames,
    isFiltered,
    activeCollection,
    activeCollectionId,
    sourceFilter,
    genreFilter,
    searchQuery,
  } = useFilteredGames(games);

  const heading = React.useMemo(() => buildHeading({
    searchQuery,
    sourceFilter,
    genreFilter,
    activeCollection,
  }), [searchQuery, sourceFilter, genreFilter, activeCollection]);

  if (error) {
    return (
      <div
        data-testid="library-error"
        className="flex flex-1 items-center justify-center p-12"
      >
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div data-testid="library-view" className="relative flex flex-col">
        <div className="sticky top-0 z-[20] h-0 overflow-visible">
          <SyncProgressBanner
            dismissed={syncBannerDismissed}
            onDismiss={() => setSyncBannerDismissed(true)}
          />
        </div>
        {/* Library toolbar */}
        <div className="flex items-center justify-between border-b border-border px-6 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {syncResult && !isSyncing && (
              <span data-testid="sync-result" className="text-success">
                Sync complete — {syncResult.added} added, {syncResult.updated} updated
              </span>
            )}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            <SyncActivityDot
              dismissed={syncBannerDismissed}
              onRestore={() => setSyncBannerDismissed(false)}
            />
            <button
              data-testid="resync-button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                "bg-secondary text-secondary-foreground transition-colors",
                "hover:bg-secondary/80 disabled:pointer-events-none disabled:opacity-50",
              )}
              onClick={onResync}
              disabled={isSyncing}
              title="Re-scan all sources and update library"
            >
              {isSyncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {isSyncing ? "Syncing…" : "Sync Library"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div
            data-testid="library-skeleton"
            className="grid gap-4 px-6 py-6"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
          <ContinuePlayingRow
            games={visibleGames}
            sourceFilter={sourceFilter as GameSource | null}
            isCollectionActive={activeCollectionId !== null}
            onPlay={onPlay}
            onGameClick={(id) => useUiStore.getState().setDetailOverlayGameId(id)}
          />
          <GameGrid
            games={filteredGames}
            totalCount={games.length}
            isFiltered={isFiltered}
            heading={heading}
            onSettingsClick={onSettingsClick}
            onClearFilters={() => {
              useUiStore.getState().setSearchQuery("");
              useUiStore.getState().setSourceFilter(null);
              useUiStore.getState().setGenreFilter(null);
              useCollectionStore.getState().setActiveCollectionId(null);
              useFilterStore.getState().clearAll();
            }}
            onGameClick={(id) => useUiStore.getState().setDetailOverlayGameId(id)}
            onPlay={onPlay}
            onEdit={onEdit}
            onRefetchMetadata={onRefetchMetadata}
            onSearchMetadata={onSearchMetadata}
            onHide={onHide}
            onOpenFolder={onOpenFolder}
            onSetStatus={onSetStatus}
            onSetRating={onSetRating}
            onAddToCollection={onAddToCollection}
            onRemoveFromCollection={onRemoveFromCollection}
            activeCollectionName={activeCollectionName}
            collections={collections}
            renderCard={(game) => <GameCard game={game} />}
          />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
