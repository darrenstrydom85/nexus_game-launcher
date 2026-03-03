import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/shared/Sidebar";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore, type GameSource } from "@/stores/gameStore";

describe("Story 5.5: Sidebar Navigation Component", () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true });
    useGameStore.setState({
      games: [
        {
          id: "1",
          name: "Test Game",
          source: "steam" as GameSource,
          folderPath: null,
          exePath: null,
          exeName: null,
          launchUrl: null,
          igdbId: null,
          steamgridId: null,
          description: null,
          coverUrl: null,
          heroUrl: null,
          logoUrl: null,
          iconUrl: null,
          customCover: null,
          customHero: null,
          potentialExeNames: null,
          genres: ["RPG", "Action"],
          releaseDate: null,
          criticScore: null,
          criticScoreCount: null,
          communityScore: null,
          communityScoreCount: null,
          trailerUrl: null,
          status: "unset",
          rating: null,
          totalPlayTimeS: 0,
          lastPlayedAt: null,
          playCount: 0,
          addedAt: "2026-01-01",
          isHidden: false,
        },
      ],
    });
  });

  it("renders the sidebar nav element", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "aria-label",
      "Main navigation",
    );
  });

  it("renders Library, Stats, Random nav items", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("nav-library")).toBeInTheDocument();
    expect(screen.getByTestId("nav-stats")).toBeInTheDocument();
    expect(screen.getByTestId("nav-random")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("Random")).toBeInTheDocument();
  });

  it("highlights active nav item with accent bar indicator", () => {
    render(<Sidebar activeNav="library" />);
    expect(screen.getByTestId("nav-library-indicator")).toBeInTheDocument();
    expect(
      screen.getByTestId("nav-library-indicator").className,
    ).toContain("bg-primary");
  });

  it("calls onNavigate when nav item is clicked", () => {
    const onNavigate = vi.fn();
    render(<Sidebar onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId("nav-stats"));
    expect(onNavigate).toHaveBeenCalledWith("stats");
  });

  it("renders collections sidebar with add button", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("collections-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("collection-add-button")).toBeInTheDocument();
  });

  it("add collection button calls onAddCollection", () => {
    const onAddCollection = vi.fn();
    render(<Sidebar onAddCollection={onAddCollection} />);
    const btn = screen.getByTestId("collection-add-button");
    fireEvent.click(btn);
    expect(onAddCollection).toHaveBeenCalledOnce();
  });

  it("renders source filter toggles only for sources with games", () => {
    render(<Sidebar />);
    expect(screen.getByTestId("source-filter-steam")).toBeInTheDocument();
    expect(screen.queryByTestId("source-filter-epic")).not.toBeInTheDocument();
    expect(screen.queryByTestId("source-filter-gog")).not.toBeInTheDocument();
  });

  it("source filter clicks call onToggleSource", () => {
    const onToggleSource = vi.fn();
    render(<Sidebar onToggleSource={onToggleSource} />);
    fireEvent.click(screen.getByTestId("source-filter-steam"));
    expect(onToggleSource).toHaveBeenCalledWith("steam");
  });

  it("collapsed mode shows only icons (no text labels)", () => {
    useUiStore.setState({ sidebarOpen: false });
    render(<Sidebar />);
    expect(screen.queryByText("Library")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
    expect(screen.queryByText("Random")).not.toBeInTheDocument();
  });

  it("collapsed mode shows tooltips via title attribute", () => {
    useUiStore.setState({ sidebarOpen: false });
    render(<Sidebar />);
    expect(screen.getByTestId("nav-library")).toHaveAttribute(
      "title",
      "Library",
    );
  });

  it("is keyboard accessible: Tab + Enter navigates", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Sidebar onNavigate={onNavigate} />);

    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");

    expect(onNavigate).toHaveBeenCalled();
  });

  it("nav items have focus-visible ring styles", () => {
    render(<Sidebar />);
    const navItem = screen.getByTestId("nav-library");
    expect(navItem.className).toContain("focus-visible:ring-2");
  });

  it("active nav item has aria-current='page'", () => {
    render(<Sidebar activeNav="stats" />);
    expect(screen.getByTestId("nav-stats")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("nav-library")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("source filters show aria-pressed state", () => {
    useGameStore.setState({
      games: [
        { id: "1", name: "Steam Game", source: "steam" as GameSource, folderPath: null, exePath: null, exeName: null, launchUrl: null, igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null, iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: [], releaseDate: null, criticScore: null, criticScoreCount: null, communityScore: null, communityScoreCount: null, trailerUrl: null, status: "unset", rating: null, totalPlayTimeS: 0, lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false },
        { id: "2", name: "Epic Game", source: "epic" as GameSource, folderPath: null, exePath: null, exeName: null, launchUrl: null, igdbId: null, steamgridId: null, description: null, coverUrl: null, heroUrl: null, logoUrl: null, iconUrl: null, customCover: null, customHero: null, potentialExeNames: null, genres: [], releaseDate: null, criticScore: null, criticScoreCount: null, communityScore: null, communityScoreCount: null, trailerUrl: null, status: "unset", rating: null, totalPlayTimeS: 0, lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false },
      ],
    });
    render(
      <Sidebar
        enabledSources={["steam"]}
        onToggleSource={() => {}}
      />,
    );
    expect(screen.getByTestId("source-filter-steam")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("source-filter-epic")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
