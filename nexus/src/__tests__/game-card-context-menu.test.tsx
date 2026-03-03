import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameCardContextMenu } from "@/components/GameCard/GameCardContextMenu";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import type { Game } from "@/stores/gameStore";

const mockGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam",
  folderPath: "C:\\Games\\TestGame",
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
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: 3,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
};

const defaultProps = {
  game: mockGame,
  position: { x: 100, y: 200 },
  onClose: vi.fn(),
};

describe("Story 6.4: Game Card Context Menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ detailOverlayGameId: null });
    useToastStore.setState({ toasts: [] });
  });

  it("renders the context menu", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    expect(screen.getByTestId("game-context-menu")).toBeInTheDocument();
  });

  it("is positioned at the given coordinates", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    const menu = screen.getByTestId("game-context-menu");
    expect(menu.style.left).toBe("100px");
    expect(menu.style.top).toBe("200px");
  });

  it("has role=menu", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    expect(screen.getByTestId("game-context-menu")).toHaveAttribute(
      "role",
      "menu",
    );
  });

  it("Play calls onPlay and closes", () => {
    const onPlay = vi.fn();
    render(<GameCardContextMenu {...defaultProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByTestId("ctx-play"));
    expect(onPlay).toHaveBeenCalledWith(mockGame);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("View Details opens detail overlay", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByTestId("ctx-details"));
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
  });

  it("Set Status submenu shows 5 statuses on hover", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    fireEvent.mouseEnter(screen.getByTestId("ctx-status"));
    expect(screen.getByTestId("ctx-status-submenu")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-status-playing")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-status-completed")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-status-backlog")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-status-dropped")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-status-wishlist")).toBeInTheDocument();
  });

  it("Status change calls onSetStatus", () => {
    const onSetStatus = vi.fn();
    render(
      <GameCardContextMenu {...defaultProps} onSetStatus={onSetStatus} />,
    );
    fireEvent.mouseEnter(screen.getByTestId("ctx-status"));
    fireEvent.click(screen.getByTestId("ctx-status-completed"));
    expect(onSetStatus).toHaveBeenCalledWith("g1", "completed");
  });

  it("Rate submenu shows 1-5 stars + Clear", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    fireEvent.mouseEnter(screen.getByTestId("ctx-rate"));
    expect(screen.getByTestId("ctx-rating-submenu")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-rate-1")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-rate-5")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-rate-clear")).toBeInTheDocument();
  });

  it("Rating change calls onSetRating", () => {
    const onSetRating = vi.fn();
    render(
      <GameCardContextMenu {...defaultProps} onSetRating={onSetRating} />,
    );
    fireEvent.mouseEnter(screen.getByTestId("ctx-rate"));
    fireEvent.click(screen.getByTestId("ctx-rate-4"));
    expect(onSetRating).toHaveBeenCalledWith("g1", 4);
  });

  it("Clear rating calls onSetRating with null", () => {
    const onSetRating = vi.fn();
    render(
      <GameCardContextMenu {...defaultProps} onSetRating={onSetRating} />,
    );
    fireEvent.mouseEnter(screen.getByTestId("ctx-rate"));
    fireEvent.click(screen.getByTestId("ctx-rate-clear"));
    expect(onSetRating).toHaveBeenCalledWith("g1", null);
  });

  it("Add to Collection submenu shows collections + New", () => {
    render(
      <GameCardContextMenu
        {...defaultProps}
        collections={["Favorites", "RPGs"]}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId("ctx-collection"));
    expect(screen.getByTestId("ctx-collection-submenu")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-collection-Favorites")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-collection-RPGs")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-collection-new")).toBeInTheDocument();
  });

  it("Edit Game calls onEdit", () => {
    const onEdit = vi.fn();
    render(<GameCardContextMenu {...defaultProps} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("ctx-edit"));
    expect(onEdit).toHaveBeenCalledWith(mockGame);
  });

  it("Hide from Library calls onHide and shows undo toast", () => {
    const onHide = vi.fn();
    render(<GameCardContextMenu {...defaultProps} onHide={onHide} />);
    fireEvent.click(screen.getByTestId("ctx-hide"));
    expect(onHide).toHaveBeenCalledWith(mockGame);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toContain("hidden");
    expect(useToastStore.getState().toasts[0].action?.label).toBe("Undo");
  });

  it("Open Install Folder shown when folderPath exists", () => {
    const onOpenFolder = vi.fn();
    render(
      <GameCardContextMenu {...defaultProps} onOpenFolder={onOpenFolder} />,
    );
    const btn = screen.getByTestId("ctx-open-folder");
    fireEvent.click(btn);
    expect(onOpenFolder).toHaveBeenCalledWith(mockGame);
  });

  it("Open Install Folder hidden when folderPath is null", () => {
    render(
      <GameCardContextMenu
        {...defaultProps}
        game={{ ...mockGame, folderPath: null }}
      />,
    );
    expect(screen.queryByTestId("ctx-open-folder")).not.toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    render(<GameCardContextMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
