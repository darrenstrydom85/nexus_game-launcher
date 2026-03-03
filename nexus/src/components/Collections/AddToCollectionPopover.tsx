import * as React from "react";
import { cn } from "@/lib/utils";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { useToastStore } from "@/stores/toastStore";
import { Plus, Check } from "lucide-react";

interface AddToCollectionPopoverProps {
  gameId: string;
  gameName: string;
  open: boolean;
  onClose: () => void;
  onNewCollection?: () => void;
  onToggle?: (collectionId: string, gameId: string, added: boolean) => void;
}

export function AddToCollectionPopover({
  gameId,
  gameName,
  open,
  onClose,
  onNewCollection,
  onToggle,
}: AddToCollectionPopoverProps) {
  const collections = useCollectionStore((s) => s.collections);
  const addGameToCollection = useCollectionStore((s) => s.addGameToCollection);
  const removeGameFromCollection = useCollectionStore((s) => s.removeGameFromCollection);
  const addToast = useToastStore((s) => s.addToast);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  const handleToggle = React.useCallback(
    (collection: Collection) => {
      const isMember = collection.gameIds.includes(gameId);
      if (isMember) {
        removeGameFromCollection(collection.id, gameId);
        onToggle?.(collection.id, gameId, false);
      } else {
        addGameToCollection(collection.id, gameId);
        addToast({
          type: "success",
          message: `Added "${gameName}" to ${collection.name}`,
        });
        onToggle?.(collection.id, gameId, true);
      }
    },
    [gameId, gameName, addGameToCollection, removeGameFromCollection, addToast, onToggle],
  );

  if (!open) return null;

  return (
    <div
      ref={ref}
      data-testid="add-to-collection-popover"
      className="w-56 rounded-md border border-border bg-popover p-1 shadow-lg"
      role="menu"
    >
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
        Add to Collection
      </p>
      {collections.map((collection) => {
        const isMember = collection.gameIds.includes(gameId);
        return (
          <button
            key={collection.id}
            data-testid={`atc-option-${collection.id}`}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
              "text-foreground hover:bg-accent",
            )}
            role="menuitem"
            onClick={() => handleToggle(collection)}
          >
            <span
              data-testid={`atc-check-${collection.id}`}
              className={cn(
                "flex size-4 items-center justify-center rounded border",
                isMember
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {isMember && <Check className="size-3" />}
            </span>
            <span>{collection.icon}</span>
            <span className="flex-1 truncate text-left">{collection.name}</span>
          </button>
        );
      })}
      <div className="my-1 border-t border-border" />
      <button
        data-testid="atc-new-collection"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        role="menuitem"
        onClick={() => {
          onNewCollection?.();
          onClose();
        }}
      >
        <Plus className="size-4" />
        New Collection
      </button>
    </div>
  );
}
