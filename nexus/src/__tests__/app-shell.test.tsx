import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
  }),
}));

import { AppShell } from "@/components/shared/AppShell";
import { useUiStore } from "@/stores/uiStore";

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

describe("Story 5.4: App Shell Layout Component", () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true });
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1400,
    });
  });

  it("renders the app shell with titlebar, sidebar, and content", () => {
    render(<AppShell><div data-testid="child">Hello</div></AppShell>);
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("titlebar")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-content")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("sidebar is 240px when expanded", () => {
    render(<AppShell>content</AppShell>);
    const sidebar = screen.getByTestId("app-shell-sidebar");
    expect(sidebar.style.width).toBe("240px");
  });

  it("sidebar is 64px when collapsed", () => {
    useUiStore.setState({ sidebarOpen: false });
    render(<AppShell>content</AppShell>);
    const sidebar = screen.getByTestId("app-shell-sidebar");
    expect(sidebar.style.width).toBe("64px");
  });

  it("collapse toggle button toggles sidebar state", () => {
    render(<AppShell>content</AppShell>);
    const toggle = screen.getByTestId("sidebar-collapse-toggle");
    expect(screen.getByLabelText("Collapse sidebar")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it("shows expand label when sidebar is collapsed", () => {
    useUiStore.setState({ sidebarOpen: false });
    render(<AppShell>content</AppShell>);
    expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
  });

  it("auto-collapses sidebar at window width < 1000px", () => {
    useUiStore.setState({ sidebarOpen: true });
    render(<AppShell>content</AppShell>);

    setWindowWidth(999);

    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it("shows sidebar at >= 1000px (compact layout)", () => {
    setWindowWidth(1200);
    render(<AppShell>content</AppShell>);
    expect(screen.getByTestId("app-shell-sidebar")).toBeInTheDocument();
  });

  it("hides sidebar and shows hamburger at < 800px (minimal layout)", () => {
    setWindowWidth(799);
    render(<AppShell>content</AppShell>);
    expect(screen.queryByTestId("app-shell-sidebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("hamburger-menu")).toBeInTheDocument();
  });

  it("content area fills remaining space", () => {
    render(<AppShell>content</AppShell>);
    const content = screen.getByTestId("app-shell-content");
    expect(content.className).toContain("flex-1");
    expect(content.className).toContain("overflow-y-auto");
  });

  it("sidebar state is persisted in uiStore", () => {
    render(<AppShell>content</AppShell>);
    fireEvent.click(screen.getByTestId("sidebar-collapse-toggle"));
    expect(useUiStore.getState().sidebarOpen).toBe(false);

    fireEvent.click(screen.getByTestId("sidebar-collapse-toggle"));
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });
});
