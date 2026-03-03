import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import {
  estimateEndTime,
  fetchOrphanedSessions,
  closeOrphanedSession,
  checkProcessRunning,
  recoverOrphanedSessions,
  checkConcurrentLaunch,
  type OrphanedSession,
} from "@/hooks/useOrphanedSessionRecovery";
import type { ActiveSession } from "@/stores/gameStore";

const mockOrphan: OrphanedSession = {
  sessionId: "s1",
  gameId: "g1",
  gameName: "Test Game",
  coverUrl: null,
  heroUrl: null,
  startedAt: "2026-02-28T10:00:00Z",
  exeName: "game.exe",
};

describe("Story 8.7: Orphaned Session Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("estimateEndTime", () => {
    it("returns an ISO date string", () => {
      const result = estimateEndTime("2026-02-28T10:00:00Z");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("fetchOrphanedSessions", () => {
    it("invokes get_orphaned_sessions", async () => {
      mockInvoke.mockResolvedValue([mockOrphan]);
      const result = await fetchOrphanedSessions();
      expect(mockInvoke).toHaveBeenCalledWith("get_orphaned_sessions");
      expect(result).toHaveLength(1);
    });
  });

  describe("closeOrphanedSession", () => {
    it("invokes end_session with sessionId and endedAt", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await closeOrphanedSession("s1");
      expect(mockInvoke).toHaveBeenCalledWith("end_session", expect.objectContaining({ sessionId: "s1" }));
      const call = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === "end_session");
      expect(call?.[1]).toHaveProperty("endedAt");
    });
  });

  describe("checkProcessRunning", () => {
    it("invokes check_process_running", async () => {
      mockInvoke.mockResolvedValue(true);
      const result = await checkProcessRunning("game.exe");
      expect(mockInvoke).toHaveBeenCalledWith("check_process_running", { exeName: "game.exe" });
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      mockInvoke.mockRejectedValue(new Error("fail"));
      const result = await checkProcessRunning("game.exe");
      expect(result).toBe(false);
    });
  });

  describe("recoverOrphanedSessions", () => {
    it("closes sessions when process not running", async () => {
      mockInvoke
        .mockResolvedValueOnce([mockOrphan])
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(undefined);

      const result = await recoverOrphanedSessions();
      expect(result.recovered).toBe(1);
      expect(result.closed).toBe(1);
      expect(result.resumed).toBe(0);
    });

    it("resumes sessions when process is running", async () => {
      mockInvoke
        .mockResolvedValueOnce([mockOrphan])
        .mockResolvedValueOnce(true);

      const result = await recoverOrphanedSessions();
      expect(result.recovered).toBe(1);
      expect(result.closed).toBe(0);
      expect(result.resumed).toBe(1);
    });

    it("handles multiple orphaned sessions", async () => {
      const orphan2 = { ...mockOrphan, sessionId: "s2", gameId: "g2" };
      mockInvoke
        .mockResolvedValueOnce([mockOrphan, orphan2])
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(undefined);

      const result = await recoverOrphanedSessions();
      expect(result.recovered).toBe(2);
      expect(result.resumed).toBe(1);
      expect(result.closed).toBe(1);
    });

    it("handles empty orphaned sessions", async () => {
      mockInvoke.mockResolvedValueOnce([]);
      const result = await recoverOrphanedSessions();
      expect(result.recovered).toBe(0);
    });
  });

  describe("checkConcurrentLaunch", () => {
    it("returns not running when no active session", () => {
      const result = checkConcurrentLaunch(null);
      expect(result.isRunning).toBe(false);
      expect(result.runningGameName).toBeNull();
    });

    it("returns running with game name when session active", () => {
      const session: ActiveSession = {
        sessionId: "s1",
        gameId: "g1",
        gameName: "Cyberpunk 2077",
        coverUrl: null,
        heroUrl: null,
        startedAt: new Date().toISOString(),
        dominantColor: "",
        pid: null,
        exeName: null,
        folderPath: null,
        potentialExeNames: null,
        processDetected: false,
        hasDbSession: true,
      };
      const result = checkConcurrentLaunch(session);
      expect(result.isRunning).toBe(true);
      expect(result.runningGameName).toBe("Cyberpunk 2077");
    });
  });
});
