import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ProcessPickerModal } from "@/components/shared/ProcessPickerModal";
import type { RunningProcessInfo } from "@/lib/tauri";

const mockProcesses: RunningProcessInfo[] = [
  { exeName: "eldenring.exe", pid: 1234, windowTitle: "ELDEN RING" },
  { exeName: "chrome.exe", pid: 5678, windowTitle: "Google Chrome" },
  { exeName: "discord.exe", pid: 9012, windowTitle: "Discord" },
  { exeName: "steam.exe", pid: 3456, windowTitle: null },
];

const { mockListRunningProcesses } = vi.hoisted(() => ({
  mockListRunningProcesses: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  listRunningProcesses: mockListRunningProcesses,
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

describe("Story 22.2: ProcessPickerModal", () => {
  const onProcessSelected = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockListRunningProcesses.mockResolvedValue([...mockProcesses]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderModal(open = true) {
    return render(
      <ProcessPickerModal
        open={open}
        gameName="Elden Ring"
        onProcessSelected={onProcessSelected}
        onCancel={onCancel}
      />,
    );
  }

  async function renderAndWaitForLoad(open = true) {
    const result = renderModal(open);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    return result;
  }

  // ── Rendering ──────────────────────────────────────────────────

  it("renders nothing when open=false", async () => {
    await renderAndWaitForLoad(false);
    expect(screen.queryByTestId("process-picker-modal")).not.toBeInTheDocument();
  });

  it("renders modal when open=true", async () => {
    await renderAndWaitForLoad();
    expect(screen.getByTestId("process-picker-modal")).toBeInTheDocument();
  });

  it("displays game name in the header", async () => {
    await renderAndWaitForLoad();
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
  });

  it("renders process list after loading", async () => {
    await renderAndWaitForLoad();
    expect(screen.getByTestId("process-item-1234")).toBeInTheDocument();
    expect(screen.getByTestId("process-item-5678")).toBeInTheDocument();
    expect(screen.getByTestId("process-item-9012")).toBeInTheDocument();
    expect(screen.getByTestId("process-item-3456")).toBeInTheDocument();
  });

  it("displays exe name and window title for each process", async () => {
    await renderAndWaitForLoad();
    expect(screen.getByText("eldenring.exe")).toBeInTheDocument();
    expect(screen.getByText("ELDEN RING")).toBeInTheDocument();
  });

  it("displays PID for each process", async () => {
    await renderAndWaitForLoad();
    expect(screen.getByText("PID 1234")).toBeInTheDocument();
  });

  // ── Loading State ──────────────────────────────────────────────

  it("shows skeleton rows while loading", async () => {
    mockListRunningProcesses.mockReturnValue(new Promise(() => {}));
    renderModal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("process-skeleton-0")).toBeInTheDocument();
    expect(screen.getByTestId("process-skeleton-5")).toBeInTheDocument();
  });

  // ── Empty State ────────────────────────────────────────────────

  it("shows empty state when no processes found", async () => {
    mockListRunningProcesses.mockResolvedValue([]);
    await renderAndWaitForLoad();
    expect(screen.getByTestId("process-picker-empty")).toBeInTheDocument();
    expect(screen.getByText("No processes found. Try refreshing.")).toBeInTheDocument();
  });

  // ── Search / Filter ────────────────────────────────────────────

  it("filters processes by exe name (debounced)", async () => {
    await renderAndWaitForLoad();
    const input = screen.getByTestId("process-picker-search");
    fireEvent.change(input, { target: { value: "elden" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByTestId("process-item-1234")).toBeInTheDocument();
    expect(screen.queryByTestId("process-item-5678")).not.toBeInTheDocument();
  });

  it("filters processes by window title (case-insensitive)", async () => {
    await renderAndWaitForLoad();
    const input = screen.getByTestId("process-picker-search");
    fireEvent.change(input, { target: { value: "google" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByTestId("process-item-5678")).toBeInTheDocument();
    expect(screen.queryByTestId("process-item-1234")).not.toBeInTheDocument();
  });

  it("shows empty state when filter matches nothing", async () => {
    await renderAndWaitForLoad();
    const input = screen.getByTestId("process-picker-search");
    fireEvent.change(input, { target: { value: "nonexistent" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByTestId("process-picker-empty")).toBeInTheDocument();
  });

  // ── Selection ──────────────────────────────────────────────────

  it("clicking a process selects it", async () => {
    await renderAndWaitForLoad();
    const item = screen.getByTestId("process-item-1234");
    fireEvent.click(item);
    expect(item).toHaveAttribute("aria-selected", "true");
  });

  it("confirm button is disabled when nothing is selected", async () => {
    await renderAndWaitForLoad();
    const btn = screen.getByTestId("process-picker-confirm");
    expect(btn).toBeDisabled();
  });

  it("confirm button is enabled after selecting a process", async () => {
    await renderAndWaitForLoad();
    fireEvent.click(screen.getByTestId("process-item-1234"));
    expect(screen.getByTestId("process-picker-confirm")).not.toBeDisabled();
  });

  it("clicking confirm calls onProcessSelected with correct args", async () => {
    await renderAndWaitForLoad();
    fireEvent.click(screen.getByTestId("process-item-1234"));
    fireEvent.click(screen.getByTestId("process-picker-confirm"));
    expect(onProcessSelected).toHaveBeenCalledWith("eldenring.exe", 1234);
  });

  it("double-clicking a process immediately selects and confirms", async () => {
    await renderAndWaitForLoad();
    fireEvent.doubleClick(screen.getByTestId("process-item-1234"));
    expect(onProcessSelected).toHaveBeenCalledWith("eldenring.exe", 1234);
  });

  // ── Refresh ────────────────────────────────────────────────────

  it("refresh button re-fetches the process list", async () => {
    await renderAndWaitForLoad();
    expect(mockListRunningProcesses).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("process-picker-refresh"));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mockListRunningProcesses).toHaveBeenCalledTimes(2);
  });

  // ── Cancel Flow ────────────────────────────────────────────────

  it("cancel button shows confirmation before ending session", async () => {
    await renderAndWaitForLoad();
    fireEvent.click(screen.getByTestId("process-picker-cancel"));
    expect(screen.getByTestId("process-picker-cancel-confirm")).toBeInTheDocument();
    expect(screen.getByText("End this play session?")).toBeInTheDocument();
  });

  it("confirming cancel calls onCancel", async () => {
    await renderAndWaitForLoad();
    fireEvent.click(screen.getByTestId("process-picker-cancel"));
    fireEvent.click(screen.getByTestId("process-picker-cancel-yes"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("going back from cancel confirmation hides it", async () => {
    await renderAndWaitForLoad();
    fireEvent.click(screen.getByTestId("process-picker-cancel"));
    expect(screen.getByTestId("process-picker-cancel-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("process-picker-cancel-no"));
    expect(screen.queryByTestId("process-picker-cancel-confirm")).not.toBeInTheDocument();
  });

  // ── Keyboard Navigation ────────────────────────────────────────

  it("ArrowDown moves selection down", async () => {
    await renderAndWaitForLoad();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByTestId("process-item-1234")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByTestId("process-item-5678")).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowUp moves selection up", async () => {
    await renderAndWaitForLoad();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(screen.getByTestId("process-item-1234")).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowDown does not go past the last item", async () => {
    await renderAndWaitForLoad();
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(document, { key: "ArrowDown" });
    }
    expect(screen.getByTestId("process-item-3456")).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowUp does not go above the first item", async () => {
    await renderAndWaitForLoad();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(screen.getByTestId("process-item-1234")).toHaveAttribute("aria-selected", "true");
  });

  it("Enter confirms the selected process", async () => {
    await renderAndWaitForLoad();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onProcessSelected).toHaveBeenCalledWith("eldenring.exe", 1234);
  });

  it("Escape calls onCancel", async () => {
    await renderAndWaitForLoad();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape dismisses cancel confirmation first if shown", async () => {
    await renderAndWaitForLoad();
    fireEvent.click(screen.getByTestId("process-picker-cancel"));
    expect(screen.getByTestId("process-picker-cancel-confirm")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("process-picker-cancel-confirm")).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // ── Accessibility ──────────────────────────────────────────────

  it("has proper dialog role and aria attributes", async () => {
    await renderAndWaitForLoad();
    const backdrop = screen.getByTestId("process-picker-backdrop");
    expect(backdrop).toHaveAttribute("role", "dialog");
    expect(backdrop).toHaveAttribute("aria-modal", "true");
    expect(backdrop).toHaveAttribute("aria-label", "Select the process for Elden Ring");
  });

  it("process list has listbox role", async () => {
    await renderAndWaitForLoad();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("process items have option role", async () => {
    await renderAndWaitForLoad();
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(4);
  });

  // ── Error Handling ─────────────────────────────────────────────

  it("shows empty state when listRunningProcesses fails", async () => {
    mockListRunningProcesses.mockRejectedValue(new Error("fail"));
    await renderAndWaitForLoad();
    expect(screen.getByTestId("process-picker-empty")).toBeInTheDocument();
  });
});
