import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { ActionBar } from "@/components/GameDetail/ActionBar";
import { NowPlaying } from "@/components/shared/NowPlaying";
import { useGameStore, type ActiveSession, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

import { useLaunchLifecycle } from "@/hooks/useLaunchLifecycle";
import { setRunningGame } from "@/lib/launcher";

const mockGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam",
  folderPath: "C:\\Games\\Test",
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
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
};

const mockSession: ActiveSession = {
  sessionId: "s1",
  gameId: "g1",
  gameName: "Test Game",
  coverUrl: null,
  heroUrl: null,
  startedAt: new Date().toISOString(),
  dominantColor: "rgb(30, 30, 40)",
  pid: null,
  exeName: null,
  folderPath: "C:\\Games\\Test",
  potentialExeNames: null,
  processDetected: false,
  hasDbSession: true,
};

describe("Story 22.4: Force-Identify Button — ActionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Can't find game?' button when isPlaying and processDetected is false", () => {
    render(<ActionBar game={mockGame} isPlaying processDetected={false} />);
    expect(screen.getByTestId("action-force-identify")).toBeInTheDocument();
    expect(screen.getByTestId("action-force-identify")).toHaveTextContent("Can't find game?");
  });

  it("hides the button when processDetected is true", () => {
    render(<ActionBar game={mockGame} isPlaying processDetected />);
    expect(screen.queryByTestId("action-force-identify")).not.toBeInTheDocument();
  });

  it("hides the button when not playing", () => {
    render(<ActionBar game={mockGame} isPlaying={false} processDetected={false} />);
    expect(screen.queryByTestId("action-force-identify")).not.toBeInTheDocument();
  });

  it("calls onForceIdentify when clicked", () => {
    const onForceIdentify = vi.fn();
    render(
      <ActionBar game={mockGame} isPlaying processDetected={false} onForceIdentify={onForceIdentify} />,
    );
    fireEvent.click(screen.getByTestId("action-force-identify"));
    expect(onForceIdentify).toHaveBeenCalledOnce();
  });

  it("has correct aria-label for accessibility", () => {
    render(<ActionBar game={mockGame} isPlaying processDetected={false} />);
    expect(screen.getByTestId("action-force-identify")).toHaveAttribute(
      "aria-label",
      "Identify game process",
    );
  });

  it("is keyboard-reachable via Tab", () => {
    render(<ActionBar game={mockGame} isPlaying processDetected={false} />);
    const btn = screen.getByTestId("action-force-identify");
    expect(btn.tagName.toLowerCase()).toBe("button");
  });
});

describe("Story 22.4: Force-Identify Button — NowPlaying (expanded sidebar)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ activeSession: null });
    useUiStore.setState({ sidebarOpen: true, sidebarVisible: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows force-identify button when processDetected is false", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const btns = screen.getAllByTestId("now-playing-force-identify");
    expect(btns.length).toBeGreaterThan(0);
  });

  it("hides force-identify button when processDetected is true", () => {
    useGameStore.setState({
      activeSession: { ...mockSession, processDetected: true },
    });
    render(<NowPlaying />);
    expect(screen.queryByTestId("now-playing-force-identify")).not.toBeInTheDocument();
  });

  it("calls onForceIdentify when clicked", () => {
    const onForceIdentify = vi.fn();
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying onForceIdentify={onForceIdentify} />);
    const btns = screen.getAllByTestId("now-playing-force-identify");
    fireEvent.click(btns[0]);
    expect(onForceIdentify).toHaveBeenCalledOnce();
  });

  it("has correct aria-label", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const btns = screen.getAllByTestId("now-playing-force-identify");
    expect(btns[0]).toHaveAttribute("aria-label", "Identify game process");
  });
});

describe("Story 22.4: Force-Identify Button — NowPlaying (collapsed sidebar)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ activeSession: null });
    useUiStore.setState({ sidebarOpen: false, sidebarVisible: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows icon-only force-identify button in collapsed mode", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const btns = screen.getAllByTestId("now-playing-force-identify");
    expect(btns.length).toBeGreaterThan(0);
    expect(btns[0]).toHaveAttribute("title", "Identify game process");
  });
});

describe("Story 22.4: Force-Identify Button — NowPlaying (floating bar)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ activeSession: null });
    useUiStore.setState({ sidebarOpen: false, sidebarVisible: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows force-identify button with label in floating mode", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const btns = screen.getAllByTestId("now-playing-force-identify");
    expect(btns.length).toBeGreaterThan(0);
    expect(btns[0]).toHaveTextContent("Can't find game?");
  });
});

describe("Story 22.4: Lifecycle — openForceIdentifyPicker and onForceIdentifyCancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({ activeSession: null, showProcessPicker: false });
    useToastStore.setState({ toasts: [] });
    setRunningGame(null);
  });

  it("openForceIdentifyPicker sets showProcessPicker to true", () => {
    useGameStore.setState({ activeSession: mockSession });
    const { result } = renderHook(() => useLaunchLifecycle());

    act(() => {
      result.current.openForceIdentifyPicker();
    });

    expect(useGameStore.getState().showProcessPicker).toBe(true);
  });

  it("openForceIdentifyPicker does nothing when processDetected is true", () => {
    useGameStore.setState({
      activeSession: { ...mockSession, processDetected: true },
    });
    const { result } = renderHook(() => useLaunchLifecycle());

    act(() => {
      result.current.openForceIdentifyPicker();
    });

    expect(useGameStore.getState().showProcessPicker).toBe(false);
  });

  it("openForceIdentifyPicker does nothing when no active session", () => {
    const { result } = renderHook(() => useLaunchLifecycle());

    act(() => {
      result.current.openForceIdentifyPicker();
    });

    expect(useGameStore.getState().showProcessPicker).toBe(false);
  });

  it("onForceIdentifyCancel closes modal without ending session", () => {
    useGameStore.setState({
      activeSession: mockSession,
      showProcessPicker: true,
    });

    const { result } = renderHook(() => useLaunchLifecycle());

    act(() => {
      result.current.onForceIdentifyCancel();
    });

    expect(useGameStore.getState().showProcessPicker).toBe(false);
    expect(useGameStore.getState().activeSession).not.toBeNull();
  });

  it("onCancelProcessPicker (grace period) ends session", async () => {
    useGameStore.setState({
      activeSession: mockSession,
      showProcessPicker: true,
    });

    const { result } = renderHook(() => useLaunchLifecycle());

    await act(async () => {
      result.current.onCancelProcessPicker();
    });

    expect(useGameStore.getState().showProcessPicker).toBe(false);
    expect(useGameStore.getState().activeSession).toBeNull();
  });
});
