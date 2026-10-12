import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ModernApp } from "@/modern/ModernApp";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore } from "@/stores/gameStore";

const library = {
  onPlay: vi.fn(),
  onEdit: vi.fn(),
  onSearchMetadata: vi.fn(),
  onNewCollectionWithGame: vi.fn(),
  onNewCollection: vi.fn(),
  onEditCollection: vi.fn(),
  onDeleteCollection: vi.fn(),
  onOpenSettings: vi.fn(),
  onResync: vi.fn(),
  onOpenRandom: vi.fn(),
  syncResult: null,
};

function renderApp() {
  return render(
    <ModernApp
      page={<div data-testid="page">legacy page</div>}
      overlays={<div data-testid="overlays" />}
      library={library}
      onStopGame={vi.fn()}
      onForceIdentify={vi.fn()}
      onResync={vi.fn()}
      isSyncing={false}
      onOpenSettings={vi.fn()}
      onOpenUpdate={vi.fn()}
      onOpenRandom={vi.fn()}
    />,
  );
}

describe("v1 ModernApp shell", () => {
  beforeEach(() => {
    useUiStore.setState({ activeNav: "library", quickViewGameId: null });
    useGameStore.setState({ games: [], isLoading: false, error: null });
  });

  it("lands on Home", () => {
    renderApp();
    expect(useUiStore.getState().activeNav).toBe("home");
    expect(screen.queryByTestId("page")).not.toBeInTheDocument();
  });

  it("renders pages not rebuilt yet inside one scroll container", () => {
    renderApp();
    act(() => useUiStore.getState().setActiveNav("wrapped"));
    expect(screen.getByTestId("modern-main")).toContainElement(screen.getByTestId("page"));
  });

  it.each(["library", "completed", "archive"] as const)("renders the new Library page for %s", (nav) => {
    renderApp();
    act(() => useUiStore.getState().setActiveNav(nav));
    expect(screen.getByTestId("library-page")).toBeInTheDocument();
    expect(screen.queryByTestId("page")).not.toBeInTheDocument();
  });

  it("mounts the top bar and shared overlays", () => {
    renderApp();
    expect(screen.getByTestId("top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("overlays")).toBeInTheDocument();
  });

  it("covers the page with the game page and makes the page inert", () => {
    useGameStore.setState({ games: [{ id: "g1", name: "Ori", source: "steam", genres: [], status: "unset", totalPlayTimeS: 0, addedAt: "2026-01-01" } as never] });
    renderApp();
    act(() => useUiStore.getState().setDetailOverlayGameId("g1"));
    expect(screen.getByTestId("game-page")).toBeInTheDocument();
    expect(screen.getByTestId("modern-main")).toHaveAttribute("inert");
  });
});
