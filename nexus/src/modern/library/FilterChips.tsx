import * as React from "react";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Game, GameSource, GameStatus } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useFilterStore } from "@/stores/filterStore";
import { useTagStore } from "@/stores/tagStore";
import type { MasteryTierValue } from "@/lib/tauri";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { STATUS_OPTIONS } from "./GameMenuItems";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

const TIERS: { value: MasteryTierValue; label: string; color: string }[] = [
  { value: "diamond", label: "Diamond", color: "var(--tier-diamond)" },
  { value: "platinum", label: "Platinum", color: "var(--tier-platinum)" },
  { value: "gold", label: "Gold", color: "var(--tier-gold)" },
  { value: "silver", label: "Silver", color: "var(--tier-silver)" },
  { value: "bronze", label: "Bronze", color: "var(--tier-bronze)" },
  { value: "none", label: "No tier yet", color: "var(--muted-foreground)" },
];

interface FilterChipsProps {
  /** Games the counts are computed from (visible library). */
  games: Game[];
  tierOf: (gameId: string) => MasteryTierValue;
}

export function FilterChips({ games, tierOf }: FilterChipsProps) {
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const statuses = useFilterStore((s) => s.statuses);
  const tagIds = useFilterStore((s) => s.tags);
  const tiers = useFilterStore((s) => s.tiers);
  const minScore = useFilterStore((s) => s.minCriticScore);
  const maxScore = useFilterStore((s) => s.maxCriticScore);
  const allTags = useTagStore((s) => s.tags);

  const counts = React.useMemo(() => {
    const source = new Map<string, number>();
    const genre = new Map<string, number>();
    const status = new Map<string, number>();
    const tier = new Map<string, number>();
    for (const g of games) {
      source.set(g.source, (source.get(g.source) ?? 0) + 1);
      status.set(g.status, (status.get(g.status) ?? 0) + 1);
      for (const gen of Array.isArray(g.genres) ? g.genres : []) genre.set(gen, (genre.get(gen) ?? 0) + 1);
      const t = tierOf(g.id);
      tier.set(t, (tier.get(t) ?? 0) + 1);
    }
    return { source, genre, status, tier };
  }, [games, tierOf]);

  const genres = React.useMemo(
    () => [...counts.genre.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [counts.genre],
  );
  const scoreActive = minScore > 0 || maxScore < 100;
  const anyActive =
    !!sourceFilter || !!genreFilter || statuses.length > 0 || tagIds.length > 0 || tiers.length > 0 || scoreActive;

  const ui = useUiStore.getState();
  const fs = useFilterStore.getState();
  const tagName = (id: string) => allTags.find((t) => t.id === id)?.name ?? "Tag";

  return (
    <div data-testid="filter-chips" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <SlidersHorizontal className="size-[15px]" strokeWidth={1.5} />
        Filter
      </span>

      <Chip
        id="source"
        label="Source"
        value={sourceFilter ? SOURCE_LABELS[sourceFilter as GameSource] ?? sourceFilter : null}
        onClear={() => ui.setSourceFilter(null)}
      >
        {[...counts.source.entries()].map(([src, n]) => (
          <Option
            key={src}
            selected={sourceFilter === src}
            onSelect={() => ui.toggleSourceFilter(src)}
            count={n}
            testId={`filter-source-${src}`}
          >
            {SOURCE_LABELS[src as GameSource] ?? src}
          </Option>
        ))}
      </Chip>

      <Chip
        id="status"
        label="Status"
        value={statuses.length === 0 ? null : statuses.length === 1 ? label(statuses[0]) : `${statuses.length} selected`}
        onClear={() => statuses.forEach((s) => fs.toggleStatus(s))}
      >
        {STATUS_OPTIONS.map((s) => (
          <Option
            key={s.value}
            selected={statuses.includes(s.value)}
            onSelect={() => fs.toggleStatus(s.value)}
            count={counts.status.get(s.value) ?? 0}
            testId={`filter-status-${s.value}`}
          >
            {s.label}
          </Option>
        ))}
      </Chip>

      {genres.length > 0 && (
        <Chip id="genre" label="Genre" value={genreFilter} onClear={() => ui.setGenreFilter(null)} scroll>
          {genres.map(([gen, n]) => (
            <Option key={gen} selected={genreFilter === gen} onSelect={() => ui.toggleGenreFilter(gen)} count={n}>
              {gen}
            </Option>
          ))}
        </Chip>
      )}

      {allTags.length > 0 && (
        <Chip
          id="tags"
          label="Tags"
          value={tagIds.length === 0 ? null : tagIds.length === 1 ? tagName(tagIds[0]) : `${tagIds.length} selected`}
          onClear={() => tagIds.forEach((t) => fs.toggleTag(t))}
          scroll
        >
          {allTags.map((t) => (
            <Option key={t.id} selected={tagIds.includes(t.id)} onSelect={() => fs.toggleTag(t.id)}>
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color || "#6B7280" }} />
              {t.name}
            </Option>
          ))}
        </Chip>
      )}

      <Chip
        id="score"
        label="Critic score"
        value={scoreActive ? `${minScore}–${maxScore}` : null}
        onClear={() => fs.setCriticScoreRange(0, 100)}
      >
        <div className="flex w-56 flex-col gap-3 p-2">
          <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{minScore}</span>
            <span>{maxScore}</span>
          </div>
          <Slider
            value={[minScore, maxScore]}
            min={0}
            max={100}
            step={1}
            minStepsBetweenThumbs={1}
            onValueChange={([a, b]) => fs.setCriticScoreRange(a, b)}
            thumbLabels={["Minimum critic score", "Maximum critic score"]}
          />
          <p className="text-xs text-muted-foreground">Games without a score are hidden while this is set.</p>
        </div>
      </Chip>

      <Chip
        id="mastery"
        label="Mastery"
        value={tiers.length === 0 ? null : tiers.length === 1 ? TIERS.find((t) => t.value === tiers[0])?.label ?? null : `${tiers.length} selected`}
        onClear={() => tiers.forEach((t) => fs.toggleTier(t))}
      >
        {TIERS.map((t) => (
          <Option
            key={t.value}
            selected={tiers.includes(t.value)}
            onSelect={() => fs.toggleTier(t.value)}
            count={counts.tier.get(t.value) ?? 0}
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
            {t.label}
          </Option>
        ))}
      </Chip>

      {anyActive && (
        <button
          type="button"
          data-testid="filter-clear-all"
          onClick={() => {
            ui.setSourceFilter(null);
            ui.setGenreFilter(null);
            fs.clearAll();
          }}
          className="pressable h-8 rounded-full px-3 text-[13px] font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function label(status: GameStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

function Chip({
  id,
  label,
  value,
  onClear,
  scroll,
  children,
}: {
  id: string;
  label: string;
  value: string | null;
  onClear: () => void;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const active = value !== null;
  return (
    <div
      className={cn(
        "flex h-8 items-center rounded-full border text-[13px] font-medium",
        active ? "border-primary/40 bg-primary/10 text-foreground" : "border-input bg-background/60 text-muted-foreground",
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`filter-chip-${id}`}
            className={cn(
              "pressable flex h-full items-center gap-1.5 rounded-full pl-3 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              active ? "pr-1.5" : "pr-2.5",
            )}
          >
            {active ? (
              <>
                <span className="text-muted-foreground">{label}:</span>
                <span className="max-w-[140px] truncate">{value}</span>
              </>
            ) : (
              label
            )}
            {!active && <ChevronDown className="size-3.5" strokeWidth={2} />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn("z-50 w-auto min-w-[200px] p-1", scroll && "max-h-[320px] overflow-y-auto")}
        >
          {children}
        </PopoverContent>
      </Popover>
      {active && (
        <button
          type="button"
          aria-label={`Clear ${label} filter`}
          data-testid={`filter-chip-${id}-clear`}
          onClick={onClear}
          className="pressable mr-1 flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function Option({
  selected,
  onSelect,
  count,
  testId,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  count?: number;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={testId}
      onClick={onSelect}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {selected && <Check className="size-3.5 text-primary" strokeWidth={2} />}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
    </button>
  );
}
