import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@/stores/gameStore";
import type { Game, ActiveSession } from "@/stores/gameStore";

const mockGame: Game = {
  id: "game-1",
  name: "Test Game",
  source: "steam",
  folderPath: "C:\\Games\\TestGame",
  exePath: "C:\\Games\\TestGame\\game.exe",
  exeName: "game.exe",
  launchUrl: "steam://rungameid/12345",
  igdbId: 100,
  steamgridId: 200,
  description: "A test game",
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: "https://example.com/hero.jpg",
  logoUrl: "https://example.com/logo.png",
  iconUrl: "https://example.com/icon.png",
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: ["Action", "RPG"],
  releaseDate: "2024-01-15",
  criticScore: 87.5,
  criticScoreCount: 42,
  communityScore: 74.2,
  communityScoreCount: 1500,
  trailerUrl: null,
  status: "backlog",
  rating: 4,
  totalPlayTimeS: 3600,
  lastPlayedAt: "2026-02-28T12:00:00Z",
  playCount: 0,
  addedAt: "2026-01-01T00:00:00Z",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
};

const mockSession: ActiveSession = {
  sessionId: "session-1",
  gameId: "game-1",
  gameName: "Test Game",
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: "https://example.com/hero.jpg",
  startedAt: "2026-03-01T10:00:00Z",
  dominantColor: "#1a1a2e",
  pid: 5678,
  exeName: "game.exe",
  folderPath: "C:\\Games\\TestGame",
  potentialExeNames: null,
  processDetected: false,
  hasDbSession: true,
};

describe("gameStore", () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState(), true);
  });

  it("has correct initial state", () => {
    const state = useGameStore.getState();
    expect(state.games).toEqual([]);
    expect(state.activeSession).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setGames updates the games array", () => {
    useGameStore.getState().setGames([mockGame]);
    expect(useGameStore.getState().games).toEqual([mockGame]);
    expect(useGameStore.getState().games).toHaveLength(1);
  });

  it("setGames replaces existing games", () => {
    useGameStore.getState().setGames([mockGame]);
    const newGame = { ...mockGame, id: "game-2", name: "Another Game" };
    useGameStore.getState().setGames([newGame]);
    expect(useGameStore.getState().games).toHaveLength(1);
    expect(useGameStore.getState().games[0].id).toBe("game-2");
  });

  it("setActiveSession sets a session", () => {
    useGameStore.getState().setActiveSession(mockSession);
    expect(useGameStore.getState().activeSession).toEqual(mockSession);
  });

  it("setActiveSession clears session with null", () => {
    useGameStore.getState().setActiveSession(mockSession);
    useGameStore.getState().setActiveSession(null);
    expect(useGameStore.getState().activeSession).toBeNull();
  });

  it("setLoading toggles loading state", () => {
    useGameStore.getState().setLoading(true);
    expect(useGameStore.getState().isLoading).toBe(true);
    useGameStore.getState().setLoading(false);
    expect(useGameStore.getState().isLoading).toBe(false);
  });

  it("setError sets and clears error", () => {
    useGameStore.getState().setError("Something went wrong");
    expect(useGameStore.getState().error).toBe("Something went wrong");
    useGameStore.getState().setError(null);
    expect(useGameStore.getState().error).toBeNull();
  });

  it("setGames propagates score fields from backend", () => {
    const backendGame = {
      ...mockGame,
      criticScore: 91.3,
      criticScoreCount: 55,
      communityScore: 68.0,
      communityScoreCount: 2000,
    };
    useGameStore.getState().setGames([backendGame]);
    const game = useGameStore.getState().games[0];
    expect(game.criticScore).toBe(91.3);
    expect(game.criticScoreCount).toBe(55);
    expect(game.communityScore).toBe(68.0);
    expect(game.communityScoreCount).toBe(2000);
  });

  it("setGames defaults score fields to null when absent", () => {
    const backendGame = { ...mockGame };
    // Simulate backend not sending score fields (undefined → null)
    delete (backendGame as Partial<Game>).criticScore;
    delete (backendGame as Partial<Game>).communityScore;
    useGameStore.getState().setGames([backendGame as Game]);
    const game = useGameStore.getState().games[0];
    expect(game.criticScore).toBeNull();
    expect(game.communityScore).toBeNull();
  });

  it("setGames handles null score fields explicitly", () => {
    const backendGame = {
      ...mockGame,
      criticScore: null,
      criticScoreCount: null,
      communityScore: null,
      communityScoreCount: null,
    };
    useGameStore.getState().setGames([backendGame]);
    const game = useGameStore.getState().games[0];
    expect(game.criticScore).toBeNull();
    expect(game.criticScoreCount).toBeNull();
    expect(game.communityScore).toBeNull();
    expect(game.communityScoreCount).toBeNull();
  });

  it("setGames propagates trailerUrl from backend", () => {
    const backendGame = {
      ...mockGame,
      trailerUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    useGameStore.getState().setGames([backendGame]);
    const game = useGameStore.getState().games[0];
    expect(game.trailerUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("setGames defaults trailerUrl to null when absent", () => {
    const backendGame = { ...mockGame };
    delete (backendGame as Partial<Game>).trailerUrl;
    useGameStore.getState().setGames([backendGame as Game]);
    const game = useGameStore.getState().games[0];
    expect(game.trailerUrl).toBeNull();
  });
});
