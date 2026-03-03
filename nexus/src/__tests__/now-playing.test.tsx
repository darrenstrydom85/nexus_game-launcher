import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NowPlaying, formatTimer } from "@/components/shared/NowPlaying";
import { useGameStore, type ActiveSession } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";

const mockSession: ActiveSession = {
  sessionId: "s1",
  gameId: "g1",
  gameName: "Cyberpunk 2077",
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: "https://example.com/hero.jpg",
  startedAt: new Date(Date.now() - 3600000).toISOString(),
  dominantColor: "rgb(100, 50, 150)",
  pid: 1234,
  exeName: "Cyberpunk2077.exe",
  folderPath: "C:\\Games\\Cyberpunk2077",
  potentialExeNames: null,
  processDetected: false,
  hasDbSession: true,
};

describe("Story 6.6: Now Playing Widget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ activeSession: null });
    useUiStore.setState({ sidebarOpen: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when no active session", () => {
    render(<NowPlaying />);
    expect(screen.queryByTestId("now-playing")).not.toBeInTheDocument();
  });

  it("renders when session is active", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    expect(screen.getByTestId("now-playing")).toBeInTheDocument();
  });

  it("shows game name in expanded mode", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    expect(screen.getByTestId("now-playing-name")).toHaveTextContent(
      "Cyberpunk 2077",
    );
  });

  it("shows pulsing green dot", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const dots = screen.getAllByTestId("now-playing-dot");
    expect(dots.length).toBeGreaterThan(0);
    const dot = dots[0];
    const pingSpan = dot.querySelector(".animate-ping");
    expect(pingSpan).toBeInTheDocument();
  });

  it("shows live timer", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    expect(screen.getByTestId("now-playing-timer")).toBeInTheDocument();
  });

  it("timer uses tabular-nums class", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    expect(screen.getByTestId("now-playing-timer").className).toContain(
      "tabular-nums",
    );
  });

  it("shows Stop and Details buttons in expanded mode", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    expect(screen.getByTestId("now-playing-stop")).toBeInTheDocument();
    expect(screen.getByTestId("now-playing-details")).toBeInTheDocument();
  });

  it("Stop button calls onStop", () => {
    const onStop = vi.fn();
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying onStop={onStop} />);
    fireEvent.click(screen.getByTestId("now-playing-stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("Details button calls onDetails with gameId", () => {
    const onDetails = vi.fn();
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying onDetails={onDetails} />);
    fireEvent.click(screen.getByTestId("now-playing-details"));
    expect(onDetails).toHaveBeenCalledWith("g1");
  });

  it("collapsed mode shows compact timer", () => {
    useGameStore.setState({ activeSession: mockSession });
    useUiStore.setState({ sidebarOpen: false });
    render(<NowPlaying />);
    expect(screen.getByTestId("now-playing-timer-compact")).toBeInTheDocument();
    expect(
      screen.queryByTestId("now-playing-timer"),
    ).not.toBeInTheDocument();
  });

  it("has glassmorphism styling", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const widget = screen.getByTestId("now-playing");
    expect(widget.className).toContain("glass-sidebar");
  });

  it("has accent border and glow", () => {
    useGameStore.setState({ activeSession: mockSession });
    render(<NowPlaying />);
    const widget = screen.getByTestId("now-playing");
    expect(widget.className).toContain("border-primary/20");
  });
});

describe("formatTimer", () => {
  it("formats seconds only", () => {
    expect(formatTimer(42000)).toBe("0:42");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimer(1425000)).toBe("23:45");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatTimer(5025000)).toBe("1:23:45");
  });

  it("formats large hours", () => {
    expect(formatTimer(45296000)).toBe("12:34:56");
  });
});
