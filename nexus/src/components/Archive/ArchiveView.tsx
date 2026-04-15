import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore, type Game, refreshGames } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { Search, Archive, ChevronDown, Eye, CheckCircle2, Circle } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

type SortField = "name" | "totalPlayTime" | "rating" | "lastPlayed";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<string, string> = {
  playing: "Playing",
  completed: "Completed",
  backlog: "Backlog",
  dropped: "Dropped",
  wishlist: "Wishlist",
  removed: "Removed",
  unset: "No Status",
};

const STATUS_COLORS: Record<string, string> = {
  playing: "bg-success",
  completed: "bg-primary",
  backlog: "bg-warning",
  dropped: "bg-destructive",
  wishlist: "bg-info",
  removed: "bg-muted-foreground",
  unset: "bg-muted-foreground",
};

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

export function ArchiveView() {
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

  const archivedGames = React.useMemo(
    () => games.filter((g) => g.status === "removed"),
    [games],
  );

  const searchFiltered = React.useMemo(() => {
    if (!searchQuery) return archivedGames;
    const q = searchQuery.toLowerCase();
    return archivedGames.filter((g) => g.name.toLowerCase().includes(q));
  }, [archivedGames, searchQuery]);

  const sortedTableGames = React.useMemo(
    () => sortGames(searchFiltered, sortField, sortDir),
    [searchFiltered, sortField, sortDir],
  );

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortField)?.label ?? "Name";

  if (archivedGames.length === 0) {
    return (
      <div
        data-testid="archive-empty"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center"
      >
        <div className="flex size-20 items-center justify-center rounded-full bg-secondary">
          <Archive className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No archived games yet
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Games you uninstall will appear here after syncing your library. Mark
          them as completed to build your trophy shelf.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div data-testid="archive-view" className="flex flex-col">
        {/* All archived games table */}
        <section data-testid="archive-all-section" className="px-6 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                All Archived Games
              </h2>
              <span className="text-sm tabular-nums text-muted-foreground">
                {archivedGames.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  data-testid="archive-search"
                  type="text"
                  placeholder="Search archive…"
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
                  data-testid="archive-sort-trigger"
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
                    data-testid="archive-sort-menu"
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

          {/* Table */}
          {sortedTableGames.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No games match your search.
            </p>
          ) : (
            <div
              data-testid="archive-table"
              className="flex flex-col pb-6"
            >
              {/* Table header */}
              <div className="flex items-center gap-4 border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span className="w-10 shrink-0" />
                <span className="flex-1">Name</span>
                <span className="w-20 text-right">Play Time</span>
                <span className="w-24 text-center">Status</span>
                <span className="w-16 text-center">Rating</span>
                <span className="w-20 text-right">Source</span>
              </div>

              {sortedTableGames.map((game) => (
                <ArchiveTableRow key={game.id} game={game} onContextMenu={(e) => openContextMenu(e, game)} />
              ))}
            </div>
          )}
        </section>

        {contextMenu && (
          <ArchiveContextMenu
            game={contextMenu.game}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

const SOURCE_SHORT: Record<string, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Local",
};

function ArchiveTableRow({ game, onContextMenu }: { game: Game; onContextMenu?: (e: React.MouseEvent) => void }) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);

  const displayStatus = game.completed ? "completed" : "removed";

  return (
    <div
      data-testid={`archive-row-${game.id}`}
      className={cn(
        "group flex items-center gap-4 border-b border-border px-3 py-2",
        "cursor-pointer transition-colors hover:bg-accent/50",
      )}
      onClick={() => setDetailOverlayGameId(game.id)}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setDetailOverlayGameId(game.id);
        }
      }}
    >
      {/* Thumbnail */}
      <div className="size-10 shrink-0 overflow-hidden rounded">
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt={game.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
      </div>

      {/* Name */}
      <span className="flex-1 truncate text-sm font-medium text-foreground">
        {game.name}
      </span>

      {/* Play time */}
      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
        {game.totalPlayTimeS > 0 ? formatPlayTime(game.totalPlayTimeS) : "—"}
      </span>

      {/* Status badge */}
      <span className="flex w-24 items-center justify-center gap-1.5">
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            STATUS_COLORS[displayStatus],
          )}
        />
        <span className="text-xs text-muted-foreground">
          {STATUS_LABELS[displayStatus]}
        </span>
      </span>

      {/* Rating */}
      <span className="w-16 text-center text-xs tabular-nums text-muted-foreground">
        {game.rating ? `${game.rating}/5` : "—"}
      </span>

      {/* Source */}
      <span className="w-20 text-right text-xs text-muted-foreground">
        {SOURCE_SHORT[game.source] ?? game.source}
      </span>
    </div>
  );
}

/* ── Archive-specific context menu ── */

interface ArchiveContextMenuProps {
  game: Game;
  position: { x: number; y: number };
  onClose: () => void;
}

function ArchiveContextMenu({ game, position, onClose }: ArchiveContextMenuProps) {
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

  const toggleCompleted = () => {
    invoke("update_game", {
      id: game.id,
      fields: { completed: !game.completed },
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
      data-testid="archive-context-menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-lg"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      role="menu"
    >
      <button className={itemClass} role="menuitem" onClick={() => { setDetailOverlayGameId(game.id); onClose(); }}>
        <Eye className="size-4" />
        View Details
      </button>

      <div className="my-1 border-t border-border" />

      <button className={itemClass} role="menuitem" onClick={toggleCompleted}>
        {game.completed ? (
          <>
            <Circle className="size-4" />
            Unmark Completed
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4" />
            Mark as Completed
          </>
        )}
      </button>
    </div>
  );
}
