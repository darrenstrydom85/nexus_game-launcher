import * as React from "react";
import { cn } from "@/lib/utils";
import { useTagStore } from "@/stores/tagStore";
import { Check, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TagInputProps {
  gameId: string;
  trigger: React.ReactNode;
  popoverClassName?: string;
}

export function TagInput({ gameId, trigger, popoverClassName }: TagInputProps) {
  const tags = useTagStore((s) => s.tags);
  const gameTagMap = useTagStore((s) => s.gameTagMap);
  const gameTagIds = gameTagMap[gameId] ?? [];
  const addToGame = useTagStore((s) => s.addToGame);
  const removeFromGame = useTagStore((s) => s.removeFromGame);
  const createTag = useTagStore((s) => s.create);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return tags;
    const q = query.toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, query]);

  const canCreate =
    query.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const handleToggle = async (tagId: string) => {
    if (gameTagIds.includes(tagId)) {
      await removeFromGame(gameId, tagId);
    } else {
      await addToGame(gameId, tagId);
    }
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    const tag = await createTag(query.trim());
    await addToGame(gameId, tag.id);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={cn("w-56 p-0", popoverClassName)}
        align="start"
        onOpenAutoFocus={() => inputRef.current?.focus()}
      >
        <div className="border-b border-border px-3 py-2">
          <input
            ref={inputRef}
            data-testid="tag-input-search"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Search or create tag..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.map((tag) => {
            const isAssigned = gameTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                data-testid={`tag-option-${tag.name}`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
                )}
                onClick={() => handleToggle(tag.id)}
              >
                <span
                  className="inline-block size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color || "#6B7280" }}
                />
                <span className="flex-1 truncate text-left">{tag.name}</span>
                {isAssigned && <Check className="size-3.5 text-primary" />}
              </button>
            );
          })}
          {canCreate && (
            <>
              {filtered.length > 0 && (
                <div className="my-1 border-t border-border" />
              )}
              <button
                data-testid="tag-create-new"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
                )}
                onClick={handleCreate}
              >
                <Plus className="size-3.5" />
                <span>
                  Create "<span className="font-medium">{query.trim()}</span>"
                </span>
              </button>
            </>
          )}
          {filtered.length === 0 && !canCreate && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No tags found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
