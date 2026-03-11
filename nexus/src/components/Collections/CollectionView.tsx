import * as React from "react";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { Pencil, FolderPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollectionViewProps {
  collectionId: string;
  onEditCollection?: (collection: Collection) => void;
  onRemoveFromCollection?: (collectionId: string, gameId: string) => void;
  renderCard: (game: Game) => React.ReactNode;
}

export function CollectionView({
  collectionId,
  onEditCollection,
  renderCard,
}: CollectionViewProps) {
  const collection = useCollectionStore((s) =>
    s.collections.find((c) => c.id === collectionId),
  );
  const games = useGameStore((s) => s.games);

  const filteredGames = React.useMemo(() => {
    if (!collection) return [];
    return games.filter((g) => collection.gameIds.includes(g.id));
  }, [games, collection]);

  if (!collection) return null;

  const isSmart = collection.isSmart;

  if (filteredGames.length === 0) {
    return (
      <div data-testid="collection-view" className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          {isSmart ? (
            <Sparkles className="size-6 text-primary" />
          ) : (
            <span className="text-2xl">{collection.icon}</span>
          )}
          <h2 data-testid="collection-heading" className="text-xl font-bold text-foreground">
            {collection.name}
          </h2>
          <Button
            data-testid="collection-edit-button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onEditCollection?.(collection)}
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
        <div
          data-testid="collection-empty"
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-12 text-center"
        >
          {isSmart ? (
            <>
              <Sparkles className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No games match the current rules. Edit the collection to adjust conditions.
              </p>
            </>
          ) : (
            <>
              <FolderPlus className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No games in this collection yet. Drag games here or use "Add to Collection".
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="collection-view" className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        {isSmart ? (
          <Sparkles className="size-6 text-primary" />
        ) : (
          <span className="text-2xl">{collection.icon}</span>
        )}
        <h2 data-testid="collection-heading" className="text-xl font-bold text-foreground">
          {collection.name}
        </h2>
        <span className="text-sm text-muted-foreground">
          {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""}
        </span>
        {isSmart && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Auto-updating
          </span>
        )}
        <Button
          data-testid="collection-edit-button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onEditCollection?.(collection)}
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>

      <div
        data-testid="collection-game-grid"
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {filteredGames.map((game) => (
          <React.Fragment key={game.id}>{renderCard(game)}</React.Fragment>
        ))}
      </div>
    </div>
  );
}
