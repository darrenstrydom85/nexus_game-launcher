import * as React from "react";
import { cn } from "@/lib/utils";
import { useTagStore } from "@/stores/tagStore";
import { Trash2, Pencil, Check, X } from "lucide-react";

const PRESET_COLORS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#6B7280",
];

export function TagManager() {
  const tags = useTagStore((s) => s.tags);
  const deleteTag = useTagStore((s) => s.deleteTag);
  const rename = useTagStore((s) => s.rename);
  const updateColor = useTagStore((s) => s.updateColor);
  const createTag = useTagStore((s) => s.create);
  const loadTags = useTagStore((s) => s.loadTags);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [newTagName, setNewTagName] = React.useState("");

  React.useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleStartEdit = (tagId: string, currentName: string) => {
    setEditingId(tagId);
    setEditName(currentName);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await rename(editingId, editName.trim());
    } catch {
      // name conflict handled by backend error
    }
    setEditingId(null);
  };

  const handleDelete = async (tagId: string) => {
    await deleteTag(tagId);
    setConfirmDeleteId(null);
  };

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTag(newTagName.trim());
      setNewTagName("");
    } catch {
      // duplicate name handled by backend
    }
  };

  return (
    <div data-testid="tag-manager" className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          data-testid="tag-manager-new-input"
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
          placeholder="New tag name..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <button
          data-testid="tag-manager-create"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={!newTagName.trim()}
          onClick={handleCreate}
        >
          Add
        </button>
      </div>

      {tags.length === 0 && (
        <p className="text-sm text-muted-foreground">No tags created yet.</p>
      )}

      <div className="space-y-1">
        {tags.map((tag) => (
          <div
            key={tag.id}
            data-testid={`tag-manager-row-${tag.name}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
          >
            {/* Color picker */}
            <div className="relative">
              <button
                data-testid={`tag-color-${tag.name}`}
                className="size-5 rounded-full border border-border transition-transform hover:scale-110"
                style={{ backgroundColor: tag.color || "#6B7280" }}
                onClick={(e) => {
                  const popover = e.currentTarget.nextElementSibling;
                  if (popover instanceof HTMLElement) {
                    popover.classList.toggle("hidden");
                  }
                }}
                aria-label={`Change color for ${tag.name}`}
              />
              <div className="hidden absolute left-0 top-full z-30 mt-1 grid grid-cols-5 gap-1 rounded-md border border-border bg-popover p-2 shadow-lg">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "size-5 rounded-full border transition-transform hover:scale-110",
                      tag.color === c ? "border-foreground ring-2 ring-ring" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => updateColor(tag.id, c)}
                    aria-label={`Set color ${c}`}
                  />
                ))}
              </div>
            </div>

            {/* Name (editable) */}
            {editingId === tag.id ? (
              <div className="flex flex-1 items-center gap-1">
                <input
                  data-testid={`tag-edit-input-${tag.name}`}
                  className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
                <button
                  className="rounded p-0.5 text-primary hover:bg-accent"
                  onClick={handleSaveEdit}
                  aria-label="Save"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                  onClick={() => setEditingId(null)}
                  aria-label="Cancel"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <span className="flex-1 truncate text-sm text-foreground">
                {tag.name}
              </span>
            )}

            {/* Game count */}
            <span className="text-xs tabular-nums text-muted-foreground">
              {tag.gameCount} {tag.gameCount === 1 ? "game" : "games"}
            </span>

            {/* Actions */}
            {editingId !== tag.id && (
              <div className="flex items-center gap-0.5">
                <button
                  data-testid={`tag-rename-${tag.name}`}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => handleStartEdit(tag.id, tag.name)}
                  aria-label={`Rename ${tag.name}`}
                >
                  <Pencil className="size-3.5" />
                </button>
                {confirmDeleteId === tag.id ? (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-destructive">Delete?</span>
                    <button
                      className="rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(tag.id)}
                    >
                      Yes
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    data-testid={`tag-delete-${tag.name}`}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDeleteId(tag.id)}
                    aria-label={`Delete ${tag.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
