import * as React from "react";
import { cn } from "@/lib/utils";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { useUiStore } from "@/stores/uiStore";
import { Library, Plus, Pencil, Trash2 } from "lucide-react";

interface CollectionsSidebarProps {
  onCreateCollection?: () => void;
  onEditCollection?: (collection: Collection) => void;
  onDeleteCollection?: (collection: Collection) => void;
}

export function CollectionsSidebar({
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
}: CollectionsSidebarProps) {
  const collections = useCollectionStore((s) => s.collections);
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const setActiveCollectionId = useCollectionStore((s) => s.setActiveCollectionId);
  const activeNav = useUiStore((s) => s.activeNav);
  const setActiveNav = useUiStore((s) => s.setActiveNav);
  const [contextMenu, setContextMenu] = React.useState<{
    collection: Collection;
    x: number;
    y: number;
  } | null>(null);

  const sorted = React.useMemo(
    () => [...collections].sort((a, b) => a.sortOrder - b.sortOrder),
    [collections],
  );

  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    return () => {
      document.removeEventListener("click", close);
    };
  }, [contextMenu]);

  return (
    <div data-testid="collections-sidebar" className="flex flex-col gap-0.5">
      {/* All Games */}
      <button
        data-testid="collection-all-games"
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm",
          "transition-colors hover:bg-accent",
          activeCollectionId === null && "bg-accent text-accent-foreground",
        )}
        onClick={() => {
          if (activeNav !== "library") setActiveNav("library");
          setActiveCollectionId(null);
        }}
      >
        <Library className="size-4" />
        <span className="flex-1 text-left">All Games</span>
      </button>

      {/* Collection entries */}
      {sorted.map((collection) => (
        <button
          key={collection.id}
          data-testid={`collection-entry-${collection.id}`}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm",
            "transition-colors hover:bg-accent",
            activeCollectionId === collection.id && "bg-accent text-accent-foreground",
          )}
          onClick={() => {
            if (activeNav !== "library") setActiveNav("library");
            setActiveCollectionId(collection.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ collection, x: e.clientX, y: e.clientY });
          }}
        >
          <span className="text-base">{collection.icon || "📁"}</span>
          <span className="flex-1 truncate text-left">{collection.name}</span>
          <span
            data-testid={`collection-count-${collection.id}`}
            className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground"
          >
            {collection.gameIds.length}
          </span>
        </button>
      ))}

      {/* Add button */}
      <button
        data-testid="collection-add-button"
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm",
          "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        )}
        onClick={onCreateCollection}
      >
        <Plus className="size-4" />
        <span>New Collection</span>
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          data-testid="collection-context-menu"
          className="fixed z-50 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            data-testid="ctx-edit-collection"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            role="menuitem"
            onClick={() => {
              onEditCollection?.(contextMenu.collection);
              setContextMenu(null);
            }}
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
          <button
            data-testid="ctx-delete-collection"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            role="menuitem"
            onClick={() => {
              onDeleteCollection?.(contextMenu.collection);
              setContextMenu(null);
            }}
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
