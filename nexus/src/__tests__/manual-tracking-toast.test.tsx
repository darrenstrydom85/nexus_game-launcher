import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualTrackingToast } from "@/components/shared/ManualTrackingToast";

describe("Story 8.5: Manual Tracking Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the manual tracking toast", () => {
    render(
      <ManualTrackingToast
        gameName="Cyberpunk 2077"
        startedAt={new Date().toISOString()}
        onStop={() => {}}
      />,
    );
    expect(screen.getByTestId("manual-tracking-toast")).toBeInTheDocument();
  });

  it("displays game name in message", () => {
    render(
      <ManualTrackingToast
        gameName="Cyberpunk 2077"
        startedAt={new Date().toISOString()}
        onStop={() => {}}
      />,
    );
    expect(screen.getByText("Cyberpunk 2077")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't detect/)).toBeInTheDocument();
  });

  it("shows instruction to click Stop", () => {
    render(
      <ManualTrackingToast
        gameName="Game"
        startedAt={new Date().toISOString()}
        onStop={() => {}}
      />,
    );
    expect(screen.getByText(/Click "Stop" when you're done/)).toBeInTheDocument();
  });

  it("displays live timer", () => {
    render(
      <ManualTrackingToast
        gameName="Game"
        startedAt={new Date().toISOString()}
        onStop={() => {}}
      />,
    );
    expect(screen.getByTestId("manual-tracking-timer")).toBeInTheDocument();
  });

  it("timer uses tabular-nums", () => {
    render(
      <ManualTrackingToast
        gameName="Game"
        startedAt={new Date().toISOString()}
        onStop={() => {}}
      />,
    );
    expect(screen.getByTestId("manual-tracking-timer").className).toContain(
      "tabular-nums",
    );
  });

  it("Stop button calls onStop", () => {
    const onStop = vi.fn();
    render(
      <ManualTrackingToast
        gameName="Game"
        startedAt={new Date().toISOString()}
        onStop={onStop}
      />,
    );
    fireEvent.click(screen.getByTestId("manual-tracking-stop"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("has glassmorphism styling", () => {
    render(
      <ManualTrackingToast
        gameName="Game"
        startedAt={new Date().toISOString()}
        onStop={() => {}}
      />,
    );
    expect(screen.getByTestId("manual-tracking-toast").className).toContain(
      "glass-toast",
    );
  });
});
