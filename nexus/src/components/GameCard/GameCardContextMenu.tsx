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
} from "lucide-react";

const STATUSES: { value: GameStatus; label: string }[] = [
  { value: "playing", label: "Playing" },
  { value: "completed", label: "Completed" },
  { value: "backlog", label: "Backlog" },
  { value: "dropped", label: "Dropped" },
  { value: "wishlist", label: "Wishlist" },
];

interface GameCardContextMenuProps {
  game: Game;
  position: { x: number; y: number };
  onClose: () => void;
  onPlay?: (game: Game) => void;
  onSetStatus?: (gameId: string, status: GameStatus) => void;
  onSetRating?: (gameId: string, rating: number | null) => void;
  onAddToCollection?: (gameId: string, collection: string) => void;
  onEdit?: (game: Game) => void;
  onHide?: (game: Game) => void;
  onOpenFolder?: (game: Game) => void;
  collections?: string[];
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
  onHide,
  onOpenFolder,
  collections = [],
}: GameCardContextMenuProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const addToast = useToastStore((s) => s.addToast);
  const [subMenu, setSubMenu] = React.useState<
    "status" | "rating" | "collection" | null
  >(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

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
      style={{ left: position.x, top: position.y }}
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
          <span className="ml-auto text-xs text-muted-foreground">▸</span>
        </button>
        {subMenu === "status" && (
          <div
            data-testid="ctx-status-submenu"
            className="absolute left-full top-0 ml-1 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg"
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
          <span className="ml-auto text-xs text-muted-foreground">▸</span>
        </button>
        {subMenu === "rating" && (
          <div
            data-testid="ctx-rating-submenu"
            className="absolute left-full top-0 ml-1 min-w-[120px] rounded-md border border-border bg-popover p-1 shadow-lg"
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
          <span className="ml-auto text-xs text-muted-foreground">▸</span>
        </button>
        {subMenu === "collection" && (
          <div
            data-testid="ctx-collection-submenu"
            className="absolute left-full top-0 ml-1 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg"
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
              New Collection
            </button>
          </div>
        )}
      </div>

      <div className="my-1 border-t border-border" />

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
