import { useTagStore } from "@/stores/tagStore";
import { TagChip } from "./TagChip";
import { TagInput } from "./TagInput";
import { Plus } from "lucide-react";

interface GameTagsSectionProps {
  gameId: string;
}

export function GameTagsSection({ gameId }: GameTagsSectionProps) {
  const tags = useTagStore((s) => s.tags);
  const gameTagMap = useTagStore((s) => s.gameTagMap);
  const gameTagIds = gameTagMap[gameId] ?? [];
  const removeFromGame = useTagStore((s) => s.removeFromGame);

  const gameTags = tags.filter((t) => gameTagIds.includes(t.id));

  return (
    <div data-testid="detail-tags" className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Tags</h3>
      <div className="flex flex-wrap gap-1.5">
        {gameTags.map((tag) => (
          <TagChip
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onRemove={() => removeFromGame(gameId, tag.id)}
          />
        ))}
        <TagInput
          gameId={gameId}
          popoverClassName="z-[60]"
          trigger={
            <button
              data-testid="detail-add-tag"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" />
              Add Tag
            </button>
          }
        />
      </div>
    </div>
  );
}
