import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SyncStrip } from "@/modern/shell/SyncStrip";
import { useSyncStore } from "@/stores/syncStore";
import { TooltipProvider } from "@/components/ui/tooltip";

const running = (completed: number, startedAt = 1) =>
  useSyncStore.setState({
    isActive: true,
    startedAt,
    overallCompleted: completed,
    overallTotal: 40,
    trigger: "onboarding",
    phases: [{ phase: "artwork", completed, total: 40, currentGame: "Hades", errors: [] }],
  });

const show = () => render(<SyncStrip />, { wrapper: TooltipProvider });

describe("v1 sync strip", () => {
  beforeEach(() => useSyncStore.setState({ isActive: false, phases: [], overallCompleted: 0, overallTotal: 0, trigger: null, startedAt: null }));
  afterEach(() => vi.useRealTimers());

  it("stays out of the way when nothing is syncing", () => {
    show();
    expect(screen.queryByTestId("sync-strip")).not.toBeInTheDocument();
  });

  it("shows the phase, the game and the count on every page", () => {
    running(12);
    show();
    const strip = screen.getByTestId("sync-strip");
    expect(strip).toHaveTextContent("Fetching artwork");
    expect(screen.getByTestId("sync-strip-game")).toHaveTextContent("Hades");
    expect(strip).toHaveTextContent("12 of 40 · 30%");
  });

  it("hides for this run only", () => {
    running(12, 1);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Hide sync progress" }));
    expect(screen.queryByTestId("sync-strip")).not.toBeInTheDocument();
    act(() => running(0, 2));
    expect(screen.getByTestId("sync-strip")).toBeInTheDocument();
  });

  it("says the library was updated, then goes", () => {
    vi.useFakeTimers();
    running(39);
    show();
    act(() => useSyncStore.setState({ isActive: false, overallCompleted: 40 }));
    expect(screen.getByTestId("sync-strip")).toHaveAttribute("data-state", "done");
    expect(screen.getByTestId("sync-strip")).toHaveTextContent("Library updated");
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByTestId("sync-strip")).not.toBeInTheDocument();
  });
});
