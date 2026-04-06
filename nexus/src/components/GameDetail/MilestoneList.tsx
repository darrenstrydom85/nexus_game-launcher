import * as React from "react";
import { cn } from "@/lib/utils";
import { Plus, GripVertical, Trash2, Check } from "lucide-react";
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Milestone } from "@/stores/gameStore";

interface MilestoneListProps {
  milestones: Milestone[];
  onChange: (milestones: Milestone[]) => void;
}

interface SortableMilestoneProps {
  milestone: Milestone;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableMilestone({ milestone, onToggle, onDelete }: SortableMilestoneProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`milestone-${milestone.id}`}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-border bg-card/50 px-2 py-1.5 transition-colors",
        isDragging && "z-10 opacity-50 shadow-lg",
      )}
    >
      <button
        data-testid={`milestone-drag-${milestone.id}`}
        className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${milestone.label}`}
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
      </button>

      <button
        data-testid={`milestone-toggle-${milestone.id}`}
        onClick={() => onToggle(milestone.id)}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          milestone.completed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
        aria-label={milestone.completed ? `Uncheck ${milestone.label}` : `Check ${milestone.label}`}
      >
        {milestone.completed && <Check className="size-3" />}
      </button>

      <span
        className={cn(
          "flex-1 text-sm",
          milestone.completed ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {milestone.label}
      </span>

      <button
        data-testid={`milestone-delete-${milestone.id}`}
        onClick={() => onDelete(milestone.id)}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        aria-label={`Delete ${milestone.label}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function MilestoneList({ milestones, onChange }: MilestoneListProps) {
  const [newLabel, setNewLabel] = React.useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const addMilestone = () => {
    const label = newLabel.trim();
    if (!label) return;
    const ms: Milestone = {
      id: crypto.randomUUID(),
      label,
      completed: false,
      completedAt: null,
    };
    onChange([...milestones, ms]);
    setNewLabel("");
  };

  const toggleMilestone = React.useCallback(
    (id: string) => {
      onChange(
        milestones.map((m) =>
          m.id === id
            ? {
                ...m,
                completed: !m.completed,
                completedAt: !m.completed ? new Date().toISOString() : null,
              }
            : m,
        ),
      );
    },
    [milestones, onChange],
  );

  const deleteMilestone = React.useCallback(
    (id: string) => {
      onChange(milestones.filter((m) => m.id !== id));
    },
    [milestones, onChange],
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = milestones.findIndex((m) => m.id === active.id);
      const newIndex = milestones.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const updated = [...milestones];
      const [moved] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, moved);
      onChange(updated);
    },
    [milestones, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMilestone();
    }
  };

  return (
    <div data-testid="milestone-list" className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={milestones.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          {milestones.map((m) => (
            <SortableMilestone
              key={m.id}
              milestone={m}
              onToggle={toggleMilestone}
              onDelete={deleteMilestone}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2">
        <input
          data-testid="milestone-input"
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add milestone..."
          className="flex-1 rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          data-testid="milestone-add"
          onClick={addMilestone}
          disabled={!newLabel.trim()}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>
    </div>
  );
}
