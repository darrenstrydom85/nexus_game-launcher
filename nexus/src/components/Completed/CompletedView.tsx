import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn, formatPlayTime } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore, type Game, refreshGames } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { GameCard } from "@/components/GameCard";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  Search,
  Trophy,
  ChevronDown,
  Eye,
  Circle,
  Clock,
  Star,
  Gamepad2,
  Layers,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

type SortField = "name" | "totalPlayTime" | "rating" | "lastPlayed";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "totalPlayTime", label: "Most Played" },
  { value: "rating", label: "Rating" },
  { value: "lastPlayed", label: "Last Played" },
];

function sortGames(games: Game[], field: SortField, _dir: SortDir): Game[] {
  return [...games].sort((a, b) => {
    switch (field) {
      case "name":
        return a.name.localeCompare(b.name);
      case "totalPlayTime":
        return b.totalPlayTimeS - a.totalPlayTimeS;
      case "rating":
        return (b.rating ?? 0) - (a.rating ?? 0);
      case "lastPlayed":
        return (
          new Date(b.lastPlayedAt ?? 0).getTime() -
          new Date(a.lastPlayedAt ?? 0).getTime()
        );
      default:
        return 0;
    }
  });
}

/* ── Stats Banner ── */

interface CompletedStats {
  count: number;
  totalPlayTimeS: number;
  avgRating: number | null;
  topGenre: string | null;
}

function deriveStats(games: Game[]): CompletedStats {
  const totalPlayTimeS = games.reduce((sum, g) => sum + g.totalPlayTimeS, 0);

  const rated = games.filter((g) => g.rating != null && g.rating > 0);
  const avgRating =
    rated.length > 0
      ? rated.reduce((sum, g) => sum + g.rating!, 0) / rated.length
      : null;

  const genreCounts = new Map<string, number>();
  for (const g of games) {
    for (const genre of g.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  let topGenre: string | null = null;
  let topCount = 0;
  for (const [genre, count] of genreCounts) {
    if (count > topCount) {
      topCount = count;
      topGenre = genre;
    }
  }

  return { count: games.length, totalPlayTimeS, avgRating, topGenre };
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

function StatsBar({ stats }: { stats: CompletedStats }) {
  return (
    <div
      data-testid="completed-stats"
      className="grid grid-cols-2 gap-3 px-6 pt-6 sm:grid-cols-4"
    >
      <StatCard
        icon={<Trophy className="size-5" />}
        label="Games Completed"
        value={stats.count}
      />
      <StatCard
        icon={<Clock className="size-5" />}
        label="Total Play Time"
        value={formatPlayTime(stats.totalPlayTimeS)}
      />
      <StatCard
        icon={<Star className="size-5" />}
        label="Average Rating"
        value={
          stats.avgRating != null ? (
            <span className="flex items-center gap-1">
              {stats.avgRating.toFixed(1)}
              <Star className="size-4 fill-yellow-400 text-yellow-400" />
            </span>
          ) : (
            "—"
          )
        }
      />
      <StatCard
        icon={<Layers className="size-5" />}
        label="Top Genre"
        value={stats.topGenre ?? "—"}
      />
    </div>
  );
}

/* ── Spotlight Hero ── */

function SpotlightHero({ game }: { game: Game }) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const heroImage = game.heroUrl ?? game.coverUrl;
  const dominantColor = useDominantColor(heroImage);
  const shouldReduceMotion = useReducedMotion();

  if (!heroImage) return null;

  const useCoverFallback = !game.heroUrl && !!game.coverUrl;

  return (
    <button
      data-testid="completed-spotlight"
      className="group relative mx-6 mt-4 overflow-hidden rounded-xl border border-border"
      style={{ height: 220 }}
      onClick={() => setDetailOverlayGameId(game.id)}
    >
      {/* Dominant color ambient glow */}
      <div
        className="pointer-events-none absolute -inset-4 opacity-30 blur-3xl"
        style={{ background: dominantColor }}
      />

      {/* Hero / cover image */}
      <AnimatePresence mode="wait">
        <motion.img
          key={heroImage}
          src={heroImage}
          alt={game.name}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]",
            useCoverFallback && "blur-sm scale-110",
          )}
          style={{ filter: "brightness(0.35)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: "easeInOut" }}
        />
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-end p-6">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-primary">
          Most Played Completion
        </p>
        <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">
          {game.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Gamepad2 className="size-3.5" />
            {formatPlayTime(game.totalPlayTimeS)}
          </span>
          {game.rating != null && game.rating > 0 && (
            <span className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={cn(
                    "size-3.5",
                    s <= game.rating!
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground/40",
                  )}
                />
              ))}
            </span>
          )}
          {game.genres.length > 0 && (
            <span className="truncate text-xs">
              {game.genres.slice(0, 3).join(" / ")}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── Main View ── */

export function CompletedView() {
  const games = useGameStore((s) => s.games);
  const shouldReduceMotion = useReducedMotion();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortField, setSortField] = React.useState<SortField>("name");
  const [sortDir] = React.useState<SortDir>("asc");
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

  const completedGames = React.useMemo(
    () => games.filter((g) => g.completed),
    [games],
  );

  const stats = React.useMemo(
    () => deriveStats(completedGames),
    [completedGames],
  );

  const spotlightGame = React.useMemo(() => {
    if (completedGames.length === 0) return null;
    return [...completedGames].sort(
      (a, b) => b.totalPlayTimeS - a.totalPlayTimeS,
    )[0];
  }, [completedGames]);

  const searchFiltered = React.useMemo(() => {
    if (!searchQuery) return completedGames;
    const q = searchQuery.toLowerCase();
    return completedGames.filter((g) => g.name.toLowerCase().includes(q));
  }, [completedGames, searchQuery]);

  const sortedGames = React.useMemo(
    () => sortGames(searchFiltered, sortField, sortDir),
    [searchFiltered, sortField, sortDir],
  );

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortField)?.label ?? "Name";

  if (completedGames.length === 0) {
    return (
      <div
        data-testid="completed-empty"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center"
      >
        <div className="flex size-20 items-center justify-center rounded-full bg-secondary">
          <Trophy className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No completed games yet
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Mark games as completed from the library or archive to build your
          trophy shelf.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div data-testid="completed-view" className="flex flex-col">
        {/* Stats banner */}
        <StatsBar stats={stats} />

        {/* Spotlight hero */}
        {spotlightGame && <SpotlightHero game={spotlightGame} />}

        {/* Toolbar: heading + search + sort */}
        <section className="px-6 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Trophy Shelf
              </h2>
              <span className="text-sm tabular-nums text-muted-foreground">
                {completedGames.length} game
                {completedGames.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  data-testid="completed-search"
                  type="text"
                  placeholder="Search completed…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "h-8 w-48 rounded-md border border-border bg-secondary pl-8 pr-3 text-sm text-foreground",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                />
              </div>

              {/* Sort dropdown */}
              <div className="relative">
                <button
                  data-testid="completed-sort-trigger"
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
                    data-testid="completed-sort-menu"
                    className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-lg"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={cn(
                          "flex w-full items-center rounded-sm px-2 py-1.5 text-sm",
                          "hover:bg-accent hover:text-accent-foreground",
                          sortField === opt.value &&
                            "bg-accent text-accent-foreground",
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
            </div>
          </div>

          {/* Card grid with staggered entrance */}
          {sortedGames.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No games match your search.
            </p>
          ) : (
            <div
              data-testid="completed-grid"
              className="grid gap-4 pb-6"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              }}
            >
              {sortedGames.map((game, i) => (
                <motion.div
                  key={game.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.3, delay: Math.min(i * 0.03, 0.5), ease: "easeOut" }
                  }
                  onContextMenu={(e) => openContextMenu(e, game)}
                >
                  <GameCard game={game} />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {contextMenu && (
          <CompletedContextMenu
            game={contextMenu.game}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

/* ── Context menu ── */

interface CompletedContextMenuProps {
  game: Game;
  position: { x: number; y: number };
  onClose: () => void;
}

function CompletedContextMenu({ game, position, onClose }: CompletedContextMenuProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = React.useState(position);

  React.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let x = position.x;
    let y = position.y;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - pad - rect.width;
    if (x < pad) x = pad;
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - pad - rect.height;
    if (y < pad) y = pad;
    setAdjustedPos({ x, y });
  }, [position.x, position.y]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const unmarkCompleted = () => {
    invoke("update_game", {
      id: game.id,
      fields: { completed: false },
    })
      .then(() => refreshGames())
      .catch(() => {});
    onClose();
  };

  const itemClass = cn(
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
    "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
  );

  return (
    <div
      ref={menuRef}
      data-testid="completed-context-menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-lg"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      role="menu"
    >
      <button className={itemClass} role="menuitem" onClick={() => { setDetailOverlayGameId(game.id); onClose(); }}>
        <Eye className="size-4" />
        View Details
      </button>

      <div className="my-1 border-t border-border" />

      <button className={itemClass} role="menuitem" onClick={unmarkCompleted}>
        <Circle className="size-4" />
        Unmark Completed
      </button>
    </div>
  );
}
