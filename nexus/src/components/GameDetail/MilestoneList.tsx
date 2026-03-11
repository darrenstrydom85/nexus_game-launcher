import * as React from "react";
import { cn } from "@/lib/utils";
import { Plus, GripVertical, Trash2, Check } from "lucide-react";
import type { Milestone } from "@/stores/gameStore";

interface MilestoneListProps {
  milestones: Milestone[];
  onChange: (milestones: Milestone[]) => void;
}

export function MilestoneList({ milestones, onChange }: MilestoneListProps) {
  const [newLabel, setNewLabel] = React.useState("");
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = React.useState<number | null>(null);

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

  const toggleMilestone = (id: string) => {
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
  };

  const deleteMilestone = (id: string) => {
    onChange(milestones.filter((m) => m.id !== id));
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const updated = [...milestones];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    onChange(updated);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMilestone();
    }
  };

  return (
    <div data-testid="milestone-list" className="flex flex-col gap-2">
      {milestones.map((m, idx) => (
        <div
          key={m.id}
          data-testid={`milestone-${m.id}`}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={() => handleDrop(idx)}
          onDragEnd={handleDragEnd}
          className={cn(
            "group flex items-center gap-2 rounded-md border border-border bg-card/50 px-2 py-1.5 transition-colors",
            dragOverIdx === idx && "border-primary/50",
            dragIdx === idx && "opacity-50",
          )}
        >
          <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />

          <button
            data-testid={`milestone-toggle-${m.id}`}
            onClick={() => toggleMilestone(m.id)}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
              m.completed
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/40 hover:border-primary",
            )}
            aria-label={m.completed ? `Uncheck ${m.label}` : `Check ${m.label}`}
          >
            {m.completed && <Check className="size-3" />}
          </button>

          <span
            className={cn(
              "flex-1 text-sm",
              m.completed ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            {m.label}
          </span>

          <button
            data-testid={`milestone-delete-${m.id}`}
            onClick={() => deleteMilestone(m.id)}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            aria-label={`Delete ${m.label}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}

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
