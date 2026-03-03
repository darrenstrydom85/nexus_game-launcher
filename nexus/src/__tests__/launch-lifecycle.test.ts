import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

import {
  useLaunchLifecycle,
  type GameLaunchedEvent,
  QUICK_EXIT_THRESHOLD_MS,
} from "@/hooks/useLaunchLifecycle";
import { useGameStore } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import { setRunningGame } from "@/lib/launcher";

describe("Story 8.2: Launch Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({ activeSession: null });
    useToastStore.setState({ toasts: [] });
    setRunningGame(null);
  });

  it("exports useLaunchLifecycle hook", () => {
    expect(typeof useLaunchLifecycle).toBe("function");
  });

  it("registers game-launched and game-exited event listeners", () => {
    renderHook(() => useLaunchLifecycle());
    const eventNames = mockListen.mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain("game-launched");
    expect(eventNames).toContain("game-exited");
  });

  it("sets active session on game-launched event", () => {
    renderHook(() => useLaunchLifecycle());
    const launchedHandler = mockListen.mock.calls.find(
      (c: unknown[]) => c[0] === "game-launched",
    )?.[1];
    expect(launchedHandler).toBeDefined();

    const event: GameLaunchedEvent = {
      sessionId: "s1",
      gameId: "g1",
      gameName: "Test Game",
      coverUrl: null,
      heroUrl: null,
      startedAt: new Date().toISOString(),
    };

    act(() => {
      launchedHandler({ payload: event });
    });

    expect(useGameStore.getState().activeSession).not.toBeNull();
    expect(useGameStore.getState().activeSession?.sessionId).toBe("s1");
    expect(useGameStore.getState().activeSession?.gameName).toBe("Test Game");
  });

  it("clears active session on game-exited event", () => {
    useGameStore.setState({
      activeSession: {
        sessionId: "s1",
        gameId: "g1",
        gameName: "Test",
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
      },
    });

    renderHook(() => useLaunchLifecycle());
    const exitedHandler = mockListen.mock.calls.find(
      (c: unknown[]) => c[0] === "game-exited",
    )?.[1];

    act(() => {
      exitedHandler({ payload: { sessionId: "s1", gameId: "g1", durationS: 3600 } });
    });

    expect(useGameStore.getState().activeSession).toBeNull();
  });

  it("shows toast on normal exit (>5s)", () => {
    renderHook(() => useLaunchLifecycle());

    const launchedHandler = mockListen.mock.calls.find(
      (c: unknown[]) => c[0] === "game-launched",
    )?.[1];
    const exitedHandler = mockListen.mock.calls.find(
      (c: unknown[]) => c[0] === "game-exited",
    )?.[1];

    act(() => {
      launchedHandler({
        payload: {
          sessionId: "s1",
          gameId: "g1",
          gameName: "Test",
          coverUrl: null,
          heroUrl: null,
          startedAt: new Date(Date.now() - 10000).toISOString(),
        },
      });
    });

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10000);

    act(() => {
      exitedHandler({ payload: { sessionId: "s1", gameId: "g1", durationS: 600 } });
    });

    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0);
    expect(useToastStore.getState().toasts[0].message).toContain("Session ended");

    vi.restoreAllMocks();
  });

  it("returns launch function", () => {
    const { result } = renderHook(() => useLaunchLifecycle());
    expect(typeof result.current.launch).toBe("function");
  });

  it("exports QUICK_EXIT_THRESHOLD_MS constant", () => {
    expect(QUICK_EXIT_THRESHOLD_MS).toBe(5000);
  });
});
