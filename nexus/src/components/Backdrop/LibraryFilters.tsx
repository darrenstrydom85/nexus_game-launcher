import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useFilterStore } from "@/stores/filterStore";
import { useTagStore } from "@/stores/tagStore";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import type { Game, GameSource } from "@/stores/gameStore";
import { SOURCE_ICON_COMPONENTS } from "@/lib/source-icons";
import { ScoreRangeSlider } from "@/components/shared/Sidebar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

function pill(active: boolean, extra?: string) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-foreground font-semibold text-background"
      : "border border-foreground/15 text-muted-foreground hover:text-foreground",
    extra,
  );
}

interface LibraryFiltersProps {
  visibleGames: Game[];
  onAddCollection?: () => void;
  onEditCollection?: (collection: Collection) => void;
  onDeleteCollection?: (collection: Collection) => void;
}

/**
 * The Backdrop-native filter row: source pills, collection pills (+ manage
 * popover), and genre / tags / score dropdown pills — everything the legacy
 * sidebar offered, inline on the Library layout.
 */
export function LibraryFilters({
  visibleGames,
  onAddCollection,
  onEditCollection,
  onDeleteCollection,
}: LibraryFiltersProps) {
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const toggleSourceFilter = useUiStore((s) => s.toggleSourceFilter);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const toggleGenreFilter = useUiStore((s) => s.toggleGenreFilter);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  const collections = useCollectionStore((s) => s.collections);
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const setActiveCollectionId = useCollectionStore((s) => s.setActiveCollectionId);

  const allTags = useTagStore((s) => s.tags);
  const filterTags = useFilterStore((s) => s.tags);
  const toggleTag = useFilterStore((s) => s.toggleTag);
  const minCriticScore = useFilterStore((s) => s.minCriticScore);
  const maxCriticScore = useFilterStore((s) => s.maxCriticScore);
  const setCriticScoreRange = useFilterStore((s) => s.setCriticScoreRange);

  const activeSources = React.useMemo(() => {
    const set = new Set(visibleGames.map((g) => g.source));
    return Array.from(set) as GameSource[];
  }, [visibleGames]);

  const genres = React.useMemo(() => {
    const set = new Set<string>();
    visibleGames.forEach((g) =>
      (Array.isArray(g.genres) ? g.genres : []).forEach((genre) => set.add(genre)),
    );
    return Array.from(set).sort();
  }, [visibleGames]);

  const scoreActive = minCriticScore > 0 || maxCriticScore < 100;
  const anyActive =
    sourceFilter !== null ||
    genreFilter !== null ||
    activeCollectionId !== null ||
    filterTags.length > 0 ||
    scoreActive;

  return (
    <div
      data-testid="library-filters"
      className="flex flex-wrap items-center gap-1.5 pb-2"
    >
      {/* Sources */}
      {activeSources.map((source) => {
        const Icon = SOURCE_ICON_COMPONENTS[source];
        const count = visibleGames.filter((g) => g.source === source).length;
        return (
          <button
            key={source}
            data-testid={`source-filter-${source}`}
            className={pill(sourceFilter === source)}
            onClick={() => toggleSourceFilter(source)}
            title={SOURCE_LABELS[source]}
            aria-pressed={sourceFilter === source}
          >
            <Icon className="size-3" />
            <span className="opacity-70 normal-case">{count}</span>
          </button>
        );
      })}

      {(collections.length > 0 || onAddCollection) && (
        <span className="mx-1 h-4 w-px bg-foreground/10" aria-hidden />
      )}

      {/* Collections */}
      {collections.map((c) => (
        <button
          key={c.id}
          data-testid={`collection-pill-${c.id}`}
          className={pill(activeCollectionId === c.id)}
          onClick={() =>
            setActiveCollectionId(activeCollectionId === c.id ? null : c.id)
          }
          aria-pressed={activeCollectionId === c.id}
        >
          {c.icon && <span className="normal-case">{c.icon}</span>}
          {c.name}
        </button>
      ))}
      {onAddCollection && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              data-testid="collections-manage"
              className={pill(false)}
              title="Manage collections"
            >
              <Plus className="size-3" />
              Collection
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="backdrop-menu w-64 p-1.5">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
              onClick={onAddCollection}
            >
              <Plus className="size-3.5" />
              New collection
            </button>
            {collections.length > 0 && <div className="my-1.5 border-t border-border" />}
            {collections.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent">
                <span className="flex-1 truncate text-sm text-foreground">
                  {c.icon} {c.name}
                </span>
                <button
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => onEditCollection?.(c)}
                  aria-label={`Edit ${c.name}`}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteCollection?.(c)}
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}

      <span className="mx-1 h-4 w-px bg-foreground/10" aria-hidden />

      {/* Genre */}
      {genres.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button data-testid="genre-pill" className={pill(genreFilter !== null)}>
              Genre{genreFilter ? ` · ${genreFilter}` : ""}
              <ChevronDown className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="backdrop-menu max-h-72 w-56 overflow-y-auto p-1.5">
            {genres.map((name) => (
              <button
                key={name}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  genreFilter === name ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => toggleGenreFilter(name)}
              >
                {name}
                {genreFilter === name && <span className="ml-auto text-primary">✓</span>}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Tags */}
      {allTags.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button data-testid="tags-pill" className={pill(filterTags.length > 0)}>
              Tags{filterTags.length > 0 ? ` · ${filterTags.length}` : ""}
              <ChevronDown className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="backdrop-menu max-h-72 w-56 overflow-y-auto p-1.5">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                data-testid={`tag-filter-${tag.name}`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  filterTags.includes(tag.id) ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => toggleTag(tag.id)}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color || "#6B7280" }}
                />
                <span className="flex-1 truncate text-left">{tag.name}</span>
                <span className="text-xs tabular-nums">{tag.gameCount}</span>
                {filterTags.includes(tag.id) && <span className="text-primary">✓</span>}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Score */}
      <Popover>
        <PopoverTrigger asChild>
          <button data-testid="score-pill" className={pill(scoreActive)}>
            Score{scoreActive ? ` · ${minCriticScore}–${maxCriticScore}` : ""}
            <ChevronDown className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="backdrop-menu w-64 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Critic score
          </p>
          <ScoreRangeSlider
            min={minCriticScore}
            max={maxCriticScore}
            onChange={setCriticScoreRange}
          />
        </PopoverContent>
      </Popover>

      {/* Clear */}
      {anyActive && (
        <button
          data-testid="clear-filters-pill"
          className={pill(false, "border-transparent text-primary hover:text-primary")}
          onClick={() => {
            setSearchQuery("");
            useUiStore.getState().setSourceFilter(null);
            useUiStore.getState().setGenreFilter(null);
            setActiveCollectionId(null);
            useFilterStore.getState().clearAll();
          }}
        >
          <X className="size-3" />
          Clear
        </button>
      )}
    </div>
  );
}
