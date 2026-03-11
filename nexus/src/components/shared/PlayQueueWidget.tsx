import * as React from "react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ListMusic, Trash2 } from "lucide-react";
import { useQueueStore } from "@/stores/queueStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PlayQueueItem } from "./PlayQueueItem";

interface PlayQueueWidgetProps {
  sidebarOpen: boolean;
  onPlayGame: (gameId: string) => void;
}

export function PlayQueueWidget({
  sidebarOpen,
  onPlayGame,
}: PlayQueueWidgetProps) {
  const rawEntries = useQueueStore((s) => s.entries);
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const loading = useQueueStore((s) => s.loading);
  const fetch = useQueueStore((s) => s.fetch);
  const remove = useQueueStore((s) => s.remove);
  const reorder = useQueueStore((s) => s.reorder);
  const clear = useQueueStore((s) => s.clear);
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);

  const queueCollapsed = useSettingsStore((s) => s.queueCollapsed);
  const setQueueCollapsed = useSettingsStore((s) => s.setQueueCollapsed);

  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    fetch();
  }, [fetch]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = entries.findIndex((e) => e.gameId === active.id);
      const newIndex = entries.findIndex((e) => e.gameId === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...entries];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      reorder(reordered.map((e) => e.gameId));
    },
    [entries, reorder],
  );

  const handleRemove = React.useCallback(
    (gameId: string) => {
      const entry = entries.find((e) => e.gameId === gameId);
      remove(gameId, entry?.name);
    },
    [entries, remove],
  );

  const displayEntries = showAll ? entries : entries.slice(0, 3);

  if (!sidebarOpen) {
    return (
      <div className="flex flex-col items-center px-2 py-1">
        <button
          data-testid="queue-icon-collapsed"
          className={cn(
            "relative flex size-9 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          title={`Play Next (${entries.length})`}
          aria-label={`Play Next queue, ${entries.length} games`}
        >
          <ListMusic className="size-4" />
          {entries.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium tabular-nums text-primary-foreground">
              {entries.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-2 py-1">
      {/* Header */}
      <button
        data-testid="accordion-queue"
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wider",
          "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => setQueueCollapsed(!queueCollapsed)}
        aria-expanded={!queueCollapsed}
      >
        <ListMusic className="size-3.5 shrink-0" />
        <span className="flex-1 text-left">Play Next</span>
        {entries.length > 0 && (
          <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground">
            {entries.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-200",
            !queueCollapsed && "rotate-180",
          )}
        />
      </button>

      {/* Content */}
      {!queueCollapsed && (
        <div className="mt-0.5">
          {loading && entries.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Loading...
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div
              data-testid="queue-empty"
              className="flex flex-col items-center gap-1 px-3 py-3 text-center"
            >
              <ListMusic className="size-5 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground">
                No games queued
              </span>
            </div>
          )}

          {entries.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayEntries.map((e) => e.gameId)}
                strategy={verticalListSortingStrategy}
              >
                <div data-testid="queue-list" role="list">
                  {displayEntries.map((entry, i) => (
                    <PlayQueueItem
                      key={entry.gameId}
                      entry={entry}
                      isFirst={i === 0}
                      onPlay={onPlayGame}
                      onRemove={handleRemove}
                      onViewDetails={setDetailOverlayGameId}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* View All / Collapse + Clear */}
          {entries.length > 3 && (
            <button
              data-testid="queue-view-all"
              className="mt-1 w-full px-3 text-left text-[11px] font-medium text-primary hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? "Show less"
                : `View all ${entries.length} queued`}
            </button>
          )}

          {entries.length > 0 && (
            <button
              data-testid="queue-clear"
              className="mt-1 flex w-full items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-destructive"
              onClick={clear}
            >
              <Trash2 className="size-3" />
              Clear queue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
