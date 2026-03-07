import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CloseConfirmDialog } from "@/components/Settings/CloseConfirmDialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

describe("CloseConfirmDialog (Story 20.1)", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<CloseConfirmDialog open={false} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with title and actions when open", () => {
    render(<CloseConfirmDialog open={true} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Close Nexus?")).toBeInTheDocument();
    expect(screen.getByLabelText("Close application")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimize to system tray")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    render(<CloseConfirmDialog open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("invokes confirm_app_close when Close is clicked", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    render(<CloseConfirmDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close application"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("confirm_app_close");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("invokes hide_main_window when Minimize to system tray is clicked", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    render(<CloseConfirmDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Minimize to system tray"));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("hide_main_window");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
