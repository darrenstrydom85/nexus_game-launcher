import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ModernApp } from "@/modern/ModernApp";
import { useUiStore } from "@/stores/uiStore";

function renderApp() {
  return render(
    <ModernApp
      page={<div data-testid="page">library page</div>}
      gameDetail={<div data-testid="game-detail" />}
      overlays={<div data-testid="overlays" />}
      onStopGame={vi.fn()}
      onForceIdentify={vi.fn()}
      onResync={vi.fn()}
      isSyncing={false}
      onOpenSettings={vi.fn()}
      onOpenUpdate={vi.fn()}
    />,
  );
}

describe("v1 ModernApp shell", () => {
  beforeEach(() => {
    useUiStore.setState({ activeNav: "library" });
  });

  it("lands on Home", () => {
    renderApp();
    expect(useUiStore.getState().activeNav).toBe("home");
    expect(screen.queryByTestId("page")).not.toBeInTheDocument();
  });

  it("renders the page for other nav items inside one scroll container", () => {
    renderApp();
    act(() => useUiStore.getState().setActiveNav("stats"));
    expect(screen.getByTestId("modern-main")).toContainElement(screen.getByTestId("page"));
  });

  it("mounts the top bar, game detail and shared overlays", () => {
    renderApp();
    expect(screen.getByTestId("top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("game-detail")).toBeInTheDocument();
    expect(screen.getByTestId("overlays")).toBeInTheDocument();
  });
});
