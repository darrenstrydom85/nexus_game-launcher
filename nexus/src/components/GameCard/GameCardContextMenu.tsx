import * as React from "react";
import { cn } from "@/lib/utils";
import type { Game, GameStatus } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import {
  Play,
  Eye,
  Star,
  FolderOpen,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  ImagePlus,
  Loader2,
  ListPlus,
  ListMinus,
} from "lucide-react";
import { useQueueStore } from "@/stores/queueStore";

const STATUSES: { value: GameStatus; label: string }[] = [
  { value: "playing", label: "Playing" },
  { value: "completed", label: "Completed" },
  { value: "backlog", label: "Backlog" },
  { value: "dropped", label: "Dropped" },
  { value: "wishlist", label: "Wishlist" },
];

export interface GameContextMenuHandlers {
  onPlay?: (game: Game) => void;
  onSetStatus?: (gameId: string, status: GameStatus) => void;
  onSetRating?: (gameId: string, rating: number | null) => void;
  onAddToCollection?: (gameId: string, collection: string) => void;
  onEdit?: (game: Game) => void;
  onRefetchMetadata?: (game: Game) => Promise<void> | void;
  onSearchMetadata?: (game: Game) => void;
  onHide?: (game: Game) => void;
  onOpenFolder?: (game: Game) => void;
  collections?: string[];
}

interface GameCardContextMenuProps extends GameContextMenuHandlers {
  game: Game;
  position: { x: number; y: number };
  onClose: () => void;
  isRefetching?: boolean;
}

export function GameCardContextMenu({
  game,
  position,
  onClose,
  onPlay,
  onSetStatus,
  onSetRating,
  onAddToCollection,
  onEdit,
  onRefetchMetadata,
  onSearchMetadata,
  onHide,
  onOpenFolder,
  collections = [],
  isRefetching = false,
}: GameCardContextMenuProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const addToast = useToastStore((s) => s.addToast);
  const isQueued = useQueueStore((s) => s.isQueued(game.id));
  const queueAdd = useQueueStore((s) => s.add);
  const queueRemove = useQueueStore((s) => s.remove);
  const [refetching, setRefetching] = React.useState(false);
  const busy = isRefetching || refetching;
  const [subMenu, setSubMenu] = React.useState<
    "status" | "rating" | "collection" | null
  >(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = React.useState(position);
  const [flipSub, setFlipSub] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;

    if (x + rect.width > vw - pad) x = vw - pad - rect.width;
    if (x < pad) x = pad;
    if (y + rect.height > vh - pad) y = vh - pad - rect.height;
    if (y < pad) y = pad;

    setFlipSub(x + rect.width + 148 > vw - pad);
    setAdjustedPos({ x, y });
  }, [position.x, position.y]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
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

  const menuItemClass = cn(
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
    "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
  );

  return (
    <div
      ref={menuRef}
      data-testid="game-context-menu"
      className="fixed z-50 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-lg"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      role="menu"
    >
      {/* Play */}
      <button
        data-testid="ctx-play"
        className={menuItemClass}
        role="menuitem"
        onClick={() => {
          onPlay?.(game);
          onClose();
        }}
      >
        <Play className="size-4" />
        Play
      </button>

      {/* View Details */}
      <button
        data-testid="ctx-details"
        className={menuItemClass}
        role="menuitem"
        onClick={() => {
          setDetailOverlayGameId(game.id);
          onClose();
        }}
      >
        <Eye className="size-4" />
        View Details
      </button>

      <div className="my-1 border-t border-border" />

      {/* Set Status */}
      <div className="relative">
        <button
          data-testid="ctx-status"
          className={menuItemClass}
          role="menuitem"
          onMouseEnter={() => setSubMenu("status")}
        >
          Set Status
          <span className="ml-auto text-xs text-muted-foreground">{flipSub ? "◂" : "▸"}</span>
        </button>
        {subMenu === "status" && (
          <div
            data-testid="ctx-status-submenu"
            className={cn(
              "absolute top-0 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg",
              flipSub ? "right-full mr-1" : "left-full ml-1",
            )}
            role="menu"
          >
            {STATUSES.map((s) => (
              <button
                key={s.value}
                data-testid={`ctx-status-${s.value}`}
                className={cn(
                  menuItemClass,
                  game.status === s.value && "bg-accent",
                )}
                role="menuitem"
                onClick={() => {
                  onSetStatus?.(game.id, s.value);
                  onClose();
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rate */}
      <div className="relative">
        <button
          data-testid="ctx-rate"
          className={menuItemClass}
          role="menuitem"
          onMouseEnter={() => setSubMenu("rating")}
        >
          <Star className="size-4" />
          Rate
          <span className="ml-auto text-xs text-muted-foreground">{flipSub ? "◂" : "▸"}</span>
        </button>
        {subMenu === "rating" && (
          <div
            data-testid="ctx-rating-submenu"
            className={cn(
              "absolute top-0 min-w-[120px] rounded-md border border-border bg-popover p-1 shadow-lg",
              flipSub ? "right-full mr-1" : "left-full ml-1",
            )}
            role="menu"
          >
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                data-testid={`ctx-rate-${r}`}
                className={cn(
                  menuItemClass,
                  game.rating === r && "bg-accent",
                )}
                role="menuitem"
                onClick={() => {
                  onSetRating?.(game.id, r);
                  onClose();
                }}
              >
                {"★".repeat(r)}{"☆".repeat(5 - r)}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              data-testid="ctx-rate-clear"
              className={menuItemClass}
              role="menuitem"
              onClick={() => {
                onSetRating?.(game.id, null);
                onClose();
              }}
            >
              Clear rating
            </button>
          </div>
        )}
      </div>

      {/* Add to Collection */}
      <div className="relative">
        <button
          data-testid="ctx-collection"
          className={menuItemClass}
          role="menuitem"
          onMouseEnter={() => setSubMenu("collection")}
        >
          <Plus className="size-4" />
          Add to Collection
          <span className="ml-auto text-xs text-muted-foreground">{flipSub ? "◂" : "▸"}</span>
        </button>
        {subMenu === "collection" && (
          <div
            data-testid="ctx-collection-submenu"
            className={cn(
              "absolute top-0 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg",
              flipSub ? "right-full mr-1" : "left-full ml-1",
            )}
            role="menu"
          >
            {collections.map((c) => (
              <button
                key={c}
                data-testid={`ctx-collection-${c}`}
                className={menuItemClass}
                role="menuitem"
                onClick={() => {
                  onAddToCollection?.(game.id, c);
                  onClose();
                }}
              >
                {c}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              data-testid="ctx-collection-new"
              className={menuItemClass}
              role="menuitem"
              onClick={() => {
                onAddToCollection?.(game.id, "__new__");
                onClose();
              }}
            >
              <Plus className="size-3" />
              Add New
            </button>
          </div>
        )}
      </div>

      {/* Add to / Remove from Queue */}
      <button
        data-testid={isQueued ? "ctx-remove-queue" : "ctx-add-queue"}
        className={menuItemClass}
        role="menuitem"
        onClick={() => {
          if (isQueued) {
            queueRemove(game.id, game.name);
          } else {
            queueAdd(game.id, game.name);
          }
          onClose();
        }}
      >
        {isQueued ? (
          <>
            <ListMinus className="size-4" />
            Remove from Queue
          </>
        ) : (
          <>
            <ListPlus className="size-4" />
            Add to Queue
          </>
        )}
      </button>

      <div className="my-1 border-t border-border" />

      {/* Update Artwork / Choose artwork */}
      <button
        data-testid="ctx-update-artwork"
        className={cn(menuItemClass, busy && "pointer-events-none opacity-60")}
        role="menuitem"
        onClick={() => {
          onSearchMetadata?.(game);
          onClose();
        }}
        disabled={busy}
      >
        <ImagePlus className="size-4" />
        Update Artwork
      </button>

      {/* Re-fetch Metadata */}
      <button
        data-testid="ctx-refetch-metadata"
        className={cn(menuItemClass, busy && "pointer-events-none opacity-60")}
        role="menuitem"
        onClick={async () => {
          setRefetching(true);
          try {
            await onRefetchMetadata?.(game);
          } finally {
            setRefetching(false);
          }
          onClose();
        }}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {busy ? "Fetching…" : "Re-fetch Metadata"}
      </button>

      {/* Edit Game */}
      <button
        data-testid="ctx-edit"
        className={menuItemClass}
        role="menuitem"
        onClick={() => {
          onEdit?.(game);
          onClose();
        }}
      >
        <Pencil className="size-4" />
        Edit Game
      </button>

      {/* Hide from Library */}
      <button
        data-testid="ctx-hide"
        className={menuItemClass}
        role="menuitem"
        onClick={() => {
          onHide?.(game);
          addToast({
            type: "info",
            message: `"${game.name}" hidden from library`,
            action: {
              label: "Undo",
              onClick: () => {
                /* undo logic handled by parent */
              },
            },
          });
          onClose();
        }}
      >
        <EyeOff className="size-4" />
        Hide from Library
      </button>

      {/* Open Install Folder */}
      {game.folderPath && (
        <button
          data-testid="ctx-open-folder"
          className={menuItemClass}
          role="menuitem"
          onClick={() => {
            onOpenFolder?.(game);
            onClose();
          }}
        >
          <FolderOpen className="size-4" />
          Open Install Folder
        </button>
      )}
    </div>
  );
}
