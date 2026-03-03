import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionBar } from "@/components/GameDetail/ActionBar";
import type { Game } from "@/stores/gameStore";

const mockGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam",
  folderPath: "C:\\Games\\Test",
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
  hltbMainS: null,
  hltbMainPlusS: null,
  hltbCompletionistS: null,
  hltbGameId: null,
  status: "playing",
  rating: 3,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
};

describe("Story 7.2: Action Bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the action bar", () => {
    render(<ActionBar game={mockGame} />);
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });

  it("renders Play button", () => {
    render(<ActionBar game={mockGame} />);
    const btn = screen.getByTestId("action-play");
    expect(btn).toHaveTextContent("Play");
  });

  it("Play button shows 'Playing...' with spinner when isPlaying", () => {
    render(<ActionBar game={mockGame} isPlaying />);
    const btn = screen.getByTestId("action-play");
    expect(btn).toHaveTextContent("Playing...");
    expect(btn).toBeDisabled();
  });

  it("calls onPlay when Play button is clicked", () => {
    const onPlay = vi.fn();
    render(<ActionBar game={mockGame} onPlay={onPlay} />);
    fireEvent.click(screen.getByTestId("action-play"));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("renders status dropdown with current status", () => {
    render(<ActionBar game={mockGame} />);
    expect(screen.getByTestId("action-status")).toHaveTextContent("Playing");
  });

  it("opens status dropdown and shows all statuses", () => {
    render(<ActionBar game={mockGame} />);
    fireEvent.click(screen.getByTestId("action-status"));
    expect(screen.getByTestId("action-status-menu")).toBeInTheDocument();
    expect(screen.getByTestId("action-status-playing")).toBeInTheDocument();
    expect(screen.getByTestId("action-status-completed")).toBeInTheDocument();
    expect(screen.getByTestId("action-status-backlog")).toBeInTheDocument();
    expect(screen.getByTestId("action-status-dropped")).toBeInTheDocument();
    expect(screen.getByTestId("action-status-wishlist")).toBeInTheDocument();
  });

  it("calls onStatusChange when status is selected", () => {
    const onStatusChange = vi.fn();
    render(<ActionBar game={mockGame} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByTestId("action-status"));
    fireEvent.click(screen.getByTestId("action-status-completed"));
    expect(onStatusChange).toHaveBeenCalledWith("completed");
  });

  it("renders 5 rating stars", () => {
    render(<ActionBar game={mockGame} />);
    expect(screen.getByTestId("action-rating")).toBeInTheDocument();
    expect(screen.getByTestId("action-star-1")).toBeInTheDocument();
    expect(screen.getByTestId("action-star-5")).toBeInTheDocument();
  });

  it("clicking same star clears rating (toggles)", () => {
    const onRatingChange = vi.fn();
    render(<ActionBar game={mockGame} onRatingChange={onRatingChange} />);
    fireEvent.click(screen.getByTestId("action-star-3"));
    expect(onRatingChange).toHaveBeenCalledWith(null);
  });

  it("clicking different star sets new rating", () => {
    const onRatingChange = vi.fn();
    render(<ActionBar game={mockGame} onRatingChange={onRatingChange} />);
    fireEvent.click(screen.getByTestId("action-star-5"));
    expect(onRatingChange).toHaveBeenCalledWith(5);
  });

  it("renders More actions menu", () => {
    render(<ActionBar game={mockGame} />);
    fireEvent.click(screen.getByTestId("action-more"));
    expect(screen.getByTestId("action-more-menu")).toBeInTheDocument();
    expect(screen.getByTestId("action-add-collection")).toBeInTheDocument();
    expect(screen.getByTestId("action-edit")).toBeInTheDocument();
    expect(screen.getByTestId("action-refetch")).toBeInTheDocument();
    expect(screen.getByTestId("action-open-folder")).toBeInTheDocument();
    expect(screen.getByTestId("action-hide")).toBeInTheDocument();
  });

  it("hides Open Install Folder when no folderPath", () => {
    render(<ActionBar game={{ ...mockGame, folderPath: null }} />);
    fireEvent.click(screen.getByTestId("action-more"));
    expect(screen.queryByTestId("action-open-folder")).not.toBeInTheDocument();
  });

  it("calls onEdit from More menu", () => {
    const onEdit = vi.fn();
    render(<ActionBar game={mockGame} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId("action-more"));
    fireEvent.click(screen.getByTestId("action-edit"));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("keyboard Enter triggers play", () => {
    const onPlay = vi.fn();
    render(<ActionBar game={mockGame} onPlay={onPlay} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("keyboard 1-5 sets rating", () => {
    const onRatingChange = vi.fn();
    render(<ActionBar game={mockGame} onRatingChange={onRatingChange} />);
    fireEvent.keyDown(document, { key: "4" });
    expect(onRatingChange).toHaveBeenCalledWith(4);
  });

  it("keyboard S cycles status", () => {
    const onStatusChange = vi.fn();
    render(<ActionBar game={mockGame} onStatusChange={onStatusChange} />);
    fireEvent.keyDown(document, { key: "S" });
    expect(onStatusChange).toHaveBeenCalled();
  });

  it("star buttons have aria-labels", () => {
    render(<ActionBar game={mockGame} />);
    expect(screen.getByTestId("action-star-1")).toHaveAttribute(
      "aria-label",
      "Rate 1 star",
    );
    expect(screen.getByTestId("action-star-3")).toHaveAttribute(
      "aria-label",
      "Rate 3 stars",
    );
  });
});
