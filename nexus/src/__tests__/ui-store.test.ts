import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@/stores/uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  it("has correct initial state", () => {
    const state = useUiStore.getState();
    expect(state.selectedGameId).toBeNull();
    expect(state.viewMode).toBe("grid");
    expect(state.sidebarOpen).toBe(true);
    expect(state.sortField).toBe("name");
    expect(state.sortDirection).toBe("asc");
    expect(state.searchQuery).toBe("");
    expect(state.detailOverlayGameId).toBeNull();
  });

  it("setSelectedGameId updates selection", () => {
    useUiStore.getState().setSelectedGameId("game-1");
    expect(useUiStore.getState().selectedGameId).toBe("game-1");
  });

  it("setSelectedGameId clears selection with null", () => {
    useUiStore.getState().setSelectedGameId("game-1");
    useUiStore.getState().setSelectedGameId(null);
    expect(useUiStore.getState().selectedGameId).toBeNull();
  });

  it("setViewMode switches between grid and list", () => {
    useUiStore.getState().setViewMode("list");
    expect(useUiStore.getState().viewMode).toBe("list");
    useUiStore.getState().setViewMode("grid");
    expect(useUiStore.getState().viewMode).toBe("grid");
  });

  it("toggleSidebar flips sidebar state", () => {
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it("setSidebarOpen sets sidebar state directly", () => {
    useUiStore.getState().setSidebarOpen(false);
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().setSidebarOpen(true);
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it("setSortField updates sort field", () => {
    useUiStore.getState().setSortField("lastPlayed");
    expect(useUiStore.getState().sortField).toBe("lastPlayed");
  });

  it("setSortDirection updates sort direction", () => {
    useUiStore.getState().setSortDirection("desc");
    expect(useUiStore.getState().sortDirection).toBe("desc");
  });

  it("setSearchQuery updates search query", () => {
    useUiStore.getState().setSearchQuery("witcher");
    expect(useUiStore.getState().searchQuery).toBe("witcher");
  });

  it("setDetailOverlayGameId opens and closes overlay", () => {
    useUiStore.getState().setDetailOverlayGameId("game-1");
    expect(useUiStore.getState().detailOverlayGameId).toBe("game-1");
    useUiStore.getState().setDetailOverlayGameId(null);
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });
});
