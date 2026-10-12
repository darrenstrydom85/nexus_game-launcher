import * as React from "react";
import { Search } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { Game } from "@/stores/gameStore";
import type { ViewMode } from "@/stores/uiStore";
import { deriveStats } from "@/components/Completed/CompletedView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GameMenuHandlers } from "./GameMenuItems";
import { GameGridView } from "./GameGridView";

type CompletedSort = "name" | "playTime" | "rating" | "lastPlayed";

const SORTS: { value: CompletedSort; label: string }[] = [
  { value: "lastPlayed", label: "Last played" },
  { value: "name", label: "Name" },
  { value: "playTime", label: "Most played" },
  { value: "rating", label: "Your rating" },
];

function sortCompleted(games: Game[], by: CompletedSort): Game[] {
  const out = [...games];
  out.sort((a, b) => {
    if (by === "name") return a.name.localeCompare(b.name);
    if (by === "playTime") return b.totalPlayTimeS - a.totalPlayTimeS;
    if (by === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
    return new Date(b.lastPlayedAt ?? 0).getTime() - new Date(a.lastPlayedAt ?? 0).getTime();
  });
  return out;
}

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted-foreground">Unrated</span>;
  return (
    <span role="img" aria-label={`Rated ${rating} out of 5`} className="tracking-[0.1em] text-yellow-500">
      {"★".repeat(rating)}
      <span className="text-muted-foreground/40">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

interface CompletedTabProps extends GameMenuHandlers {
  /** Every visible game; completion is the `completed` flag, so archived games count too. */
  games: Game[];
  viewMode: ViewMode;
  selectedId: string | null;
  onOpen: (gameId: string) => void;
  onOpenFull: (gameId: string) => void;
  onListChange: (ids: string[]) => void;
}

export function CompletedTab({ games, onListChange, ...grid }: CompletedTabProps) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<CompletedSort>("lastPlayed");

  const completed = React.useMemo(() => games.filter((g) => g.completed), [games]);
  const stats = React.useMemo(() => deriveStats(completed), [completed]);
  const featured = React.useMemo(
    () =>
      [...completed]
        .filter((g) => g.heroUrl || g.coverUrl)
        .sort((a, b) => b.totalPlayTimeS - a.totalPlayTimeS)[0] ?? null,
    [completed],
  );
  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCompleted(q ? completed.filter((g) => g.name.toLowerCase().includes(q)) : completed, sort);
  }, [completed, query, sort]);

  React.useEffect(() => onListChange(shown.map((g) => g.id)), [shown, onListChange]);

  if (completed.length === 0) {
    return (
      <EmptyState
        title="Nothing completed yet"
        body="Mark a game Completed from its menu or quick view and it lands here, with its rating and play time."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        <Stat label="Games completed" value={String(stats.count)} />
        <Stat label="Time to complete" value={formatPlayTime(stats.totalPlayTimeS)} />
        <Stat label="Average rating" value={stats.avgRating != null ? `${stats.avgRating.toFixed(1)} / 5` : "—"} />
        <Stat label="Top genre" value={stats.topGenre ?? "—"} />
      </dl>

      {featured && (
        <section
          aria-label="Most played completion"
          className="img-outline relative flex h-48 items-end overflow-hidden rounded-2xl bg-secondary"
        >
          <img
            src={featured.heroUrl ?? featured.coverUrl ?? undefined}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/50 to-transparent" />
          <div className="relative flex w-full flex-wrap items-end justify-between gap-4 p-6">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Most played completion</span>
              <h2 className="truncate text-2xl font-bold leading-tight tracking-tight text-foreground">{featured.name}</h2>
              <span className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Stars rating={featured.rating} />
                <span>{formatPlayTime(featured.totalPlayTimeS)}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => grid.onOpen(featured.id)}
              className="pressable h-10 rounded-lg border border-foreground/15 bg-foreground/10 px-4 text-sm font-semibold text-foreground outline-none hover:bg-foreground/15 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Quick view
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-9 w-60 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="sr-only">Search completed games</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search completed"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Select value={sort} onValueChange={(v) => setSort(v as CompletedSort)}>
          <SelectTrigger aria-label="Sort completed games" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No matches" body={`No completed game matches "${query}".`} />
      ) : (
        <GameGridView
          games={shown}
          metaFor={(g) => (
            <>
              <Stars rating={g.rating} />
              <span className="ml-auto tabular-nums">{g.totalPlayTimeS > 0 ? formatPlayTime(g.totalPlayTimeS) : ""}</span>
            </>
          )}
          {...grid}
        />
      )}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xl font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
