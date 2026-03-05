import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn().mockResolvedValue(false),
  onResized: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks,
}));

import { Titlebar } from "@/components/shared/Titlebar";

describe("Story 5.3: Custom Window Chrome & Titlebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMaximized.mockResolvedValue(false);
    mocks.onResized.mockResolvedValue(() => {});
  });

  it("renders the titlebar element", () => {
    render(<Titlebar />);
    expect(screen.getByTestId("titlebar")).toBeInTheDocument();
  });

  it("displays app logo and 'Nexus' text", () => {
    render(<Titlebar />);
    expect(screen.getByLabelText("Go to Library")).toBeInTheDocument();
    expect(screen.getByText("Nexus")).toBeInTheDocument();
  });

  it("titlebar has data-tauri-drag-region and drag CSS class", () => {
    render(<Titlebar />);
    const titlebar = screen.getByTestId("titlebar");
    expect(titlebar).toHaveAttribute("data-tauri-drag-region");
    expect(titlebar.className).toContain("titlebar-drag-region");
  });

  it("renders search trigger button", () => {
    render(<Titlebar />);
    expect(screen.getByTestId("titlebar-search")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("renders minimize button that calls appWindow.minimize()", () => {
    render(<Titlebar />);
    fireEvent.click(screen.getByTestId("titlebar-minimize"));
    expect(mocks.minimize).toHaveBeenCalledOnce();
  });

  it("renders maximize button that calls appWindow.toggleMaximize()", () => {
    render(<Titlebar />);
    fireEvent.click(screen.getByTestId("titlebar-maximize"));
    expect(mocks.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("renders close button that calls appWindow.close()", () => {
    render(<Titlebar />);
    fireEvent.click(screen.getByTestId("titlebar-close"));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("double-click on titlebar toggles maximize", () => {
    render(<Titlebar />);
    fireEvent.doubleClick(screen.getByTestId("titlebar"));
    expect(mocks.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("shows Restore label when maximized", async () => {
    mocks.isMaximized.mockResolvedValue(true);
    render(<Titlebar />);
    await vi.waitFor(() => {
      expect(screen.getByLabelText("Restore")).toBeInTheDocument();
    });
  });

  it("shows Maximize label when not maximized", () => {
    render(<Titlebar />);
    expect(screen.getByLabelText("Maximize")).toBeInTheDocument();
  });

  it("window controls container has no-drag CSS class", () => {
    render(<Titlebar />);
    const controlsContainer = screen.getByTestId("titlebar-minimize").parentElement!;
    expect(controlsContainer.className).toContain("titlebar-no-drag");
  });

  it("close button has destructive hover styling class", () => {
    render(<Titlebar />);
    const closeBtn = screen.getByTestId("titlebar-close");
    expect(closeBtn.className).toContain("hover:bg-destructive");
  });

  it("verifies decorations:false in tauri.conf.json", () => {
    const fs = require("fs");
    const path = require("path");
    const config = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../../src-tauri/tauri.conf.json"),
        "utf-8",
      ),
    );
    expect(config.app.windows[0].decorations).toBe(false);
  });
});
