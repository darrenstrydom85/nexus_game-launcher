import * as React from "react";
import { cn } from "@/lib/utils";
import type { Game, GameStatus } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import {
  Play,
  Loader2,
  Star,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Pencil,
  RefreshCw,
  FolderOpen,
  EyeOff,
  ImagePlus,
  Crosshair,
} from "lucide-react";

const STATUSES: { value: GameStatus; label: string; color: string }[] = [
  { value: "playing", label: "Playing", color: "bg-success" },
  { value: "completed", label: "Completed", color: "bg-primary" },
  { value: "backlog", label: "Backlog", color: "bg-warning" },
  { value: "dropped", label: "Dropped", color: "bg-destructive" },
  { value: "wishlist", label: "Wishlist", color: "bg-info" },
  { value: "unset", label: "No Status", color: "bg-muted-foreground" },
];

interface ActionBarProps {
  game: Game;
  isPlaying?: boolean;
  processDetected?: boolean;
  onPlay?: () => void;
  onForceIdentify?: () => void;
  onStatusChange?: (status: GameStatus) => void;
  onRatingChange?: (rating: number | null) => void;
  onAddToCollection?: () => void;
  onEdit?: () => void;
  onRefetchMetadata?: () => Promise<void> | void;
  onSearchMetadata?: () => void;
  onOpenFolder?: () => void;
  onHide?: () => void;
}

export function ActionBar({
  game,
  isPlaying = false,
  processDetected = false,
  onPlay,
  onForceIdentify,
  onStatusChange,
  onRatingChange,
  onAddToCollection,
  onEdit,
  onRefetchMetadata,
  onSearchMetadata,
  onOpenFolder,
  onHide,
}: ActionBarProps) {
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [hoveredStar, setHoveredStar] = React.useState(0);
  const [isRefetching, setIsRefetching] = React.useState(false);

  const currentStatus = STATUSES.find((s) => s.value === game.status) ?? STATUSES[5];

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onPlay?.();
      } else if (e.key >= "1" && e.key <= "5") {
        const rating = parseInt(e.key);
        onRatingChange?.(game.rating === rating ? null : rating);
      } else if (e.key === "s" || e.key === "S") {
        const currentIdx = STATUSES.findIndex((s) => s.value === game.status);
        const nextIdx = (currentIdx + 1) % STATUSES.length;
        onStatusChange?.(STATUSES[nextIdx].value);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [game.status, game.rating, onPlay, onStatusChange, onRatingChange]);

  const menuItemClass = cn(
    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
    "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
  );

  return (
    <div
      data-testid="action-bar"
      className="flex items-center gap-3 border-b border-border px-6 py-3"
    >
      {/* Play button */}
      <Button
        data-testid="action-play"
        className="gap-2 shadow-lg shadow-primary/25"
        disabled={isPlaying}
        onClick={onPlay}
      >
        {isPlaying ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Playing...
          </>
        ) : (
          <>
            <Play className="size-4" />
            Play
          </>
        )}
      </Button>

      {isPlaying && !processDetected && (
        <button
          data-testid="action-force-identify"
          className={cn(
            "inline-flex items-center gap-1.5 text-sm transition-colors duration-200",
            "text-muted-foreground hover:text-foreground",
          )}
          onClick={onForceIdentify}
          aria-label="Identify game process"
        >
          <Crosshair className="size-4" />
          Can&apos;t find game?
        </button>
      )}

      {/* Status dropdown */}
      <div className="relative">
        <button
          data-testid="action-status"
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
          onClick={() => setStatusOpen(!statusOpen)}
        >
          <span className={cn("size-2 rounded-full", currentStatus.color)} />
          {currentStatus.label}
          <ChevronDown className="size-3.5" />
        </button>
        {statusOpen && (
          <div
            data-testid="action-status-menu"
            className="absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-lg"
          >
            {STATUSES.map((s) => (
              <button
                key={s.value}
                data-testid={`action-status-${s.value}`}
                className={cn(menuItemClass, game.status === s.value && "bg-accent")}
                onClick={() => {
                  onStatusChange?.(s.value);
                  setStatusOpen(false);
                }}
              >
                <span className={cn("size-2 rounded-full", s.color)} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rating stars */}
      <div data-testid="action-rating" className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            data-testid={`action-star-${star}`}
            className="p-0.5 transition-colors"
            onMouseEnter={() => setHoveredStar(star)}
            onMouseLeave={() => setHoveredStar(0)}
            onClick={() => onRatingChange?.(game.rating === star ? null : star)}
            aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "size-5",
                (hoveredStar ? star <= hoveredStar : star <= (game.rating ?? 0))
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Refetch indicator — visible in bar while loading */}
      {isRefetching && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Fetching metadata…
        </div>
      )}

      {/* Update Artwork — dedicated entry point for metadata/artwork search */}
      <Button
        data-testid="action-update-artwork"
        variant="secondary"
        size="sm"
        className="gap-2"
        onClick={onSearchMetadata}
        aria-label="Update artwork"
      >
        <ImagePlus className="size-4" />
        Update Artwork
      </Button>

      {/* More actions */}
      <div className="relative">
        <button
          data-testid="action-more"
          className={cn(
            "flex size-9 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={() => setMoreOpen(!moreOpen)}
          aria-label="More actions"
        >
          {isRefetching ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <MoreHorizontal className="size-5" />
          )}
        </button>
        {moreOpen && (
          <div
            data-testid="action-more-menu"
            className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-lg"
          >
            <button data-testid="action-add-collection" className={menuItemClass} onClick={() => { onAddToCollection?.(); setMoreOpen(false); }}>
              <Plus className="size-4" /> Add to Collection
            </button>
            <button data-testid="action-edit" className={menuItemClass} onClick={() => { onEdit?.(); setMoreOpen(false); }}>
              <Pencil className="size-4" /> Edit Game
            </button>
            <button
              data-testid="action-refetch"
              className={cn(menuItemClass, isRefetching && "pointer-events-none opacity-60")}
              onClick={async () => {
                setMoreOpen(false);
                setIsRefetching(true);
                try {
                  await onRefetchMetadata?.();
                } finally {
                  setIsRefetching(false);
                }
              }}
            >
              {isRefetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {isRefetching ? "Fetching…" : "Re-fetch Metadata"}
            </button>
            {game.folderPath && (
              <button data-testid="action-open-folder" className={menuItemClass} onClick={() => { onOpenFolder?.(); setMoreOpen(false); }}>
                <FolderOpen className="size-4" /> Open Install Folder
              </button>
            )}
            <div className="my-1 border-t border-border" />
            <button data-testid="action-hide" className={menuItemClass} onClick={() => { onHide?.(); setMoreOpen(false); }}>
              <EyeOff className="size-4" /> Hide from Library
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
