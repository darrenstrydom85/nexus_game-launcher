import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { LibraryPage } from "@/modern/library/LibraryPage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFilterStore } from "@/stores/filterStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useQueueStore } from "@/stores/queueStore";
import { useTagStore } from "@/stores/tagStore";
import { useToastStore } from "@/stores/toastStore";

function game(id: string, over: Partial<Game> = {}): Game {
  return {
    id, name: id, source: "steam", folderPath: null, exePath: null, exeName: null, launchUrl: null,
    igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null,
    iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: [],
    releaseDate: null, criticScore: null, criticScoreCount: null, communityScore: null,
    communityScoreCount: null, trailerUrl: null, status: "unset", rating: null, totalPlayTimeS: 0,
    lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false, hltbMainH: null,
    hltbMainExtraH: null, hltbCompletionistH: null, hltbId: null, hltbFetchedAt: null, notes: null,
    progress: null, milestonesJson: null, completed: false, ...over,
  };
}

const games = [
  game("Ori", { status: "completed", completed: true, rating: 5, totalPlayTimeS: 33_000 }),
  game("Hades", { status: "playing", source: "epic" }),
  game("Celeste", { status: "backlog" }),
  game("Tunic", { status: "removed", totalPlayTimeS: 4_000 }),
  game("Secret", { status: "backlog" }),
];

function renderPage() {
  const props = {
    onPlay: vi.fn(),
    onEdit: vi.fn(),
    onSearchMetadata: vi.fn(),
    onNewCollectionWithGame: vi.fn(),
    onNewCollection: vi.fn(),
    onEditCollection: vi.fn(),
    onDeleteCollection: vi.fn(),
    onOpenSettings: vi.fn(),
    onResync: vi.fn(),
    syncResult: null,
  };
  render(
    <TooltipProvider>
      <LibraryPage {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("v1 Library page", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useGameStore.setState({ games, isLoading: false, error: null });
    useUiStore.setState({
      activeNav: "library", viewMode: "grid", sortField: "name", sortDirection: "asc", searchQuery: "",
      sourceFilter: null, genreFilter: null, quickViewGameId: null, quickViewIds: [],
    });
    useSettingsStore.setState({ hiddenGameIds: ["Secret"], showCardProgress: true });
    useFilterStore.getState().clearAll();
    useCollectionStore.setState({
      collections: [{ id: "c1", name: "Favourites", icon: "", color: null, sortOrder: 0, isSmart: false, rulesJson: null, gameIds: ["Hades"] }],
      activeCollectionId: null,
    });
    useQueueStore.setState({ entries: [] });
    useTagStore.setState({ tags: [], gameTagMap: {} });
    useToastStore.setState({ toasts: [] });
  });

  it("shows installed, visible games and counts per tab", () => {
    renderPage();
    expect(screen.getByTestId("lib-card-Ori")).toBeInTheDocument();
    expect(screen.getByTestId("lib-card-Hades")).toBeInTheDocument();
    expect(screen.queryByTestId("lib-card-Tunic")).not.toBeInTheDocument(); // archived
    expect(screen.queryByTestId("lib-card-Secret")).not.toBeInTheDocument(); // hidden
    expect(screen.getByTestId("lib-tab-all")).toHaveTextContent("3");
    expect(screen.getByTestId("lib-tab-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("lib-tab-archive")).toHaveTextContent("1");
    expect(useUiStore.getState().quickViewIds).toEqual(["Celeste", "Hades", "Ori"]);
  });

  it("filters by status from a chip and clears it", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("filter-chip-status"));
    fireEvent.click(screen.getByTestId("filter-status-playing"));
    expect(screen.getByTestId("lib-card-Hades")).toBeInTheDocument();
    expect(screen.queryByTestId("lib-card-Ori")).not.toBeInTheDocument();
    expect(screen.getByTestId("lib-showing")).toHaveTextContent("Showing 1 of 3");
    fireEvent.click(screen.getByTestId("filter-clear-all"));
    expect(screen.getByTestId("lib-card-Ori")).toBeInTheDocument();
  });

  it("opens quick view from a card", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("lib-card-Celeste"));
    expect(useUiStore.getState().quickViewGameId).toBe("Celeste");
    expect(screen.getByTestId("lib-card-Celeste")).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the full page on double-click", () => {
    renderPage();
    fireEvent.doubleClick(screen.getByTestId("lib-card-Ori"));
    expect(useUiStore.getState().detailOverlayGameId).toBe("Ori");
  });

  it("restricts to a collection's games", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("lib-tab-collection-c1"));
    expect(useCollectionStore.getState().activeCollectionId).toBe("c1");
    expect(screen.getByTestId("lib-card-Hades")).toBeInTheDocument();
    expect(screen.queryByTestId("lib-card-Ori")).not.toBeInTheDocument();
  });

  it("asks before deleting a collection", () => {
    const { onDeleteCollection } = renderPage();
    fireEvent.contextMenu(screen.getByTestId("lib-tab-collection-c1"));
    fireEvent.click(screen.getByTestId("collection-delete-c1"));
    expect(onDeleteCollection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-action"));
    expect(onDeleteCollection).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("shows completed games with their summary on the Completed tab", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("lib-tab-completed"));
    expect(useUiStore.getState().activeNav).toBe("completed");
    expect(screen.getByText("Games completed")).toBeInTheDocument();
    expect(screen.getByTestId("lib-card-Ori")).toBeInTheDocument();
    expect(screen.queryByTestId("lib-card-Hades")).not.toBeInTheDocument();
  });

  it("marks an archived game completed from the Archive tab", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("lib-tab-archive"));
    const table = screen.getByTestId("archive-table");
    expect(within(table).getByText("Tunic")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("archive-completed-Tunic"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "Tunic", fields: { completed: true } });
  });

  describe("card menu", () => {
    it("adds a game to the play queue", () => {
      const add = vi.fn().mockResolvedValue(undefined);
      useQueueStore.setState({ entries: [], add });
      renderPage();
      fireEvent.contextMenu(screen.getByTestId("lib-card-Celeste"));
      fireEvent.click(screen.getByTestId("menu-queue-add"));
      expect(add).toHaveBeenCalledWith("Celeste", "Celeste");
    });

    it("hides a game with an Undo that really unhides it", async () => {
      renderPage();
      fireEvent.contextMenu(screen.getByTestId("lib-card-Celeste"));
      await act(async () => {
        fireEvent.click(screen.getByTestId("menu-hide"));
      });
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "Celeste", fields: { isHidden: true } });
      const toasts = useToastStore.getState().toasts;
      const toast = toasts[toasts.length - 1];
      expect(toast?.action?.label).toBe("Undo");
      await act(async () => {
        toast?.action?.onClick();
      });
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "Celeste", fields: { isHidden: false } });
    });
  });
});
