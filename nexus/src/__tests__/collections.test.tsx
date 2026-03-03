import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionsSidebar } from "@/components/Collections/CollectionsSidebar";
import { CollectionEditor } from "@/components/Collections/CollectionEditor";
import { CollectionView } from "@/components/Collections/CollectionView";
import { AddToCollectionPopover } from "@/components/Collections/AddToCollectionPopover";
import { SortableCollectionList } from "@/components/Collections/SortableCollectionList";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";

const makeCollection = (id: string, name: string, gameIds: string[] = [], sortOrder = 0): Collection => ({
  id, name, icon: "🎮", color: null, sortOrder, gameIds,
});

const makeGame = (id: string, name: string): Game => ({
  id, name, source: "steam", folderPath: null, exePath: null, exeName: null,
  launchUrl: null, igdbId: null, steamgridId: null, description: null,
  coverUrl: null, heroUrl: null, logoUrl: null, iconUrl: null,
  customCover: null, customHero: null, potentialExeNames: null,
  genres: [], releaseDate: null,
  criticScore: null, criticScoreCount: null, communityScore: null, communityScoreCount: null, trailerUrl: null,
  status: "unset", rating: null,
  totalPlayTimeS: 0, lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false,
});

describe("Story 10.1: CollectionsSidebar", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: [
        makeCollection("c1", "Favorites", ["g1", "g2"], 0),
        makeCollection("c2", "RPGs", ["g1"], 1),
      ],
      activeCollectionId: null,
    });
  });

  it("renders the sidebar", () => {
    render(<CollectionsSidebar />);
    expect(screen.getByTestId("collections-sidebar")).toBeInTheDocument();
  });

  it("shows 'All Games' at top", () => {
    render(<CollectionsSidebar />);
    expect(screen.getByTestId("collection-all-games")).toBeInTheDocument();
  });

  it("renders collection entries in sort order", () => {
    render(<CollectionsSidebar />);
    expect(screen.getByTestId("collection-entry-c1")).toBeInTheDocument();
    expect(screen.getByTestId("collection-entry-c2")).toBeInTheDocument();
  });

  it("shows count badge", () => {
    render(<CollectionsSidebar />);
    expect(screen.getByTestId("collection-count-c1")).toHaveTextContent("2");
    expect(screen.getByTestId("collection-count-c2")).toHaveTextContent("1");
  });

  it("click filters to collection", () => {
    render(<CollectionsSidebar />);
    fireEvent.click(screen.getByTestId("collection-entry-c1"));
    expect(useCollectionStore.getState().activeCollectionId).toBe("c1");
  });

  it("'All Games' clears filter", () => {
    useCollectionStore.setState({ activeCollectionId: "c1" });
    render(<CollectionsSidebar />);
    fireEvent.click(screen.getByTestId("collection-all-games"));
    expect(useCollectionStore.getState().activeCollectionId).toBeNull();
  });

  it("'+' button calls onCreateCollection", () => {
    const onCreate = vi.fn();
    render(<CollectionsSidebar onCreateCollection={onCreate} />);
    fireEvent.click(screen.getByTestId("collection-add-button"));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("right-click shows context menu with Edit/Delete", () => {
    render(<CollectionsSidebar />);
    fireEvent.contextMenu(screen.getByTestId("collection-entry-c1"));
    expect(screen.getByTestId("collection-context-menu")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-edit-collection")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-delete-collection")).toBeInTheDocument();
  });

  it("Edit calls onEditCollection", () => {
    const onEdit = vi.fn();
    render(<CollectionsSidebar onEditCollection={onEdit} />);
    fireEvent.contextMenu(screen.getByTestId("collection-entry-c1"));
    fireEvent.click(screen.getByTestId("ctx-edit-collection"));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("Delete calls onDeleteCollection", () => {
    const onDelete = vi.fn();
    render(<CollectionsSidebar onDeleteCollection={onDelete} />);
    fireEvent.contextMenu(screen.getByTestId("collection-entry-c1"));
    fireEvent.click(screen.getByTestId("ctx-delete-collection"));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });
});

describe("Story 10.2: CollectionEditor", () => {
  const onClose = vi.fn();
  const onSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not open", () => {
    render(<CollectionEditor open={false} onClose={onClose} onSave={onSave} />);
    expect(screen.queryByTestId("collection-editor")).not.toBeInTheDocument();
  });

  it("renders modal when open", () => {
    render(<CollectionEditor open onClose={onClose} onSave={onSave} />);
    expect(screen.getByTestId("collection-editor")).toBeInTheDocument();
    expect(screen.getByTestId("editor-panel")).toBeInTheDocument();
  });

  it("has name, icon picker, and color picker", () => {
    render(<CollectionEditor open onClose={onClose} onSave={onSave} />);
    expect(screen.getByTestId("editor-name")).toBeInTheDocument();
    expect(screen.getByTestId("editor-icon-picker")).toBeInTheDocument();
    expect(screen.getByTestId("editor-color-picker")).toBeInTheDocument();
  });

  it("validates empty name", () => {
    render(<CollectionEditor open onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("editor-save"));
    expect(screen.getByTestId("editor-name-error")).toHaveTextContent("Name is required");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("warns on duplicate name", () => {
    render(
      <CollectionEditor open onClose={onClose} onSave={onSave} existingNames={["Favorites"]} />,
    );
    fireEvent.change(screen.getByTestId("editor-name"), { target: { value: "Favorites" } });
    fireEvent.click(screen.getByTestId("editor-save"));
    expect(screen.getByTestId("editor-name-error")).toHaveTextContent("already exists");
  });

  it("saves with valid data", () => {
    render(<CollectionEditor open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("editor-name"), { target: { value: "My Collection" } });
    fireEvent.click(screen.getByTestId("editor-save"));
    expect(onSave).toHaveBeenCalledWith({
      name: "My Collection",
      icon: "📁",
      color: null,
    });
  });

  it("pre-fills in edit mode", () => {
    const existing = makeCollection("c1", "Favorites");
    existing.icon = "⭐";
    render(
      <CollectionEditor open onClose={onClose} onSave={onSave} editCollection={existing} />,
    );
    expect(screen.getByTestId("editor-name")).toHaveValue("Favorites");
  });

  it("cancel closes without saving", () => {
    render(<CollectionEditor open onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("editor-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Story 10.3: CollectionView", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: [makeCollection("c1", "Favorites", ["g1", "g2"])],
    });
    useGameStore.setState({
      games: [makeGame("g1", "Game One"), makeGame("g2", "Game Two"), makeGame("g3", "Game Three")],
    });
  });

  it("renders filtered games", () => {
    render(
      <CollectionView
        collectionId="c1"
        renderCard={(g) => <div data-testid={`card-${g.id}`}>{g.name}</div>}
      />,
    );
    expect(screen.getByTestId("collection-view")).toBeInTheDocument();
    expect(screen.getByTestId("card-g1")).toBeInTheDocument();
    expect(screen.getByTestId("card-g2")).toBeInTheDocument();
    expect(screen.queryByTestId("card-g3")).not.toBeInTheDocument();
  });

  it("shows collection name as heading", () => {
    render(
      <CollectionView collectionId="c1" renderCard={(g) => <div>{g.name}</div>} />,
    );
    expect(screen.getByTestId("collection-heading")).toHaveTextContent("Favorites");
  });

  it("shows Edit Collection button", () => {
    const onEdit = vi.fn();
    render(
      <CollectionView
        collectionId="c1"
        onEditCollection={onEdit}
        renderCard={(g) => <div>{g.name}</div>}
      />,
    );
    fireEvent.click(screen.getByTestId("collection-edit-button"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("shows empty state when no games", () => {
    useCollectionStore.setState({
      collections: [makeCollection("c3", "Empty", [])],
    });
    render(
      <CollectionView collectionId="c3" renderCard={(g) => <div>{g.name}</div>} />,
    );
    expect(screen.getByTestId("collection-empty")).toBeInTheDocument();
    expect(screen.getByText(/No games in this collection/)).toBeInTheDocument();
  });
});

describe("Story 10.4: AddToCollectionPopover", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: [
        makeCollection("c1", "Favorites", ["g1"]),
        makeCollection("c2", "RPGs", []),
      ],
    });
    useToastStore.setState({ toasts: [] });
  });

  it("renders nothing when not open", () => {
    render(
      <AddToCollectionPopover gameId="g1" gameName="Game" open={false} onClose={() => {}} />,
    );
    expect(screen.queryByTestId("add-to-collection-popover")).not.toBeInTheDocument();
  });

  it("lists all collections with checkboxes", () => {
    render(
      <AddToCollectionPopover gameId="g1" gameName="Game" open onClose={() => {}} />,
    );
    expect(screen.getByTestId("atc-option-c1")).toBeInTheDocument();
    expect(screen.getByTestId("atc-option-c2")).toBeInTheDocument();
  });

  it("pre-checks existing memberships", () => {
    render(
      <AddToCollectionPopover gameId="g1" gameName="Game" open onClose={() => {}} />,
    );
    const check = screen.getByTestId("atc-check-c1");
    expect(check.className).toContain("bg-primary");
  });

  it("toggle adds game to collection with toast", () => {
    render(
      <AddToCollectionPopover gameId="g1" gameName="Test Game" open onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("atc-option-c2"));
    expect(useCollectionStore.getState().collections.find((c) => c.id === "c2")?.gameIds).toContain("g1");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toContain("Added");
  });

  it("toggle removes game from collection", () => {
    render(
      <AddToCollectionPopover gameId="g1" gameName="Game" open onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("atc-option-c1"));
    expect(useCollectionStore.getState().collections.find((c) => c.id === "c1")?.gameIds).not.toContain("g1");
  });

  it("'New Collection' calls onNewCollection", () => {
    const onNew = vi.fn();
    render(
      <AddToCollectionPopover gameId="g1" gameName="Game" open onClose={() => {}} onNewCollection={onNew} />,
    );
    fireEvent.click(screen.getByTestId("atc-new-collection"));
    expect(onNew).toHaveBeenCalledOnce();
  });
});

describe("Story 10.5: SortableCollectionList", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: [
        makeCollection("c1", "First", [], 0),
        makeCollection("c2", "Second", [], 1),
        makeCollection("c3", "Third", [], 2),
      ],
      activeCollectionId: null,
    });
  });

  it("renders sortable list", () => {
    render(<SortableCollectionList />);
    expect(screen.getByTestId("sortable-collection-list")).toBeInTheDocument();
  });

  it("renders all collections", () => {
    render(<SortableCollectionList />);
    expect(screen.getByTestId("sortable-collection-c1")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-collection-c2")).toBeInTheDocument();
    expect(screen.getByTestId("sortable-collection-c3")).toBeInTheDocument();
  });

  it("has drag handles", () => {
    render(<SortableCollectionList />);
    expect(screen.getByTestId("drag-handle-c1")).toBeInTheDocument();
    expect(screen.getByTestId("drag-handle-c1")).toHaveAttribute("aria-label", "Reorder First");
  });

  it("clicking collection sets active", () => {
    render(<SortableCollectionList />);
    fireEvent.click(screen.getByText("Second"));
    expect(useCollectionStore.getState().activeCollectionId).toBe("c2");
  });

  it("has role=list for accessibility", () => {
    render(<SortableCollectionList />);
    expect(screen.getByTestId("sortable-collection-list")).toHaveAttribute("role", "list");
  });
});

describe("collectionStore", () => {
  beforeEach(() => {
    useCollectionStore.setState({
      collections: [makeCollection("c1", "Test", ["g1"])],
      activeCollectionId: null,
      isLoading: false,
    });
  });

  it("addCollection adds to list", () => {
    useCollectionStore.getState().addCollection(makeCollection("c2", "New"));
    expect(useCollectionStore.getState().collections).toHaveLength(2);
  });

  it("updateCollection updates fields", () => {
    useCollectionStore.getState().updateCollection("c1", { name: "Updated" });
    expect(useCollectionStore.getState().collections[0].name).toBe("Updated");
  });

  it("removeCollection removes and clears active if matching", () => {
    useCollectionStore.setState({ activeCollectionId: "c1" });
    useCollectionStore.getState().removeCollection("c1");
    expect(useCollectionStore.getState().collections).toHaveLength(0);
    expect(useCollectionStore.getState().activeCollectionId).toBeNull();
  });

  it("addGameToCollection adds gameId", () => {
    useCollectionStore.getState().addGameToCollection("c1", "g2");
    expect(useCollectionStore.getState().collections[0].gameIds).toContain("g2");
  });

  it("addGameToCollection prevents duplicates", () => {
    useCollectionStore.getState().addGameToCollection("c1", "g1");
    expect(useCollectionStore.getState().collections[0].gameIds).toHaveLength(1);
  });

  it("removeGameFromCollection removes gameId", () => {
    useCollectionStore.getState().removeGameFromCollection("c1", "g1");
    expect(useCollectionStore.getState().collections[0].gameIds).toHaveLength(0);
  });

  it("reorderCollections updates sort order", () => {
    useCollectionStore.setState({
      collections: [
        makeCollection("c1", "A", [], 0),
        makeCollection("c2", "B", [], 1),
      ],
    });
    useCollectionStore.getState().reorderCollections(["c2", "c1"]);
    const cols = useCollectionStore.getState().collections;
    expect(cols[0].id).toBe("c2");
    expect(cols[0].sortOrder).toBe(0);
    expect(cols[1].id).toBe("c1");
    expect(cols[1].sortOrder).toBe(1);
  });
});
