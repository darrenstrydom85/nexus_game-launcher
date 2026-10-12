import * as React from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTagStore } from "@/stores/tagStore";
import { useToastStore } from "@/stores/toastStore";
import type { TagWithCount } from "@/lib/tauri";
import { SettingsCard, SettingsRow } from "../SettingsKit";

const COLOURS = [
  { value: "#EF4444", name: "Red" },
  { value: "#F97316", name: "Orange" },
  { value: "#EAB308", name: "Yellow" },
  { value: "#22C55E", name: "Green" },
  { value: "#14B8A6", name: "Teal" },
  { value: "#3B82F6", name: "Blue" },
  { value: "#6366F1", name: "Indigo" },
  { value: "#A855F7", name: "Purple" },
  { value: "#EC4899", name: "Pink" },
  { value: "#6B7280", name: "Grey" },
];

/** Shown for tags saved without a colour. */
const FALLBACK_COLOUR = "#6B7280";

const sameColour = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

function TagDot({ color }: { color: string | null }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: color || FALLBACK_COLOUR }} />;
}

/** A save failure whose message the form shows as is. */
class TagFormError extends Error {}

/** Name and colour fields for creating or editing a tag. Throws from `onSubmit` keep the form open with an error. */
function TagForm({
  initialName,
  initialColor,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  initialColor: string | null;
  submitLabel: string;
  onSubmit: (name: string, color: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const id = React.useId();
  const [name, setName] = React.useState(initialName);
  const [color, setColor] = React.useState(initialColor);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const trimmed = name.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed, color);
    } catch (err) {
      setError(err instanceof TagFormError ? err.message : "Couldn’t save. A tag with that name may already exist.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" data-testid="tag-form">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] font-medium text-foreground">
          Name
        </label>
        <input
          id={`${id}-name`}
          data-testid="tag-form-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="For example, Co-op"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-[34px] rounded-lg border border-input bg-background/60 px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium text-foreground">Colour</legend>
        <div className="mt-1.5 grid grid-cols-5 gap-2">
          {COLOURS.map((c) => {
            const selected = sameColour(color, c.value);
            return (
              <button
                key={c.value}
                type="button"
                data-testid={`tag-colour-${c.name.toLowerCase()}`}
                aria-label={c.name}
                aria-pressed={selected}
                onClick={() => setColor(c.value)}
                className={cn(
                  "pressable flex size-8 items-center justify-center rounded-md outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                  selected && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
                style={{ backgroundColor: c.value }}
              >
                {selected && <Check className="size-4 text-white drop-shadow-sm" strokeWidth={2.5} aria-hidden />}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" data-testid="tag-form-submit" disabled={!trimmed || saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

const POPOVER_CLASS = "w-[260px] rounded-xl p-4";

function TagRow({ tag, onDelete }: { tag: TagWithCount; onDelete: (tag: TagWithCount) => void }) {
  const rename = useTagStore((s) => s.rename);
  const updateColor = useTagStore((s) => s.updateColor);
  const [editing, setEditing] = React.useState(false);

  const save = async (name: string, color: string | null) => {
    const renaming = name !== tag.name;
    if (renaming) await rename(tag.id, name);
    if (!sameColour(color, tag.color)) {
      try {
        await updateColor(tag.id, color);
      } catch {
        // The rename has landed, so a retry only needs the colour.
        throw new TagFormError(
          renaming ? "Renamed, but couldn’t change the colour. Please try again." : "Couldn’t change the colour. Please try again.",
        );
      }
    }
    setEditing(false);
  };

  return (
    <SettingsRow
      data-testid={`tag-manager-row-${tag.name}`}
      leading={<TagDot color={tag.color} />}
      label={<span className="break-words">{tag.name}</span>}
      description={`${tag.gameCount.toLocaleString()} ${tag.gameCount === 1 ? "game" : "games"}`}
    >
      <Popover open={editing} onOpenChange={setEditing}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" data-testid={`tag-edit-${tag.name}`} aria-label={`Edit ${tag.name}`}>
            Edit
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className={POPOVER_CLASS}>
          <TagForm initialName={tag.name} initialColor={tag.color} submitLabel="Save" onSubmit={save} onCancel={() => setEditing(false)} />
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid={`tag-delete-${tag.name}`}
        aria-label={`Delete ${tag.name}`}
        onClick={() => onDelete(tag)}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
      </Button>
    </SettingsRow>
  );
}

export function TagsSection() {
  const tags = useTagStore((s) => s.tags);
  const loadTags = useTagStore((s) => s.loadTags);
  const createTag = useTagStore((s) => s.create);
  const deleteTag = useTagStore((s) => s.deleteTag);
  const [creating, setCreating] = React.useState(false);
  // Kept after closing so the dialog text doesn't blank out while it fades.
  const [target, setTarget] = React.useState<TagWithCount | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    loadTags();
  }, [loadTags]);

  const create = async (name: string, color: string | null) => {
    await createTag(name, color);
    setCreating(false);
  };

  return (
    <>
      <SettingsCard title="Your tags" data-testid="tag-manager">
        {tags.length === 0 && <p className="px-[18px] py-[13px] text-[13px] text-muted-foreground">No tags yet.</p>}
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            onDelete={(t) => {
              setTarget(t);
              setConfirmOpen(true);
            }}
          />
        ))}
        <SettingsRow label="Create a tag">
          <Popover open={creating} onOpenChange={setCreating}>
            <PopoverTrigger asChild>
              <Button size="sm" data-testid="tag-manager-create">
                <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                New tag
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className={POPOVER_CLASS}>
              <TagForm initialName="" initialColor={null} submitLabel="Create" onSubmit={create} onCancel={() => setCreating(false)} />
            </PopoverContent>
          </Popover>
        </SettingsRow>
      </SettingsCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete “${target?.name ?? ""}”?`}
        description={
          target && target.gameCount > 0
            ? `It comes off ${target.gameCount === 1 ? "the 1 game" : `all ${target.gameCount.toLocaleString()} games`} that use it. The games stay in your library.`
            : "No games use it yet."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!target) return;
          deleteTag(target.id).catch(() =>
            useToastStore.getState().addToast({ type: "error", message: `Couldn’t delete “${target.name}”. Please try again.` }),
          );
        }}
      />
    </>
  );
}
