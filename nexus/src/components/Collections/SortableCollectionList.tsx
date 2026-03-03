import * as React from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { GripVertical } from "lucide-react";

interface SortableCollectionItemProps {
  collection: Collection;
  isActive: boolean;
  onClick: () => void;
}

function SortableCollectionItem({
  collection,
  isActive,
  onClick,
}: SortableCollectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: collection.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`sortable-collection-${collection.id}`}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        "hover:bg-accent",
        isActive && "bg-accent text-accent-foreground",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <button
        data-testid={`drag-handle-${collection.id}`}
        className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${collection.name}`}
      >
        <GripVertical className="size-4 text-muted-foreground" />
      </button>
      <button
        className="flex flex-1 items-center gap-2 text-left"
        onClick={onClick}
      >
        <span>{collection.icon || "📁"}</span>
        <span className="flex-1 truncate">{collection.name}</span>
        <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground">
          {collection.gameIds.length}
        </span>
      </button>
    </div>
  );
}

interface SortableCollectionListProps {
  onReorder?: (orderedIds: string[]) => void;
}

export function SortableCollectionList({ onReorder }: SortableCollectionListProps) {
  const collections = useCollectionStore((s) => s.collections);
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const setActiveCollectionId = useCollectionStore((s) => s.setActiveCollectionId);
  const reorderCollections = useCollectionStore((s) => s.reorderCollections);

  const sorted = React.useMemo(
    () => [...collections].sort((a, b) => a.sortOrder - b.sortOrder),
    [collections],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sorted.findIndex((c) => c.id === active.id);
      const newIndex = sorted.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...sorted];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      const orderedIds = reordered.map((c) => c.id);
      reorderCollections(orderedIds);
      onReorder?.(orderedIds);
    },
    [sorted, reorderCollections, onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sorted.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div data-testid="sortable-collection-list" role="list">
          {sorted.map((collection) => (
            <SortableCollectionItem
              key={collection.id}
              collection={collection}
              isActive={activeCollectionId === collection.id}
              onClick={() => setActiveCollectionId(collection.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
