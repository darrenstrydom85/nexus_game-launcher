import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore, type SortField } from "@/stores/uiStore";
import type { Game } from "@/stores/gameStore";
import { formatPlayTime } from "./HeroSection";
import {
  LayoutGrid,
  List,
  ChevronDown,
  Settings,
  Play,
} from "lucide-react";
import {
  GameCardContextMenu,
  type GameContextMenuHandlers,
} from "@/components/GameCard";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "lastPlayed", label: "Recently Played" },
  { value: "totalPlayTime", label: "Most Played" },
  { value: "addedAt", label: "Recently Added" },
  { value: "rating", label: "Rating" },
  { value: "releaseDate", label: "Release Date" },
];

function sortGames(games: Game[], field: SortField, direction: "asc" | "desc"): Game[] {
  const sorted = [...games].sort((a, b) => {
    switch (field) {
      case "name":
        return a.name.localeCompare(b.name);
      case "lastPlayed":
        return (
          new Date(b.lastPlayedAt ?? 0).getTime() -
          new Date(a.lastPlayedAt ?? 0).getTime()
        );
      case "totalPlayTime":
        return b.totalPlayTimeS - a.totalPlayTimeS;
      case "addedAt":
        return (
          new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );
      case "rating": {
        const aScore = a.criticScore ?? -1;
        const bScore = b.criticScore ?? -1;
        return bScore - aScore;
      }
      case "releaseDate":
        return (
          new Date(b.releaseDate ?? 0).getTime() -
          new Date(a.releaseDate ?? 0).getTime()
        );
      default:
        return 0;
    }
  });
  return direction === "asc" && field === "name" ? sorted : sorted;
}

interface GameGridProps extends GameContextMenuHandlers {
  games: Game[];
  totalCount: number;
  isFiltered?: boolean;
  heading?: string;
  onClearFilters?: () => void;
  onSettingsClick?: () => void;
  onGameClick?: (gameId: string) => void;
  onPlay?: (game: Game) => void;
  renderCard: (game: Game) => React.ReactNode;
}

export function GameGrid({
  games,
  totalCount: _totalCount,
  isFiltered = false,
  heading = "All Games",
  onClearFilters,
  onSettingsClick,
  onGameClick,
  onPlay,
  renderCard,
  onEdit,
  onRefetchMetadata,
  onSearchMetadata,
  onHide,
  onOpenFolder,
  onSetStatus,
  onSetRating,
  onAddToCollection,
  collections,
}: GameGridProps) {
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const sortField = useUiStore((s) => s.sortField);
  const setSortField = useUiStore((s) => s.setSortField);
  const sortDirection = useUiStore((s) => s.sortDirection);
  const [sortOpen, setSortOpen] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    game: Game;
    x: number;
    y: number;
  } | null>(null);

  const openContextMenu = React.useCallback((e: React.MouseEvent, game: Game) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ game, x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = React.useCallback(() => setContextMenu(null), []);

  const sortedGames = React.useMemo(
    () => sortGames(games, sortField, sortDirection),
    [games, sortField, sortDirection],
  );

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortField)?.label ?? "Name";

  if (games.length === 0 && !isFiltered) {
    return (
      <div
        data-testid="game-grid-empty"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center"
      >
        <div className="flex size-20 items-center justify-center rounded-full bg-secondary">
          <LayoutGrid className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No games yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add game sources in Settings to start building your library.
        </p>
        <button
          data-testid="empty-settings-link"
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          onClick={onSettingsClick}
        >
          <Settings className="size-4" />
          Open Settings
        </button>
      </div>
    );
  }

  if (games.length === 0 && isFiltered) {
    return (
      <div
        data-testid="game-grid-filter-empty"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center"
      >
        <h3 className="text-lg font-semibold text-foreground">
          No games match
        </h3>
        <p className="text-sm text-muted-foreground">
          Try adjusting your filters or search query.
        </p>
        <button
          data-testid="clear-filters-button"
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <div data-testid="game-grid" className="flex flex-col gap-4">
      {/* Toolbar */}
      <div
        data-testid="game-grid-toolbar"
        className="flex items-center justify-between px-6 pt-5"
      >
        <h2
          data-testid="library-heading"
          className="text-2xl font-bold tracking-tight text-foreground"
        >
          {heading}
        </h2>

        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative z-20">
            <button
              data-testid="sort-dropdown-trigger"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
              onClick={() => setSortOpen(!sortOpen)}
            >
              {currentSortLabel}
              <ChevronDown className="size-3.5" />
            </button>
            {sortOpen && (
              <div
                data-testid="sort-dropdown-menu"
                className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-lg"
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    data-testid={`sort-option-${opt.value}`}
                    className={cn(
                      "flex w-full items-center rounded-sm px-2 py-1.5 text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                      sortField === opt.value && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => {
                      setSortField(opt.value);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex rounded-md border border-border">
            <button
              data-testid="view-mode-grid"
              className={cn(
                "flex items-center justify-center rounded-l-md px-2 py-1.5",
                viewMode === "grid"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              data-testid="view-mode-list"
              className={cn(
                "flex items-center justify-center rounded-r-md px-2 py-1.5",
                viewMode === "list"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === "grid" && (
        <div
          data-testid="game-grid-cards"
          className="grid gap-4 px-6 pb-6"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {sortedGames.map((game) => (
            <div
              key={game.id}
              className="contents"
              onContextMenu={(e) => openContextMenu(e, game)}
            >
              {renderCard(game)}
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div data-testid="game-list-rows" className="flex flex-col px-6 pb-6">
          {sortedGames.map((game) => (
            <div
              key={game.id}
              data-testid={`game-list-row-${game.id}`}
              className={cn(
                "group flex items-center gap-4 border-b border-border px-3 py-2",
                "cursor-pointer hover:bg-accent/50 transition-colors",
              )}
              onClick={() => onGameClick?.(game.id)}
              onContextMenu={(e) => openContextMenu(e, game)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onGameClick?.(game.id);
                }
              }}
            >
              <button
                data-testid={`game-list-play-${game.id}`}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  "bg-primary text-primary-foreground opacity-0 transition-opacity",
                  "group-hover:opacity-100 hover:bg-primary/90",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay?.(game);
                }}
                aria-label={`Play ${game.name}`}
              >
                <Play className="size-3.5 fill-current" />
              </button>
              <div className="size-10 shrink-0 overflow-hidden rounded">
                {game.coverUrl ? (
                  <img
                    src={game.coverUrl}
                    alt={game.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-secondary" />
                )}
              </div>
              <span className="flex-1 truncate text-sm font-medium text-foreground">
                {game.name}
              </span>
              <span className="w-20 text-xs text-muted-foreground capitalize">
                {game.source}
              </span>
              <span className="w-20 text-xs text-muted-foreground">
                {game.totalPlayTimeS > 0
                  ? formatPlayTime(game.totalPlayTimeS)
                  : "—"}
              </span>
              <span className="w-20 text-xs text-muted-foreground capitalize">
                {game.status === "unset" ? "—" : game.status}
              </span>
              <span className="w-12 text-xs text-muted-foreground">
                {game.rating ? `${game.rating}/5` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Shared context menu for grid and list */}
      {contextMenu && (
        <GameCardContextMenu
          game={contextMenu.game}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onPlay={onPlay}
          onSetStatus={onSetStatus}
          onSetRating={onSetRating}
          onAddToCollection={onAddToCollection}
          onEdit={onEdit}
          onRefetchMetadata={onRefetchMetadata}
          onSearchMetadata={onSearchMetadata}
          onHide={onHide}
          onOpenFolder={onOpenFolder}
          collections={collections}
        />
      )}
    </div>
  );
}

export { sortGames, SORT_OPTIONS };
