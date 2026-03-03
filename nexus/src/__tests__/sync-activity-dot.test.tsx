import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseSyncStore = vi.fn();
vi.mock("@/stores/syncStore", () => ({
  useSyncStore: (selector: (s: unknown) => unknown) => mockUseSyncStore(selector),
}));

import { SyncActivityDot } from "@/components/Library/SyncActivityDot";
import { TooltipProvider } from "@/components/ui/tooltip";

function getDefaultStoreState() {
  return {
    isActive: false,
    overallCompleted: 0,
    overallTotal: 0,
  };
}

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSyncStore.mockImplementation(
    (selector: (s: unknown) => unknown) => selector(getDefaultStoreState()),
  );
});

describe("SyncActivityDot", () => {
  it("does not render when isActive is false", () => {
    renderWithTooltip(
      <SyncActivityDot dismissed={false} onRestore={() => {}} />,
    );
    expect(screen.queryByTestId("sync-activity-dot")).not.toBeInTheDocument();
  });

  it("does not render when isActive is true but banner is not dismissed", () => {
    mockUseSyncStore.mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ ...getDefaultStoreState(), isActive: true }),
    );
    renderWithTooltip(
      <SyncActivityDot dismissed={false} onRestore={() => {}} />,
    );
    expect(screen.queryByTestId("sync-activity-dot")).not.toBeInTheDocument();
  });

  it("renders when isActive is true and banner is dismissed", () => {
    mockUseSyncStore.mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ ...getDefaultStoreState(), isActive: true }),
    );
    renderWithTooltip(
      <SyncActivityDot dismissed={true} onRestore={() => {}} />,
    );
    expect(screen.getByTestId("sync-activity-dot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Syncing library in the background" })).toBeInTheDocument();
  });

  it("clicking dot calls onRestore", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    mockUseSyncStore.mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ ...getDefaultStoreState(), isActive: true }),
    );
    renderWithTooltip(
      <SyncActivityDot dismissed={true} onRestore={onRestore} />,
    );
    await user.click(screen.getByTestId("sync-activity-dot"));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("tooltip text includes correct overallCompleted / overallTotal values", async () => {
    const user = userEvent.setup();
    mockUseSyncStore.mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({
          ...getDefaultStoreState(),
          isActive: true,
          overallCompleted: 5,
          overallTotal: 10,
        }),
    );
    renderWithTooltip(
      <SyncActivityDot dismissed={true} onRestore={() => {}} />,
    );
    await user.hover(screen.getByTestId("sync-activity-dot"));
    await waitFor(() => {
      const progressLines = screen.getAllByText(/Fetching metadata… 5\/10/);
      expect(progressLines.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 2000 });
  });

  it("disappears when isActive transitions to false", async () => {
    mockUseSyncStore.mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ ...getDefaultStoreState(), isActive: true }),
    );
    const { rerender } = renderWithTooltip(
      <SyncActivityDot dismissed={true} onRestore={() => {}} />,
    );
    expect(screen.getByTestId("sync-activity-dot")).toBeInTheDocument();

    mockUseSyncStore.mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ ...getDefaultStoreState(), isActive: false }),
    );
    rerender(
      <TooltipProvider>
        <SyncActivityDot dismissed={true} onRestore={() => {}} />
      </TooltipProvider>,
    );
    await waitFor(
      () => {
        expect(screen.queryByTestId("sync-activity-dot")).not.toBeInTheDocument();
      },
      { timeout: 500 },
    );
  });
});
