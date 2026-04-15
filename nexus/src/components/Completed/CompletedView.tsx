import * as React from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore, type Game, refreshGames } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { GameCard } from "@/components/GameCard";
import { Search, Trophy, ChevronDown, Eye, Circle } from "lucide-react";
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

export function CompletedView() {
  const games = useGameStore((s) => s.games);
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
        <section className="px-6 pt-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Completed
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

          {/* Card grid */}
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
              {sortedGames.map((game) => (
                <div key={game.id} onContextMenu={(e) => openContextMenu(e, game)}>
                  <GameCard game={game} />
                </div>
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
