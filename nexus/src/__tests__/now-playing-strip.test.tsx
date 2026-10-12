import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NowPlayingStrip } from "@/modern/shell/NowPlayingStrip";
import { useGameStore, type ActiveSession } from "@/stores/gameStore";

const session: ActiveSession = {
  sessionId: "s1",
  gameId: "g1",
  gameName: "Crimson Desert",
  coverUrl: null,
  heroUrl: null,
  startedAt: new Date(Date.now() - 65_000).toISOString(),
  dominantColor: "rgb(0,0,0)",
  pid: 1,
  exeName: "cd.exe",
  folderPath: null,
  potentialExeNames: null,
  processDetected: true,
  hasDbSession: true,
};

function renderStrip() {
  const handlers = { onStop: vi.fn(), onForceIdentify: vi.fn(), onQuickView: vi.fn() };
  render(<NowPlayingStrip {...handlers} />);
  return handlers;
}

describe("v1 NowPlayingStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useGameStore.setState({ activeSession: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing without a running game", () => {
    renderStrip();
    expect(screen.queryByTestId("now-playing-strip")).not.toBeInTheDocument();
  });

  it("shows the running game with a live timer", () => {
    useGameStore.setState({ activeSession: session });
    renderStrip();
    const strip = screen.getByTestId("now-playing-strip");
    expect(strip).toHaveAttribute("data-state", "running");
    expect(screen.getByTestId("now-playing-strip-name")).toHaveTextContent("Crimson Desert");
    expect(screen.getByTestId("now-playing-strip-timer").textContent).toMatch(/^1:0\d$/);
    expect(screen.queryByTestId("now-playing-strip-identify")).not.toBeInTheDocument();
  });

  it("offers process identification while launching", () => {
    useGameStore.setState({ activeSession: { ...session, processDetected: false } });
    const { onForceIdentify } = renderStrip();
    expect(screen.getByTestId("now-playing-strip")).toHaveAttribute("data-state", "launching");
    fireEvent.click(screen.getByTestId("now-playing-strip-identify"));
    expect(onForceIdentify).toHaveBeenCalledOnce();
  });

  it("stops the game and opens it", () => {
    useGameStore.setState({ activeSession: session });
    const { onStop, onQuickView } = renderStrip();
    fireEvent.click(screen.getByTestId("now-playing-strip-stop"));
    fireEvent.click(screen.getByTestId("now-playing-strip-details"));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onQuickView).toHaveBeenCalledWith("g1");
  });
});
