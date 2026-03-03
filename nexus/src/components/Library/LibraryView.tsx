import * as React from "react";
import { useGames } from "@/hooks/useGames";
import { useUiStore } from "@/stores/uiStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFilterStore } from "@/stores/filterStore";
import { useSyncStore } from "@/stores/syncStore";
import type { Game, GameSource, GameStatus } from "@/stores/gameStore";
import { GameGrid } from "./GameGrid";
import { GameCard } from "@/components/GameCard";
import { SkeletonCard } from "./SkeletonCard";
import { SyncProgressBanner } from "./SyncProgressBanner";
import { SyncActivityDot } from "./SyncActivityDot";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam", epic: "Epic Games", gog: "GOG", ubisoft: "Ubisoft",
  battlenet: "Battle.net", xbox: "Xbox", standalone: "Standalone",
};

const STATUS_LABELS: Record<GameStatus, string> = {
  playing: "Currently Playing", completed: "Completed", backlog: "Backlog",
  dropped: "Dropped", wishlist: "Wishlist", removed: "Removed", unset: "All Games",
};

function buildHeading(opts: {
  searchQuery: string;
  sourceFilter: string | null;
  genreFilter: string | null;
  activeCollection: { name: string } | null;
  filterSources: GameSource[];
  filterStatuses: GameStatus[];
  filterGenres: string[];
}): string {
  const { searchQuery, sourceFilter, genreFilter, activeCollection, filterSources, filterStatuses, filterGenres } = opts;

  if (searchQuery) return `Results for "${searchQuery}"`;
  if (activeCollection) return activeCollection.name;
  if (filterStatuses.length === 1) return STATUS_LABELS[filterStatuses[0]];
  if (filterStatuses.length > 1) return "Filtered by Status";
  if (filterSources.length === 1) return `${SOURCE_LABELS[filterSources[0]]} Games`;
  if (filterSources.length > 1) return "Multiple Sources";
  if (sourceFilter) return `${SOURCE_LABELS[sourceFilter as GameSource] ?? sourceFilter} Games`;
  if (filterGenres.length === 1) return filterGenres[0];
  if (filterGenres.length > 1) return "Multiple Genres";
  if (genreFilter) return genreFilter;
  return "All Games";
}

interface LibraryViewProps {
  onPlay?: (game: Game) => void;
  onResync?: () => Promise<void>;
  isSyncing?: boolean;
  syncResult?: { added: number; updated: number } | null;
}

export function LibraryView({ onPlay, onResync, isSyncing = false, syncResult }: LibraryViewProps) {
  const { games, isLoading, error } = useGames();
  const searchQuery = useUiStore((s) => s.searchQuery);
  const startedAt = useSyncStore((s) => s.startedAt);
  const [syncBannerDismissed, setSyncBannerDismissed] = React.useState(false);
  const prevStartedAt = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (startedAt !== prevStartedAt.current) {
      prevStartedAt.current = startedAt;
      if (startedAt !== null) setSyncBannerDismissed(false);
    }
  }, [startedAt]);
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const activeCollection = useCollectionStore((s) =>
    s.activeCollectionId ? s.collections.find((c) => c.id === s.activeCollectionId) ?? null : null,
  );
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const filterSources = useFilterStore((s) => s.sources);
  const filterStatuses = useFilterStore((s) => s.statuses);
  const filterGenres = useFilterStore((s) => s.genres);
  const minCriticScore = useFilterStore((s) => s.minCriticScore);
  const maxCriticScore = useFilterStore((s) => s.maxCriticScore);

  const filteredGames = React.useMemo(() => {
    let result = games.filter((g) => !hiddenGameIds.includes(g.id));
    if (activeCollection) {
      result = result.filter((g) => activeCollection.gameIds.includes(g.id));
    }
    if (sourceFilter) {
      result = result.filter((g) => g.source === sourceFilter);
    }
    if (genreFilter) {
      result = result.filter((g) =>
        (Array.isArray(g.genres) ? g.genres : []).some((genre) => genre === genreFilter),
      );
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (Array.isArray(g.genres) ? g.genres : []).some((genre) => genre.toLowerCase().includes(q)),
      );
    }
    if (minCriticScore > 0 || maxCriticScore < 100) {
      result = result.filter((g) => {
        if (g.criticScore == null || g.criticScore <= 0) return false;
        return g.criticScore >= minCriticScore && g.criticScore <= maxCriticScore;
      });
    }
    return result;
  }, [games, hiddenGameIds, searchQuery, sourceFilter, genreFilter, activeCollection, minCriticScore, maxCriticScore]);

  const isFiltered = searchQuery.length > 0 || sourceFilter !== null || genreFilter !== null || activeCollectionId !== null
    || filterSources.length > 0 || filterStatuses.length > 0 || filterGenres.length > 0
    || minCriticScore > 0 || maxCriticScore < 100;

  const heading = React.useMemo(() => buildHeading({
    searchQuery,
    sourceFilter,
    genreFilter,
    activeCollection,
    filterSources,
    filterStatuses,
    filterGenres,
  }), [searchQuery, sourceFilter, genreFilter, activeCollection, filterSources, filterStatuses, filterGenres]);

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
    <div data-testid="library-view" className="relative flex flex-col">
      <div className="sticky top-0 z-[20] h-0 overflow-visible">
        <SyncProgressBanner
          dismissed={syncBannerDismissed}
          onDismiss={() => setSyncBannerDismissed(true)}
        />
      </div>
      {/* Library toolbar */}
      <TooltipProvider>
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
      </TooltipProvider>

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
        <GameGrid
          games={filteredGames}
          totalCount={games.length}
          isFiltered={isFiltered}
          heading={heading}
          onClearFilters={() => {
            useUiStore.getState().setSearchQuery("");
            useUiStore.getState().setSourceFilter(null);
            useUiStore.getState().setGenreFilter(null);
            useCollectionStore.getState().setActiveCollectionId(null);
            useFilterStore.getState().clearAll();
          }}
          onGameClick={(id) => useUiStore.getState().setDetailOverlayGameId(id)}
          onPlay={onPlay}
          renderCard={(game) => <GameCard game={game} />}
        />
      )}
    </div>
  );
}
