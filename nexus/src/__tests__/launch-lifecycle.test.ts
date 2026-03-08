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
  GRACE_PERIOD_MS,
  buildUpdatedExeNames,
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

  it("shows toast on normal exit (>5s)", async () => {
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

    await act(async () => {
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

  it("GRACE_PERIOD_MS is 5 minutes (300000ms)", () => {
    expect(GRACE_PERIOD_MS).toBe(5 * 60 * 1000);
  });

  it("returns onProcessSelected and onCancelProcessPicker handlers", () => {
    const { result } = renderHook(() => useLaunchLifecycle());
    expect(typeof result.current.onProcessSelected).toBe("function");
    expect(typeof result.current.onCancelProcessPicker).toBe("function");
  });
});

describe("Story 22.3: buildUpdatedExeNames", () => {
  it("appends exe to null (empty) list", () => {
    expect(buildUpdatedExeNames(null, "game.exe")).toBe("game.exe");
  });

  it("appends exe to existing list", () => {
    expect(buildUpdatedExeNames("launcher.exe", "game.exe")).toBe("launcher.exe, game.exe");
  });

  it("prevents duplicate entries (case-insensitive)", () => {
    expect(buildUpdatedExeNames("Game.exe", "game.exe")).toBe("Game.exe");
  });

  it("preserves existing entries when appending", () => {
    const result = buildUpdatedExeNames("a.exe, b.exe", "c.exe");
    expect(result).toBe("a.exe, b.exe, c.exe");
  });

  it("handles empty string as current", () => {
    expect(buildUpdatedExeNames("", "game.exe")).toBe("game.exe");
  });
});

describe("Story 22.3: Grace Period Auto-Prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({ activeSession: null, showProcessPicker: false });
    useToastStore.setState({ toasts: [] });
    setRunningGame(null);
  });

  it("onCancelProcessPicker ends the session and hides the modal", async () => {
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
        hasDbSession: false,
      },
      showProcessPicker: true,
    });

    const { result } = renderHook(() => useLaunchLifecycle());

    await act(async () => {
      result.current.onCancelProcessPicker();
    });

    expect(useGameStore.getState().activeSession).toBeNull();
    expect(useGameStore.getState().showProcessPicker).toBe(false);
  });

  it("onProcessSelected updates session and shows success toast", async () => {
    useGameStore.setState({
      games: [
        {
          id: "g1",
          name: "Test Game",
          source: "steam",
          folderPath: null,
          exePath: null,
          exeName: null,
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
          status: "playing",
          rating: null,
          totalPlayTimeS: 0,
          lastPlayedAt: null,
          playCount: 0,
          addedAt: new Date().toISOString(),
          isHidden: false,
        },
      ],
      activeSession: {
        sessionId: "s1",
        gameId: "g1",
        gameName: "Test Game",
        coverUrl: null,
        heroUrl: null,
        startedAt: new Date().toISOString(),
        dominantColor: "",
        pid: null,
        exeName: null,
        folderPath: "C:\\Games\\Test",
        potentialExeNames: null,
        processDetected: false,
        hasDbSession: true,
      },
      showProcessPicker: true,
    });

    mockInvoke.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLaunchLifecycle());

    await act(async () => {
      await result.current.onProcessSelected("testgame.exe", 1234);
    });

    const session = useGameStore.getState().activeSession;
    expect(session).not.toBeNull();
    expect(session?.exeName).toBe("testgame.exe");
    expect(session?.processDetected).toBe(true);
    expect(session?.potentialExeNames).toContain("testgame.exe");
    expect(useGameStore.getState().showProcessPicker).toBe(false);

    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].message).toContain("Now tracking");
    expect(toasts[0].message).toContain("testgame.exe");
  });
});
