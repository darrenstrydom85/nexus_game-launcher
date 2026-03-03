import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  ping,
  scanDirectory,
  launchGame,
  stopGame,
  getPlaytime,
  getMetadata,
  getDbStatus,
  emitTestEvent,
} from "@/lib/tauri";
import type { PingResponse, CommandError } from "@/lib/tauri";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("tauri invoke wrappers", () => {
  it("ping() invokes 'ping' and returns typed PingResponse", async () => {
    const expected: PingResponse = { message: "pong", timestamp: 1709312400000 };
    mockInvoke.mockResolvedValueOnce(expected);

    const result = await ping();

    expect(mockInvoke).toHaveBeenCalledWith("ping");
    expect(result.message).toBe("pong");
    expect(result.timestamp).toBe(1709312400000);
  });

  it("scanDirectory() invokes 'scan_directory' with path arg", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await scanDirectory("/games");
    expect(mockInvoke).toHaveBeenCalledWith("scan_directory", { path: "/games" });
  });

  it("launchGame() invokes 'launch_game' with options", async () => {
    mockInvoke.mockResolvedValueOnce({ pid: 1234, gameId: "g1" });
    const result = await launchGame({ gameId: "g1", args: ["--fullscreen"] });
    expect(mockInvoke).toHaveBeenCalledWith("launch_game", {
      options: { gameId: "g1", args: ["--fullscreen"] },
    });
    expect(result.pid).toBe(1234);
  });

  it("stopGame() invokes 'stop_game' with pid", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await stopGame(1234);
    expect(mockInvoke).toHaveBeenCalledWith("stop_game", { pid: 1234 });
  });

  it("getPlaytime() invokes 'get_playtime' with gameId", async () => {
    mockInvoke.mockResolvedValueOnce({
      gameId: "g1",
      totalSeconds: 3600,
      lastPlayed: "2026-03-01",
    });
    const result = await getPlaytime("g1");
    expect(mockInvoke).toHaveBeenCalledWith("get_playtime", { gameId: "g1" });
    expect(result.totalSeconds).toBe(3600);
  });

  it("getMetadata() invokes 'get_metadata' with gameId", async () => {
    mockInvoke.mockResolvedValueOnce({ id: "g1", title: "Test Game" });
    const result = await getMetadata("g1");
    expect(mockInvoke).toHaveBeenCalledWith("get_metadata", { gameId: "g1" });
    expect(result.title).toBe("Test Game");
  });

  it("getDbStatus() invokes 'get_db_status'", async () => {
    mockInvoke.mockResolvedValueOnce({ connected: true, version: "1.0" });
    const result = await getDbStatus();
    expect(mockInvoke).toHaveBeenCalledWith("get_db_status");
    expect(result.connected).toBe(true);
  });

  it("emitTestEvent() invokes 'emit_test_event' with message", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await emitTestEvent("hello");
    expect(mockInvoke).toHaveBeenCalledWith("emit_test_event", { message: "hello" });
  });

  it("rejects with CommandError shape on failure", async () => {
    const error: CommandError = { kind: "notFound", message: "not found: game xyz" };
    mockInvoke.mockRejectedValueOnce(error);

    try {
      await ping();
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as CommandError;
      expect(err.kind).toBe("notFound");
      expect(err.message).toContain("game xyz");
    }
  });
});
