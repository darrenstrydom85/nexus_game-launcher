import * as React from "react";
import { cn } from "@/lib/utils";
import { useGames } from "@/hooks/useGames";
import { useFilteredGames } from "@/hooks/useFilteredGames";
import { useUiStore } from "@/stores/uiStore";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { useFilterStore } from "@/stores/filterStore";
import { useQueueStore } from "@/stores/queueStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSyncStore } from "@/stores/syncStore";
import type { Game, GameSource } from "@/stores/gameStore";
import { BackdropHero } from "./BackdropHero";
import { Shelf, ShelfCover, GridCover } from "./Shelf";
import { GameGrid } from "@/components/Library/GameGrid";
import { SkeletonCard } from "@/components/Library/SkeletonCard";
import { SyncProgressBanner } from "@/components/Library/SyncProgressBanner";
import { SyncActivityDot } from "@/components/Library/SyncActivityDot";
import { getContinuePlayingGames } from "@/components/Library/ContinuePlayingRow";
import { buildHeading, type LibraryViewProps } from "@/components/Library/LibraryView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LibraryFilters } from "./LibraryFilters";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * The Backdrop library: hero stage on top, shelves beneath, the full grid
 * (sort, view modes, context menus) at the bottom. Shelf clicks retarget
 * the hero; the hero carries the play/details/queue actions.
 */
interface BackdropLibraryProps extends LibraryViewProps {
  onAddCollection?: () => void;
  onEditCollection?: (collection: Collection) => void;
  onDeleteCollection?: (collection: Collection) => void;
}

export function BackdropLibrary({
  onPlay,
  onResync,
  isSyncing = false,
  syncResult,
  onSettingsClick,
  onAddCollection,
  onEditCollection,
  onDeleteCollection,
  ...contextMenuHandlers
}: BackdropLibraryProps) {
  const { games, isLoading, error } = useGames();
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
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId);
  const queueEntries = useQueueStore((s) => s.entries);
  const continuePlayingEnabled = useSettingsStore((s) => s.continuePlayingEnabled);
  const continuePlayingMax = useSettingsStore((s) => s.continuePlayingMax);

  // Quick status pills on the All Games shelf (mockup: All / Playing / Backlog)
  const [statusFilter, setStatusFilter] = React.useState<"all" | "playing" | "backlog" | "completed">("all");
  const statusFiltered = React.useMemo(
    () =>
      statusFilter === "all"
        ? filteredGames
        : filteredGames.filter((g) =>
            statusFilter === "completed" ? g.completed : g.status === statusFilter,
          ),
    [filteredGames, statusFilter],
  );
  const statusCounts = React.useMemo(
    () => ({
      playing: filteredGames.filter((g) => g.status === "playing").length,
      backlog: filteredGames.filter((g) => g.status === "backlog").length,
      completed: filteredGames.filter((g) => g.completed).length,
    }),
    [filteredGames],
  );

  const startedAt = useSyncStore((s) => s.startedAt);
  const [syncBannerDismissed, setSyncBannerDismissed] = React.useState(false);
  const prevStartedAt = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (startedAt !== prevStartedAt.current) {
      prevStartedAt.current = startedAt;
      if (startedAt !== null) setSyncBannerDismissed(false);
    }
  }, [startedAt]);

  const continueGames = React.useMemo(
    () =>
      continuePlayingEnabled && activeCollectionId === null
        ? getContinuePlayingGames(visibleGames, sourceFilter as GameSource | null, continuePlayingMax)
        : [],
    [continuePlayingEnabled, activeCollectionId, visibleGames, sourceFilter, continuePlayingMax],
  );

  const queueGames = React.useMemo(
    () =>
      queueEntries
        .map((e) => visibleGames.find((g) => g.id === e.gameId))
        .filter((g): g is Game => Boolean(g)),
    [queueEntries, visibleGames],
  );

  const openDetails = (gameId: string) =>
    useUiStore.getState().setDetailOverlayGameId(gameId);

  const heading = buildHeading({ searchQuery, sourceFilter, genreFilter, activeCollection });

  if (error) {
    return (
      <div data-testid="library-error" className="flex flex-1 items-center justify-center p-12">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        data-testid="library-skeleton"
        className="grid gap-4 px-10 py-8"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div data-testid="backdrop-library" className="relative flex flex-col pb-8">
        <div className="sticky top-0 z-[20] h-0 overflow-visible">
          <SyncProgressBanner
            dismissed={syncBannerDismissed}
            onDismiss={() => setSyncBannerDismissed(true)}
          />
        </div>

        <BackdropHero games={visibleGames} onPlay={onPlay} onDetails={openDetails} />

        {continueGames.length > 0 && (
          <Shelf title="Continue Playing" testid="backdrop-continue-shelf">
            <div className="scrollbar-hide -mx-2 flex gap-4 overflow-x-auto px-2 py-1">
              {continueGames.map((game) => (
                <ShelfCover
                  key={game.id}
                  game={game}
                  size="lg"
                  selected={game.id === selectedGameId}
                  onClick={() => setSelectedGameId(game.id)}
                />
              ))}
            </div>
          </Shelf>
        )}

        {queueGames.length > 0 && (
          <Shelf title="Up Next" count={queueGames.length} testid="backdrop-queue-shelf">
            <div className="scrollbar-hide -mx-2 flex gap-4 overflow-x-auto px-2 py-1">
              {queueGames.map((game) => (
                <ShelfCover
                  key={game.id}
                  game={game}
                  selected={game.id === selectedGameId}
                  onClick={() => setSelectedGameId(game.id)}
                />
              ))}
            </div>
          </Shelf>
        )}

        <Shelf
          title={heading}
          count={statusFiltered.length}
          testid="backdrop-all-games"
          className="mt-2"
          afterTitle={
            <div className="flex items-center gap-1.5" data-testid="status-pills">
              {([
                ["all", "All", filteredGames.length],
                ["playing", "Playing", statusCounts.playing],
                ["backlog", "Backlog", statusCounts.backlog],
                ["completed", "Done", statusCounts.completed],
              ] as const).map(([value, label, count]) =>
                value === "all" || count > 0 ? (
                  <button
                    key={value}
                    data-testid={`status-pill-${value}`}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      statusFilter === value
                        ? "bg-foreground font-semibold text-background"
                        : "border border-foreground/15 text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setStatusFilter(value)}
                    aria-pressed={statusFilter === value}
                  >
                    {label}
                    {value !== "all" && <span className="ml-1 opacity-70">{count}</span>}
                  </button>
                ) : null,
              )}
            </div>
          }
          trailing={
            <div className="flex items-center gap-3">
              {syncResult && !isSyncing && (
                <span data-testid="sync-result" className="text-[10px] uppercase tracking-[0.12em] text-success">
                  Synced — {syncResult.added} added, {syncResult.updated} updated
                </span>
              )}
              <SyncActivityDot
                dismissed={syncBannerDismissed}
                onRestore={() => setSyncBannerDismissed(false)}
              />
              <button
                data-testid="resync-button"
                className={cn(
                  "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]",
                  "text-muted-foreground/70 transition-colors hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
                onClick={onResync}
                disabled={isSyncing}
                title="Re-scan all sources and update library"
              >
                {isSyncing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                {isSyncing ? "Syncing…" : "Sync"}
              </button>
            </div>
          }
        >
          <LibraryFilters
            visibleGames={visibleGames}
            onAddCollection={onAddCollection}
            onEditCollection={onEditCollection}
            onDeleteCollection={onDeleteCollection}
          />
          <GameGrid
            games={statusFiltered}
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
            onGameClick={openDetails}
            onPlay={onPlay}
            {...contextMenuHandlers}
            renderCard={(game) => (
              <GridCover game={game} onClick={() => openDetails(game.id)} />
            )}
          />
        </Shelf>
      </div>
    </TooltipProvider>
  );
}
