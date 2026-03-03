import * as React from "react";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/stores/filterStore";
import { useGameStore, type GameSource, type GameStatus } from "@/stores/gameStore";
import { X } from "lucide-react";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam", epic: "Epic", gog: "GOG", ubisoft: "Ubisoft",
  battlenet: "B.net", xbox: "Xbox", standalone: "Local",
};

const STATUS_LABELS: Record<GameStatus, string> = {
  playing: "Playing", completed: "Completed", backlog: "Backlog",
  dropped: "Dropped", wishlist: "Wishlist", removed: "Removed", unset: "No Status",
};

const ALL_SOURCES: GameSource[] = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox", "standalone"];
const ALL_STATUSES: GameStatus[] = ["playing", "completed", "backlog", "dropped", "wishlist"];

interface FilterBarProps {
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({ totalCount, filteredCount }: FilterBarProps) {
  const filters = useFilterStore();
  const games = useGameStore((s) => s.games);

  const allGenres = React.useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => g.genres.forEach((genre) => set.add(genre)));
    return Array.from(set).sort();
  }, [games]);

  const [genreOpen, setGenreOpen] = React.useState(false);

  const activeChips = React.useMemo(() => {
    const chips: { type: string; value: string; label: string }[] = [];
    filters.sources.forEach((s) => chips.push({ type: "source", value: s, label: SOURCE_LABELS[s] }));
    filters.statuses.forEach((s) => chips.push({ type: "status", value: s, label: STATUS_LABELS[s] }));
    filters.genres.forEach((g) => chips.push({ type: "genre", value: g, label: g }));
    if (filters.minRating) chips.push({ type: "rating", value: "", label: `${filters.minRating}+ stars` });
    if (filters.maxPlayTimeH) chips.push({ type: "playTime", value: "", label: `<${filters.maxPlayTimeH}h` });
    if (filters.minCriticScore > 0 || filters.maxCriticScore < 100) {
      chips.push({ type: "criticScore", value: "", label: `Score ${filters.minCriticScore}–${filters.maxCriticScore}` });
    }
    return chips;
  }, [filters.sources, filters.statuses, filters.genres, filters.minRating, filters.maxPlayTimeH, filters.minCriticScore, filters.maxCriticScore]);

  const pillClass = (active: boolean) => cn(
    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
    active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  );

  return (
    <div data-testid="filter-bar" className="glass-filter flex flex-col gap-3 px-6 py-3">
      {/* Filter rows */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Source pills */}
        <span className="text-xs text-muted-foreground">Source:</span>
        {ALL_SOURCES.map((source) => (
          <button
            key={source}
            data-testid={`filter-source-${source}`}
            className={pillClass(filters.sources.includes(source))}
            onClick={() => filters.toggleSource(source)}
          >
            {SOURCE_LABELS[source]}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {/* Status pills */}
        <span className="text-xs text-muted-foreground">Status:</span>
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            data-testid={`filter-status-${status}`}
            className={pillClass(filters.statuses.includes(status))}
            onClick={() => filters.toggleStatus(status)}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {/* Genre dropdown */}
        <div className="relative">
          <button
            data-testid="filter-genre-trigger"
            className={cn(pillClass(filters.genres.length > 0))}
            onClick={() => setGenreOpen(!genreOpen)}
          >
            Genre {filters.genres.length > 0 && `(${filters.genres.length})`}
          </button>
          {genreOpen && (
            <div
              data-testid="filter-genre-dropdown"
              className="absolute left-0 top-full z-10 mt-1 max-h-48 w-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
            >
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  data-testid={`filter-genre-${genre}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs",
                    "hover:bg-accent",
                    filters.genres.includes(genre) && "bg-accent",
                  )}
                  onClick={() => filters.toggleGenre(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active chips + count */}
      {activeChips.length > 0 && (
        <div data-testid="filter-chips" className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip, i) => (
            <span
              key={`${chip.type}-${chip.value}-${i}`}
              data-testid={`filter-chip-${chip.type}-${chip.value}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary"
            >
              {chip.label}
              <button
                data-testid={`filter-chip-remove-${chip.type}-${chip.value}`}
                className="hover:text-primary/80"
                onClick={() => filters.removeFilter(chip.type, chip.value)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            data-testid="filter-clear-all"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={filters.clearAll}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Count */}
      <span data-testid="filter-count" className="text-xs text-muted-foreground">
        Showing {filteredCount} of {totalCount} games
      </span>
    </div>
  );
}
