import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { QuickViewDrawer } from "@/modern/library/QuickViewDrawer";
import { useGameStore, type Game, type ActiveSession } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { useTagStore } from "@/stores/tagStore";

function game(id: string, over: Partial<Game> = {}): Game {
  return {
    id, name: id, source: "steam", folderPath: null, exePath: null, exeName: null, launchUrl: null,
    igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null,
    iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: ["Action"],
    releaseDate: null, criticScore: null, criticScoreCount: null, communityScore: null,
    communityScoreCount: null, trailerUrl: null, status: "playing", rating: null, totalPlayTimeS: 3600,
    lastPlayedAt: null, playCount: 3, addedAt: "2026-01-01", isHidden: false, hltbMainH: 10,
    hltbMainExtraH: 15, hltbCompletionistH: 20, hltbId: null, hltbFetchedAt: null, notes: null,
    progress: 40, milestonesJson: null, completed: false, ...over,
  };
}

const session = (gameId: string): ActiveSession => ({
  sessionId: "s", gameId, gameName: gameId, coverUrl: null, heroUrl: null, startedAt: new Date().toISOString(),
  dominantColor: "", pid: 1, exeName: null, folderPath: null, potentialExeNames: null, processDetected: true, hasDbSession: true,
});

function renderDrawer() {
  const props = { onPlay: vi.fn(), onEdit: vi.fn(), onSearchMetadata: vi.fn(), onNewCollectionWithGame: vi.fn(), onStop: vi.fn() };
  render(<QuickViewDrawer {...props} />);
  return props;
}

describe("v1 quick view drawer", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useGameStore.setState({
      games: [game("A"), game("B"), game("C"), game("Gone", { status: "removed" })],
      activeSession: null,
    });
    useUiStore.setState({ quickViewGameId: null, quickViewIds: ["A", "B", "C"], detailOverlayGameId: null });
    useMasteryStore.setState({ tiers: new Map() });
    useTagStore.setState({ tags: [], gameTagMap: {} });
  });

  it("is closed until a game is chosen", () => {
    renderDrawer();
    expect(screen.queryByTestId("quick-view")).not.toBeInTheDocument();
  });

  it("shows the game, its stats and its place in the list", () => {
    useUiStore.setState({ quickViewGameId: "B" });
    renderDrawer();
    expect(screen.getByTestId("qv-title")).toHaveTextContent("B");
    expect(screen.getByTestId("qv-position")).toHaveTextContent("2 of 3");
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByLabelText("How long to beat")).toBeInTheDocument();
  });

  it("steps through the list with buttons and arrow keys, wrapping around", () => {
    useUiStore.setState({ quickViewGameId: "A" });
    renderDrawer();
    fireEvent.click(screen.getByTestId("qv-next"));
    expect(useUiStore.getState().quickViewGameId).toBe("B");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(useUiStore.getState().quickViewGameId).toBe("C");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(useUiStore.getState().quickViewGameId).toBe("A");
    fireEvent.click(screen.getByTestId("qv-prev"));
    expect(useUiStore.getState().quickViewGameId).toBe("C");
  });

  it("closes on Escape and from the close button", () => {
    useUiStore.setState({ quickViewGameId: "A" });
    renderDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useUiStore.getState().quickViewGameId).toBeNull();
    act(() => useUiStore.setState({ quickViewGameId: "A" }));
    fireEvent.click(screen.getByTestId("qv-close"));
    expect(useUiStore.getState().quickViewGameId).toBeNull();
  });

  it("ignores arrow keys while typing", () => {
    useUiStore.setState({ quickViewGameId: "A" });
    renderDrawer();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(useUiStore.getState().quickViewGameId).toBe("A");
    input.remove();
  });

  it("plays, and stops once that game is running", () => {
    useUiStore.setState({ quickViewGameId: "A" });
    const { onPlay, onStop } = renderDrawer();
    fireEvent.click(screen.getByTestId("qv-play"));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "A" }));
    act(() => useGameStore.setState({ activeSession: session("A") }));
    expect(screen.getByTestId("qv-play")).toHaveTextContent("Stop");
    fireEvent.click(screen.getByTestId("qv-play"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("opens the full page", () => {
    useUiStore.setState({ quickViewGameId: "A" });
    renderDrawer();
    fireEvent.click(screen.getByTestId("qv-full"));
    expect(useUiStore.getState().detailOverlayGameId).toBe("A");
  });

  it("offers Mark completed instead of Play for archived games", async () => {
    useUiStore.setState({ quickViewGameId: "Gone" });
    renderDrawer();
    expect(screen.queryByTestId("qv-play")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("qv-completed"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "Gone", fields: { completed: true } });
  });
});
