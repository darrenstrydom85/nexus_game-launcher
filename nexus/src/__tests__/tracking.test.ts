import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import {
  startStrategyA,
  detectParentExitedEarly,
  startStrategyB,
  getPollingConfig,
  isLauncherProcess,
  startStrategyC,
  stopTracking,
  shouldFallbackToManual,
  requestProcessPolling,
  type TrackingState,
} from "@/lib/tracking";

describe("Story 8.3: Strategy A — Direct Process Handle", () => {
  it("creates monitoring state with PID", () => {
    const state = startStrategyA("s1", "g1", 1234);
    expect(state.strategy).toBe("A");
    expect(state.status).toBe("monitoring");
    expect(state.pid).toBe(1234);
    expect(state.sessionId).toBe("s1");
  });

  it("detects parent exited early (< 5s)", () => {
    expect(detectParentExitedEarly(1000, 4000)).toBe(true);
  });

  it("does not flag normal exit (>= 5s)", () => {
    expect(detectParentExitedEarly(1000, 7000)).toBe(false);
  });

  it("returns correct sessionId and gameId", () => {
    const state = startStrategyA("session-abc", "game-xyz", 999);
    expect(state.sessionId).toBe("session-abc");
    expect(state.gameId).toBe("game-xyz");
  });
});

describe("Story 8.4: Strategy B — Process List Polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates polling state without PID", () => {
    const state = startStrategyB("s1", "g1");
    expect(state.strategy).toBe("B");
    expect(state.status).toBe("polling");
    expect(state.pid).toBeUndefined();
  });

  it("has correct polling config", () => {
    const config = getPollingConfig();
    expect(config.initialDelayMs).toBe(5000);
    expect(config.pollIntervalMs).toBe(3000);
    expect(config.monitorIntervalMs).toBe(5000);
    expect(config.timeoutMs).toBe(60000);
  });

  it("filters launcher processes", () => {
    expect(isLauncherProcess("steam.exe")).toBe(true);
    expect(isLauncherProcess("Steam.exe")).toBe(true);
    expect(isLauncherProcess("epicgameslauncher.exe")).toBe(true);
    expect(isLauncherProcess("galaxyclient.exe")).toBe(true);
    expect(isLauncherProcess("battle.net.exe")).toBe(true);
    expect(isLauncherProcess("ubisoftconnect.exe")).toBe(true);
  });

  it("does not filter game processes", () => {
    expect(isLauncherProcess("Cyberpunk2077.exe")).toBe(false);
    expect(isLauncherProcess("game.exe")).toBe(false);
    expect(isLauncherProcess("witcher3.exe")).toBe(false);
  });

  it("requestProcessPolling invokes backend command", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await requestProcessPolling("s1", "g1", "game.exe");
    expect(mockInvoke).toHaveBeenCalledWith("start_process_polling", {
      sessionId: "s1",
      gameId: "g1",
      exeName: "game.exe",
    });
  });

  it("timeout is 60 seconds", () => {
    expect(getPollingConfig().timeoutMs).toBe(60000);
  });
});

describe("Story 8.5: Strategy C — Manual Fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates manual tracking state", () => {
    const state = startStrategyC("s1", "g1");
    expect(state.strategy).toBe("C");
    expect(state.status).toBe("manual");
  });

  it("stopTracking invokes end_session with endedAt", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await stopTracking("s1");
    expect(mockInvoke).toHaveBeenCalledWith("end_session", expect.objectContaining({ sessionId: "s1" }));
    const call = mockInvoke.mock.calls.find((c: unknown[]) => c[0] === "end_session");
    expect(call?.[1]).toHaveProperty("endedAt");
  });

  it("shouldFallbackToManual returns true when status is failed", () => {
    const state: TrackingState = {
      sessionId: "s1",
      gameId: "g1",
      strategy: "B",
      status: "failed",
    };
    expect(shouldFallbackToManual(state)).toBe(true);
  });

  it("shouldFallbackToManual returns false when monitoring", () => {
    const state: TrackingState = {
      sessionId: "s1",
      gameId: "g1",
      strategy: "A",
      status: "monitoring",
    };
    expect(shouldFallbackToManual(state)).toBe(false);
  });
});
