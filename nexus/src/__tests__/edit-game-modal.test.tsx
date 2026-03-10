import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditGameModal } from "@/components/GameDetail/EditGameModal";
import type { Game } from "@/stores/gameStore";

const mockGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam",
  folderPath: "C:\\Games\\Test",
  exePath: "C:\\Games\\Test\\game.exe",
  exeName: "game.exe",
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: "https://example.com/cover.jpg",
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
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
};

describe("Story 7.4: Edit Game Modal", () => {
  const onClose = vi.fn();
  const onSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not open", () => {
    render(<EditGameModal game={mockGame} open={false} onClose={onClose} onSave={onSave} />);
    expect(screen.queryByTestId("edit-game-modal")).not.toBeInTheDocument();
  });

  it("renders modal when open", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    expect(screen.getByTestId("edit-game-modal")).toBeInTheDocument();
    expect(screen.getByTestId("edit-modal-panel")).toBeInTheDocument();
  });

  it("pre-fills name from game", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    expect(screen.getByTestId("edit-name")).toHaveValue("Test Game");
  });

  it("pre-fills exe path from game", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    expect(screen.getByTestId("edit-exe")).toHaveValue("C:\\Games\\Test\\game.exe");
  });

  it("shows cover preview when coverUrl exists", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    expect(screen.getByTestId("edit-cover-preview")).toBeInTheDocument();
  });

  it("saves with updated values", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("edit-name"), { target: { value: "New Name" } });
    fireEvent.click(screen.getByTestId("edit-save"));
    expect(onSave).toHaveBeenCalledWith({
      name: "New Name",
      exePath: "C:\\Games\\Test\\game.exe",
      customCover: null,
      customHero: null,
      potentialExeNames: null,
    });
  });

  it("validates empty name", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("edit-name"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("edit-save"));
    expect(screen.getByTestId("edit-name-error")).toHaveTextContent("Name is required");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("validates invalid exe extension", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("edit-exe"), { target: { value: "C:\\file.txt" } });
    fireEvent.click(screen.getByTestId("edit-save"));
    expect(screen.getByTestId("edit-exe-error")).toHaveTextContent("valid executable");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("validates empty cover input as whitespace-only", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("edit-cover-input"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("edit-save"));
    expect(screen.getByTestId("edit-cover-error")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("'Reset to detected' reverts to original values", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("edit-name"), { target: { value: "Changed" } });
    expect(screen.getByTestId("edit-name")).toHaveValue("Changed");
    fireEvent.click(screen.getByTestId("edit-reset"));
    expect(screen.getByTestId("edit-name")).toHaveValue("Test Game");
  });

  it("closes on Cancel button", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("edit-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on X button", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("edit-modal-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("edit-modal-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape key", () => {
    render(<EditGameModal game={mockGame} open onClose={onClose} onSave={onSave} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
