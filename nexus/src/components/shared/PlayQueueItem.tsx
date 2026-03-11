import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Play, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PlayQueueEntry } from "@/lib/tauri";

function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("asset:")
  )
    return url;
  try {
    return convertFileSrc(url);
  } catch {
    return url;
  }
}

interface PlayQueueItemProps {
  entry: PlayQueueEntry;
  isFirst: boolean;
  onPlay: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onViewDetails: (gameId: string) => void;
}

export function PlayQueueItem({
  entry,
  isFirst,
  onPlay,
  onRemove,
  onViewDetails,
}: PlayQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.gameId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const coverSrc = normalizeUrl(entry.customCover ?? entry.coverUrl);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`queue-item-${entry.gameId}`}
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
        "hover:bg-accent",
        isDragging && "z-10 opacity-80 shadow-lg",
        isFirst && "border-l-2 border-primary",
      )}
    >
      <button
        data-testid={`queue-drag-${entry.gameId}`}
        className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${entry.name}`}
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
      </button>

      {/* Thumbnail */}
      <button
        className="shrink-0"
        onClick={() => onViewDetails(entry.gameId)}
        aria-label={`View ${entry.name}`}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className={cn(
              "rounded object-cover",
              isFirst ? "size-10" : "size-8",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground",
              isFirst ? "size-10" : "size-8",
            )}
          >
            {entry.name.charAt(0)}
          </div>
        )}
      </button>

      {/* Name + label */}
      <button
        className="flex min-w-0 flex-1 flex-col text-left"
        onClick={() => onViewDetails(entry.gameId)}
      >
        <span className="truncate text-xs font-medium text-foreground">
          {entry.name}
        </span>
        {isFirst && (
          <span className="text-[10px] font-medium text-primary">Up Next</span>
        )}
      </button>

      {/* Play */}
      <button
        data-testid={`queue-play-${entry.gameId}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-primary/20 hover:text-primary group-hover:opacity-100"
        onClick={() => onPlay(entry.gameId)}
        aria-label={`Play ${entry.name}`}
      >
        <Play className="size-3.5" />
      </button>

      {/* Remove */}
      <button
        data-testid={`queue-remove-${entry.gameId}`}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
        onClick={() => onRemove(entry.gameId)}
        aria-label={`Remove ${entry.name} from queue`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
