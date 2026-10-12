import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@/lib/hltb", () => ({ searchHltb: vi.fn().mockResolvedValue([]) }));

import { GamePage } from "@/modern/game/GamePage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGameStore, type Game, type ActiveSession } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQueueStore } from "@/stores/queueStore";
import { useCollectionStore } from "@/stores/collectionStore";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1", name: "Ori", source: "steam", folderPath: null, exePath: null, exeName: null, launchUrl: null,
    igdbId: null, steamgridId: null, description: "A forest spirit.", coverUrl: null, heroUrl: null, logoUrl: null,
    iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: ["Platformer"],
    releaseDate: "2015-03-11", criticScore: 88, criticScoreCount: 50, communityScore: null,
    communityScoreCount: null, trailerUrl: null, status: "playing", rating: null, totalPlayTimeS: 3600,
    lastPlayedAt: null, playCount: 2, addedAt: "2026-01-01", isHidden: false, hltbMainH: null,
    hltbMainExtraH: null, hltbCompletionistH: null, hltbId: null, hltbFetchedAt: null, notes: null,
    progress: null, milestonesJson: null, completed: false, ...over,
  };
}

const session = (detected: boolean): ActiveSession => ({
  sessionId: "s", gameId: "g1", gameName: "Ori", coverUrl: null, heroUrl: null, startedAt: new Date().toISOString(),
  dominantColor: "", pid: 1, exeName: null, folderPath: null, potentialExeNames: null, processDetected: detected, hasDbSession: true,
});

function renderPage() {
  const props = {
    onPlay: vi.fn(), onEdit: vi.fn(), onSearchMetadata: vi.fn(), onNewCollectionWithGame: vi.fn(),
    onStop: vi.fn(), onForceIdentify: vi.fn(),
  };
  render(
    <TooltipProvider>
      <GamePage gameId="g1" {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("v1 game page", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
    useGameStore.setState({ games: [game()], activeSession: null });
    useUiStore.setState({ activeNav: "library", detailOverlayGameId: "g1", quickViewGameId: "g1" });
    useSettingsStore.setState({ twitchEnabled: true });
    useQueueStore.setState({ entries: [] });
    useCollectionStore.setState({ collections: [] });
  });

  it("shows the game and goes back to where it was opened from", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Ori" })).toBeInTheDocument();
    expect(screen.getByTestId("game-back")).toHaveTextContent("Library");
    fireEvent.click(screen.getByTestId("game-back"));
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });

  it("closes quick view when it opens", () => {
    renderPage();
    expect(useUiStore.getState().quickViewGameId).toBeNull();
  });

  it("closes on Escape but not while typing", () => {
    renderPage();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
    input.remove();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });

  it("only shows Media and Twitch tabs when they have something to show", () => {
    useSettingsStore.setState({ twitchEnabled: false });
    renderPage();
    expect(screen.getByTestId("game-tab-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("game-tab-media")).not.toBeInTheDocument();
    expect(screen.queryByTestId("game-tab-twitch")).not.toBeInTheDocument();
  });

  it("shows the Media tab when there are screenshots", () => {
    useGameStore.setState({ games: [game({ screenshotUrls: ["https://x/1.jpg"] })] });
    renderPage();
    expect(screen.getByTestId("game-tab-media")).toBeInTheDocument();
  });

  describe("action bar", () => {
    it("plays, then stops the running game", () => {
      const { onPlay, onStop } = renderPage();
      fireEvent.click(screen.getByTestId("game-play"));
      expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }));
      act(() => useGameStore.setState({ activeSession: session(true) }));
      expect(screen.getByTestId("game-play")).toHaveTextContent("Stop");
      expect(screen.getByTestId("game-running")).toHaveTextContent("Now playing");
      fireEvent.click(screen.getByTestId("game-play"));
      expect(onStop).toHaveBeenCalledOnce();
    });

    it("offers process identification while launching", () => {
      useGameStore.setState({ activeSession: session(false) });
      const { onForceIdentify } = renderPage();
      fireEvent.click(screen.getByTestId("game-identify"));
      expect(onForceIdentify).toHaveBeenCalledOnce();
    });

    it("rates with the stars", async () => {
      renderPage();
      await act(async () => {
        fireEvent.click(screen.getByTestId("game-star-4"));
      });
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "g1", fields: { rating: 4 } });
    });

    it("shows Uninstalled and a completed toggle for archived games", async () => {
      useGameStore.setState({ games: [game({ status: "removed" })] });
      renderPage();
      expect(screen.getByTestId("game-play")).toBeDisabled();
      await act(async () => {
        fireEvent.click(screen.getByTestId("game-completed-toggle"));
      });
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "g1", fields: { completed: true } });
    });
  });

  describe("shortcuts", () => {
    it("Enter plays from the page", () => {
      const { onPlay } = renderPage();
      fireEvent.keyDown(document.body, { key: "Enter" });
      expect(onPlay).toHaveBeenCalledOnce();
    });

    it("Enter on a focused control does not launch the game", () => {
      const { onPlay } = renderPage();
      fireEvent.keyDown(screen.getByTestId("game-back"), { key: "Enter" });
      fireEvent.keyDown(screen.getByTestId("game-tab-notes"), { key: "Enter" });
      expect(onPlay).not.toHaveBeenCalled();
    });

    it("number keys rate and S cycles status, but not with modifiers", async () => {
      renderPage();
      await act(async () => {
        fireEvent.keyDown(document.body, { key: "3", ctrlKey: true });
      });
      expect(mockInvoke).not.toHaveBeenCalledWith("update_game", expect.anything());
      await act(async () => {
        fireEvent.keyDown(document.body, { key: "3" });
      });
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "g1", fields: { rating: 3 } });
      await act(async () => {
        fireEvent.keyDown(document.body, { key: "s" });
      });
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "g1", fields: { status: "completed" } });
    });
  });
});
