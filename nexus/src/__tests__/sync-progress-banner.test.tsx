import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockUseSyncStore = vi.fn();
vi.mock("@/stores/syncStore", () => ({
  useSyncStore: (selector: (s: unknown) => unknown) => mockUseSyncStore(selector),
}));

import { SyncProgressBanner } from "@/components/Library/SyncProgressBanner";

function getDefaultStoreState() {
  return {
    isActive: false,
    phases: [] as { phase: "artwork" | "metadata"; completed: number; total: number; currentGame: string | null; errors: { source: string; gameId: string; message: string }[] }[],
    overallCompleted: 0,
    overallTotal: 0,
    startedAt: null as number | null,
  };
}

function createSelectorState(overrides: Partial<ReturnType<typeof getDefaultStoreState>> = {}) {
  const state = { ...getDefaultStoreState(), ...overrides };
  return {
    isActive: state.isActive,
    phases: state.phases,
    overallCompleted: state.overallCompleted,
    overallTotal: state.overallTotal,
    startedAt: state.startedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = createSelectorState();
    return selector(state);
  });
});

describe("SyncProgressBanner", () => {
  it("renders when isActive is true", () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        overallCompleted: 2,
        overallTotal: 10,
        phases: [{ phase: "metadata", completed: 2, total: 10, currentGame: "Game A", errors: [] }],
      });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    expect(screen.getByTestId("sync-progress-banner")).toBeInTheDocument();
  });

  it("does not render when isActive is false", () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({ isActive: false });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    expect(screen.queryByTestId("sync-progress-banner")).not.toBeInTheDocument();
  });

  it("does not render after dismiss button clicked", async () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        overallCompleted: 1,
        overallTotal: 5,
        phases: [],
      });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    expect(screen.getByTestId("sync-progress-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sync-banner-dismiss"));
    await waitFor(
      () => {
        expect(screen.queryByTestId("sync-progress-banner")).not.toBeInTheDocument();
      },
      { timeout: 500 },
    );
  });

  it("re-renders after new sync run starts (dismissed flag resets)", async () => {
    let startedAt: number | null = 1000;
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        startedAt,
        overallCompleted: 1,
        overallTotal: 5,
        phases: [],
      });
      return selector(state);
    });
    const { rerender } = render(<SyncProgressBanner />);
    fireEvent.click(screen.getByTestId("sync-banner-dismiss"));
    await waitFor(
      () => {
        expect(screen.queryByTestId("sync-progress-banner")).not.toBeInTheDocument();
      },
      { timeout: 500 },
    );
    startedAt = 2000;
    rerender(<SyncProgressBanner />);
    expect(screen.getByTestId("sync-progress-banner")).toBeInTheDocument();
  });

  it("progress bar scaleX value matches overallCompleted / overallTotal", () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        overallCompleted: 3,
        overallTotal: 10,
        phases: [],
      });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    const banner = screen.getByTestId("sync-progress-banner");
    const fill = banner.querySelector('.bg-primary.origin-left');
    expect(fill).toBeInTheDocument();
    expect((fill as HTMLElement).style.transform).toBe("scaleX(0.3)");
  });

  it("error badge visible when errors.length > 0, hidden when 0", () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        phases: [
          {
            phase: "metadata",
            completed: 1,
            total: 2,
            currentGame: null,
            errors: [{ source: "IGDB", gameId: "g1", message: "fail" }],
          },
        ],
      });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    expect(screen.getByTestId("sync-errors-badge")).toBeInTheDocument();
    expect(screen.getByText("1 errors")).toBeInTheDocument();
  });

  it("error badge hidden when errors length is 0", () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        phases: [{ phase: "metadata", completed: 1, total: 5, currentGame: null, errors: [] }],
      });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    expect(screen.queryByTestId("sync-errors-badge")).not.toBeInTheDocument();
  });

  it("aria-label contains correct completed and total values", () => {
    mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = createSelectorState({
        isActive: true,
        overallCompleted: 4,
        overallTotal: 12,
        phases: [],
      });
      return selector(state);
    });
    render(<SyncProgressBanner />);
    const banner = screen.getByTestId("sync-progress-banner");
    expect(banner).toHaveAttribute("aria-label", "Sync progress: 4 of 12 games");
  });

  describe("Story 18.6: completion state and auto-dismiss", () => {
    it("completion state renders when isActive transitions to false", async () => {
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: true,
          overallCompleted: 2,
          overallTotal: 5,
          phases: [{ phase: "metadata", completed: 2, total: 5, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      const { rerender } = render(<SyncProgressBanner />);
      expect(screen.getByTestId("sync-progress-banner")).toBeInTheDocument();

      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: false,
          overallCompleted: 2,
          overallTotal: 5,
          phases: [{ phase: "metadata", completed: 2, total: 5, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      rerender(<SyncProgressBanner />);
      await waitFor(() => {
        expect(screen.getByTestId("sync-progress-banner")).toHaveAttribute("data-completion", "true");
      });
    });

    it("Sync complete text visible in completion state", async () => {
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: true,
          overallCompleted: 1,
          overallTotal: 1,
          phases: [{ phase: "metadata", completed: 1, total: 1, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      const { rerender } = render(<SyncProgressBanner />);
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: false,
          overallCompleted: 1,
          overallTotal: 1,
          phases: [{ phase: "metadata", completed: 1, total: 1, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      rerender(<SyncProgressBanner />);
      await waitFor(() => {
        expect(screen.getByText("Sync complete")).toBeInTheDocument();
      });
    });

    it("games updated shows correct count in completion state", async () => {
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: true,
          overallCompleted: 3,
          overallTotal: 10,
          phases: [{ phase: "metadata", completed: 3, total: 10, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      const { rerender } = render(<SyncProgressBanner />);
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: false,
          overallCompleted: 3,
          overallTotal: 10,
          phases: [{ phase: "metadata", completed: 3, total: 10, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      rerender(<SyncProgressBanner />);
      await waitFor(() => {
        expect(screen.getByText("3 games updated")).toBeInTheDocument();
      });
    });

    it("Library is up to date shown when count is 0", async () => {
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: true,
          overallCompleted: 0,
          overallTotal: 0,
          phases: [],
        });
        return selector(state);
      });
      const { rerender } = render(<SyncProgressBanner />);
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: false,
          overallCompleted: 0,
          overallTotal: 0,
          phases: [],
        });
        return selector(state);
      });
      rerender(<SyncProgressBanner />);
      await waitFor(() => {
        expect(screen.getByText("Library is up to date")).toBeInTheDocument();
      });
    });

    it("amber error text shown when errors > 0 in completion state", async () => {
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: true,
          overallCompleted: 2,
          overallTotal: 5,
          phases: [
            {
              phase: "metadata",
              completed: 2,
              total: 5,
              currentGame: null,
              errors: [
                { source: "IGDB", gameId: "g1", message: "fail" },
                { source: "SteamGridDB", gameId: "g2", message: "rate limit" },
              ],
            },
          ],
        });
        return selector(state);
      });
      const { rerender } = render(<SyncProgressBanner />);
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: false,
          overallCompleted: 2,
          overallTotal: 5,
          phases: [
            {
              phase: "metadata",
              completed: 2,
              total: 5,
              currentGame: null,
              errors: [
                { source: "IGDB", gameId: "g1", message: "fail" },
                { source: "SteamGridDB", gameId: "g2", message: "rate limit" },
              ],
            },
          ],
        });
        return selector(state);
      });
      rerender(<SyncProgressBanner />);
      await waitFor(() => {
        expect(screen.getByText("Sync complete with 2 errors")).toBeInTheDocument();
      });
    });

    it("banner auto-dismisses after 3 seconds", async () => {
      vi.useFakeTimers();
      try {
        const stablePhases = [{ phase: "metadata" as const, completed: 1, total: 1, currentGame: null, errors: [] as { source: string; gameId: string; message: string }[] }];
        const activeState = createSelectorState({
          isActive: true,
          overallCompleted: 1,
          overallTotal: 1,
          phases: stablePhases,
        });
        const completedState = createSelectorState({
          isActive: false,
          overallCompleted: 1,
          overallTotal: 1,
          phases: stablePhases,
        });
        mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => selector(activeState));
        const { rerender } = render(<SyncProgressBanner />);
        mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => selector(completedState));
        rerender(<SyncProgressBanner />);
        expect(screen.getByText("Sync complete")).toBeInTheDocument();
        expect(screen.getByTestId("sync-progress-banner")).toHaveAttribute("data-completion", "true");
        await act(async () => {
          vi.advanceTimersByTime(3100);
        });
        expect(screen.queryByTestId("sync-progress-banner")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("manual dismiss during 3-second window cancels timer and dismisses immediately", async () => {
      vi.useFakeTimers();
      try {
        mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
          const state = createSelectorState({
            isActive: true,
            overallCompleted: 1,
            overallTotal: 1,
            phases: [{ phase: "metadata", completed: 1, total: 1, currentGame: null, errors: [] }],
          });
          return selector(state);
        });
        const { rerender } = render(<SyncProgressBanner />);
        mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
          const state = createSelectorState({
            isActive: false,
            overallCompleted: 1,
            overallTotal: 1,
            phases: [{ phase: "metadata", completed: 1, total: 1, currentGame: null, errors: [] }],
          });
          return selector(state);
        });
        rerender(<SyncProgressBanner />);
        expect(screen.getByText("Sync complete")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("sync-banner-dismiss"));
        await act(async () => {});
        expect(screen.queryByTestId("sync-progress-banner")).not.toBeInTheDocument();
        vi.advanceTimersByTime(3000);
        expect(screen.queryByTestId("sync-progress-banner")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("completion state skipped when banner was already dismissed", async () => {
      function ControlledBanner() {
        const [dismissed, setDismissed] = React.useState(false);
        return (
          <SyncProgressBanner
            dismissed={dismissed}
            onDismiss={() => setDismissed(true)}
          />
        );
      }
      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: true,
          overallCompleted: 2,
          overallTotal: 5,
          phases: [{ phase: "metadata", completed: 2, total: 5, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      const { rerender } = render(<ControlledBanner />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("sync-banner-dismiss"));
      });

      mockUseSyncStore.mockImplementation((selector: (s: unknown) => unknown) => {
        const state = createSelectorState({
          isActive: false,
          overallCompleted: 2,
          overallTotal: 5,
          phases: [{ phase: "metadata", completed: 2, total: 5, currentGame: null, errors: [] }],
        });
        return selector(state);
      });
      rerender(<ControlledBanner />);
      await act(async () => {});
      expect(screen.queryByText("Sync complete")).not.toBeInTheDocument();
    });
  });
});
