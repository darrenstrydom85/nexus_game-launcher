import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import { useGames } from "@/hooks/useGames";
import { useFilteredGames } from "@/hooks/useFilteredGames";
import { useUiStore } from "@/stores/uiStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useFilterStore } from "@/stores/filterStore";
import { useQueueStore } from "@/stores/queueStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Game, GameSource } from "@/stores/gameStore";
import { GameGrid } from "@/components/Library/GameGrid";
import { GameCard } from "@/components/GameCard";
import { ContinuePlayingRow } from "@/components/Library/ContinuePlayingRow";
import { TileRow } from "@/components/experience/TileRow";
import { SkeletonCard } from "@/components/Library/SkeletonCard";
import { buildHeading, type LibraryViewProps } from "@/components/Library/LibraryView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Play } from "lucide-react";

const FOCUS_ROW_MAX = 30;

const STATUS_LABELS: Record<string, string> = {
  playing: "Playing",
  completed: "Completed",
  backlog: "Backlog",
  dropped: "Dropped",
  wishlist: "Wishlist",
  unset: "",
  removed: "Archived",
};

function FocusTile({
  game,
  selected,
  onSelect,
  onOpen,
}: {
  game: Game;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [selected]);

  const art = game.heroUrl ?? game.coverUrl;
  return (
    <button
      ref={ref}
      data-testid={`focus-tile-${game.id}`}
      tabIndex={selected ? 0 : -1}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl bg-card transition-all duration-200",
        "focus-visible:outline-none",
        selected
          ? "h-[164px] w-[280px] outline outline-2 outline-offset-4 outline-foreground"
          : "h-[110px] w-[186px] opacity-70 hover:opacity-100",
      )}
      style={selected ? { boxShadow: "0 0 60px color-mix(in srgb, var(--game-accent, var(--primary)) 35%, transparent)" } : undefined}
      onClick={() => (selected ? onOpen() : onSelect())}
      onDoubleClick={onOpen}
      aria-label={game.name}
      aria-pressed={selected}
    >
      {art ? (
        <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-muted-foreground">
          {game.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 text-left text-[10px] font-medium uppercase tracking-wider text-white">
        {game.name}
      </span>
    </button>
  );
}

/**
 * Channel library: horizontal focus row over content rows, console style.
 * Selection lives in uiStore.selectedGameId; arrow keys traverse, Enter
 * opens details. The full grid below keeps every filter and context-menu
 * behavior via the shared GameGrid + filter pipeline.
 */
export function ChannelLibrary(props: LibraryViewProps) {
  const { games, isLoading } = useGames();
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
  const isQueued = useQueueStore((s) => s.isQueued);
  const continuePlayingEnabled = useSettingsStore((s) => s.continuePlayingEnabled);

  const focusGames = React.useMemo(() => {
    const byRecency = [...filteredGames].sort((a, b) => {
      const ta = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
      const tb = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
      return tb - ta || a.name.localeCompare(b.name);
    });
    return byRecency.slice(0, FOCUS_ROW_MAX);
  }, [filteredGames]);

  const selected =
    focusGames.find((g) => g.id === selectedGameId) ?? focusGames[0] ?? null;

  const selectByOffset = (offset: number) => {
    if (!selected) return;
    const idx = focusGames.findIndex((g) => g.id === selected.id);
    const next = focusGames[idx + offset];
    if (next) setSelectedGameId(next.id);
  };

  const openDetails = (gameId: string) =>
    useUiStore.getState().setDetailOverlayGameId(gameId);

  const queueGames = React.useMemo(
    () =>
      queueEntries
        .map((e) => visibleGames.find((g) => g.id === e.gameId))
        .filter((g): g is Game => Boolean(g)),
    [queueEntries, visibleGames],
  );

  const heading = buildHeading({ searchQuery, sourceFilter, genreFilter, activeCollection });

  if (isLoading) {
    return (
      <div
        data-testid="library-skeleton"
        className="grid gap-4 px-10 py-6"
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
      <div data-testid="channel-library" className="flex flex-col pb-6">
        {/* Focus row */}
        {focusGames.length > 0 && selected && (
          <section
            data-testid="channel-focus-row"
            className="flex flex-col items-center gap-4 px-10 pt-4"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                selectByOffset(1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                selectByOffset(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                openDetails(selected.id);
              }
            }}
          >
            <div className="scrollbar-hide flex w-full items-center gap-4 overflow-x-auto px-2 py-3">
              <div className="mx-auto flex items-center gap-4">
                {focusGames.map((game) => (
                  <FocusTile
                    key={game.id}
                    game={game}
                    selected={game.id === selected.id}
                    onSelect={() => setSelectedGameId(game.id)}
                    onOpen={() => openDetails(game.id)}
                  />
                ))}
              </div>
            </div>

            {/* Selected game info */}
            <div className="flex flex-col items-center gap-2 text-center" data-testid="channel-selected-info">
              <h1 className="text-2xl font-bold uppercase tracking-wide">{selected.name}</h1>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {[
                  selected.totalPlayTimeS > 0 ? formatPlayTime(selected.totalPlayTimeS) : "Unplayed",
                  STATUS_LABELS[selected.status] || null,
                  selected.criticScore ? `Critic ${Math.round(selected.criticScore)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  data-testid="channel-play-selected"
                  className="flex items-center gap-2 rounded-lg bg-foreground px-7 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => props.onPlay?.(selected)}
                >
                  <Play className="size-3.5 fill-current" />
                  PLAY
                </button>
                <button
                  className="rounded-lg border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => openDetails(selected.id)}
                >
                  Details
                </button>
                <button
                  className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    const qs = useQueueStore.getState();
                    if (qs.isQueued(selected.id)) qs.remove(selected.id, selected.name);
                    else qs.add(selected.id, selected.name);
                  }}
                >
                  {isQueued(selected.id) ? "In queue ✓" : "+ Queue"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Continue Playing row (shared component) */}
        {continuePlayingEnabled && (
          <ContinuePlayingRow
            games={visibleGames}
            sourceFilter={sourceFilter as GameSource | null}
            isCollectionActive={activeCollectionId !== null}
            onPlay={props.onPlay}
            onGameClick={openDetails}
          />
        )}

        {/* Queue row */}
        <TileRow
          title="Queue"
          count={queueGames.length}
          games={queueGames}
          onTileClick={openDetails}
          testid="channel-queue-row"
        />

        {/* Full grid with every filter/context-menu behavior */}
        <GameGrid
          games={filteredGames}
          totalCount={games.length}
          isFiltered={isFiltered}
          heading={heading}
          onSettingsClick={props.onSettingsClick}
          onClearFilters={() => {
            useUiStore.getState().setSearchQuery("");
            useUiStore.getState().setSourceFilter(null);
            useUiStore.getState().setGenreFilter(null);
            useCollectionStore.getState().setActiveCollectionId(null);
            useFilterStore.getState().clearAll();
          }}
          onGameClick={openDetails}
          onPlay={props.onPlay}
          onEdit={props.onEdit}
          onRefetchMetadata={props.onRefetchMetadata}
          onSearchMetadata={props.onSearchMetadata}
          onHide={props.onHide}
          onOpenFolder={props.onOpenFolder}
          onSetStatus={props.onSetStatus}
          onSetRating={props.onSetRating}
          onAddToCollection={props.onAddToCollection}
          onRemoveFromCollection={props.onRemoveFromCollection}
          activeCollectionName={props.activeCollectionName}
          collections={props.collections}
          renderCard={(game) => <GameCard game={game} />}
        />
      </div>
    </TooltipProvider>
  );
}
