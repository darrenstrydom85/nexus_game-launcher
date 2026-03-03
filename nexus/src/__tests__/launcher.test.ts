import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveLaunchProtocol,
  isProtocolLaunch,
  getTrackingStrategy,
  isGameRunning,
  setRunningGame,
  getRunningGameId,
  dispatchLaunch,
} from "@/lib/launcher";
import type { Game } from "@/stores/gameStore";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

const makeGame = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  name: "Test Game",
  source: "standalone",
  folderPath: "C:\\Games\\Test",
  exePath: "C:\\Games\\Test\\game.exe",
  exeName: "game.exe",
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: null,
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
  ...overrides,
});

describe("Story 8.1: Multi-Protocol Launch Dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRunningGame(null);
  });

  describe("resolveLaunchProtocol", () => {
    it("standalone -> direct_exe with exePath", () => {
      const req = resolveLaunchProtocol(makeGame({ source: "standalone" }));
      expect(req.protocol).toBe("direct_exe");
      expect(req.target).toBe("C:\\Games\\Test\\game.exe");
    });

    it("steam -> steam_url with launchUrl", () => {
      const req = resolveLaunchProtocol(
        makeGame({ source: "steam", launchUrl: "steam://rungameid/1234" }),
      );
      expect(req.protocol).toBe("steam_url");
      expect(req.target).toBe("steam://rungameid/1234");
    });

    it("steam -> steam_url fallback with igdbId", () => {
      const req = resolveLaunchProtocol(
        makeGame({ source: "steam", launchUrl: null, igdbId: 5678 }),
      );
      expect(req.protocol).toBe("steam_url");
      expect(req.target).toContain("steam://rungameid/5678");
    });

    it("epic -> epic_url", () => {
      const req = resolveLaunchProtocol(
        makeGame({ source: "epic", launchUrl: "com.epicgames.launcher://apps/abc" }),
      );
      expect(req.protocol).toBe("epic_url");
      expect(req.target).toContain("com.epicgames.launcher");
    });

    it("gog with exePath -> direct_exe", () => {
      const req = resolveLaunchProtocol(
        makeGame({ source: "gog", exePath: "C:\\GOG\\game.exe" }),
      );
      expect(req.protocol).toBe("direct_exe");
      expect(req.target).toBe("C:\\GOG\\game.exe");
    });

    it("gog without exePath -> gog_url", () => {
      const req = resolveLaunchProtocol(
        makeGame({ source: "gog", exePath: null }),
      );
      expect(req.protocol).toBe("gog_url");
      expect(req.target).toContain("goggalaxy://");
    });

    it("ubisoft -> ubisoft_url", () => {
      const req = resolveLaunchProtocol(makeGame({ source: "ubisoft" }));
      expect(req.protocol).toBe("ubisoft_url");
      expect(req.target).toContain("uplay://");
    });

    it("battlenet -> battlenet_url", () => {
      const req = resolveLaunchProtocol(makeGame({ source: "battlenet" }));
      expect(req.protocol).toBe("battlenet_url");
      expect(req.target).toContain("battlenet://");
    });

    it("xbox -> xbox_shell", () => {
      const req = resolveLaunchProtocol(makeGame({ source: "xbox" }));
      expect(req.protocol).toBe("xbox_shell");
      expect(req.target).toContain("shell:AppsFolder");
    });

    it("always includes gameId", () => {
      const req = resolveLaunchProtocol(makeGame({ id: "my-game" }));
      expect(req.gameId).toBe("my-game");
    });
  });

  describe("isProtocolLaunch", () => {
    it("returns false for direct_exe", () => {
      expect(isProtocolLaunch("direct_exe")).toBe(false);
    });

    it("returns true for protocol launches", () => {
      expect(isProtocolLaunch("steam_url")).toBe(true);
      expect(isProtocolLaunch("epic_url")).toBe(true);
      expect(isProtocolLaunch("xbox_shell")).toBe(true);
    });
  });

  describe("getTrackingStrategy", () => {
    it("returns A for direct_exe", () => {
      expect(getTrackingStrategy("direct_exe")).toBe("A");
    });

    it("returns B for protocol launches", () => {
      expect(getTrackingStrategy("steam_url")).toBe("B");
      expect(getTrackingStrategy("epic_url")).toBe("B");
    });
  });

  describe("double-launch prevention", () => {
    it("isGameRunning returns false initially", () => {
      expect(isGameRunning()).toBe(false);
    });

    it("tracks running game", () => {
      setRunningGame("g1");
      expect(isGameRunning()).toBe(true);
      expect(getRunningGameId()).toBe("g1");
    });

    it("clears running game", () => {
      setRunningGame("g1");
      setRunningGame(null);
      expect(isGameRunning()).toBe(false);
    });
  });

  describe("dispatchLaunch", () => {
    it("returns already_running when a game is active", async () => {
      setRunningGame("other-game");
      const result = await dispatchLaunch(makeGame());
      expect(result.status).toBe("already_running");
    });

    it("returns failed when standalone has no exe path", async () => {
      const result = await dispatchLaunch(
        makeGame({ source: "standalone", exePath: null, folderPath: null, exeName: null }),
      );
      expect(result.status).toBe("failed");
      expect(result.error).toContain("No executable path");
    });

    it("invokes launch_game command on success", async () => {
      mockInvoke.mockResolvedValue({
        sessionId: "s1",
        gameId: "g1",
        status: "launched",
        pid: 1234,
      });
      const result = await dispatchLaunch(makeGame());
      expect(mockInvoke).toHaveBeenCalledWith("launch_game", expect.any(Object));
      expect(result.status).toBe("launched");
    });

    it("sets running game on successful launch", async () => {
      mockInvoke.mockResolvedValue({
        sessionId: "s1",
        gameId: "g1",
        status: "launched",
      });
      await dispatchLaunch(makeGame());
      expect(isGameRunning()).toBe(true);
      expect(getRunningGameId()).toBe("g1");
    });

    it("returns failed on invoke error", async () => {
      mockInvoke.mockRejectedValue(new Error("Spawn failed"));
      const result = await dispatchLaunch(makeGame());
      expect(result.status).toBe("failed");
      expect(result.error).toBe("Spawn failed");
    });
  });
});
