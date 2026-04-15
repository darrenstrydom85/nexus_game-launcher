import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ContinuePlayingCard } from "@/components/Library/ContinuePlayingCard";
import type { Game } from "@/stores/gameStore";

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

const BASE_GAME: Game = {
  id: "g1",
  name: "Kena: Bridge of Spirits",
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: "https://example.com/kena-cover.jpg",
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: ["Action", "Adventure"],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: null,
  totalPlayTimeS: 7200,
  lastPlayedAt: hoursAgo(2),
  playCount: 3,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
  progress: null,
  milestonesJson: null,
  completed: false,
};

function makeGame(overrides?: Partial<Game>): Game {
  return { ...BASE_GAME, ...overrides };
}

describe("Story 25.1: ContinuePlayingCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the game name", () => {
    render(<ContinuePlayingCard game={makeGame()} />);
    expect(screen.getByTestId("continue-playing-name-g1")).toHaveTextContent(
      "Kena: Bridge of Spirits",
    );
  });

  it("renders relative time since last played", () => {
    render(<ContinuePlayingCard game={makeGame()} />);
    const timeEl = screen.getByTestId("continue-playing-time-g1");
    expect(timeEl).toBeInTheDocument();
    expect(timeEl.textContent).toMatch(/ago|just now/);
  });

  it("renders cover image when coverUrl is present", () => {
    render(<ContinuePlayingCard game={makeGame()} />);
    const img = screen.getByAltText("Kena: Bridge of Spirits");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/kena-cover.jpg");
  });

  it("renders placeholder when coverUrl is null", () => {
    render(<ContinuePlayingCard game={makeGame({ coverUrl: null })} />);
    expect(screen.queryByAltText("Kena: Bridge of Spirits")).not.toBeInTheDocument();
    expect(screen.getByTestId("continue-playing-card-g1")).toBeInTheDocument();
  });

  it("does not render time element when lastPlayedAt is null", () => {
    render(<ContinuePlayingCard game={makeGame({ lastPlayedAt: null })} />);
    expect(screen.queryByTestId("continue-playing-time-g1")).not.toBeInTheDocument();
  });

  describe("interactions", () => {
    it("calls onClick with game id when card is clicked", async () => {
      const onClick = vi.fn();
      render(<ContinuePlayingCard game={makeGame()} onClick={onClick} />);
      fireEvent.click(screen.getByTestId("continue-playing-card-g1"));
      expect(onClick).toHaveBeenCalledWith("g1");
    });

    it("calls onPlay with the game when play button is clicked", () => {
      const onPlay = vi.fn();
      const game = makeGame();
      render(<ContinuePlayingCard game={game} onPlay={onPlay} />);
      fireEvent.click(screen.getByTestId("continue-playing-play-g1"));
      expect(onPlay).toHaveBeenCalledWith(game);
    });

    it("play button click does not trigger card onClick", () => {
      const onClick = vi.fn();
      const onPlay = vi.fn();
      render(
        <ContinuePlayingCard game={makeGame()} onClick={onClick} onPlay={onPlay} />,
      );
      fireEvent.click(screen.getByTestId("continue-playing-play-g1"));
      expect(onPlay).toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it("card is keyboard-accessible via Enter", () => {
      const onClick = vi.fn();
      render(<ContinuePlayingCard game={makeGame()} onClick={onClick} />);
      const card = screen.getByTestId("continue-playing-card-g1");
      fireEvent.keyDown(card, { key: "Enter" });
      expect(onClick).toHaveBeenCalledWith("g1");
    });

    it("card is keyboard-accessible via Space", () => {
      const onClick = vi.fn();
      render(<ContinuePlayingCard game={makeGame()} onClick={onClick} />);
      const card = screen.getByTestId("continue-playing-card-g1");
      fireEvent.keyDown(card, { key: " " });
      expect(onClick).toHaveBeenCalledWith("g1");
    });
  });

  describe("accessibility", () => {
    it("has role=button on the card", () => {
      render(<ContinuePlayingCard game={makeGame()} />);
      const card = screen.getByTestId("continue-playing-card-g1");
      expect(card).toHaveAttribute("role", "button");
    });

    it("has an aria-label with game name and time", () => {
      render(<ContinuePlayingCard game={makeGame()} />);
      const card = screen.getByTestId("continue-playing-card-g1");
      const label = card.getAttribute("aria-label");
      expect(label).toContain("Kena: Bridge of Spirits");
    });

    it("play button has an aria-label", () => {
      render(<ContinuePlayingCard game={makeGame()} />);
      const btn = screen.getByTestId("continue-playing-play-g1");
      expect(btn).toHaveAttribute("aria-label", "Play Kena: Bridge of Spirits");
    });

    it("card has tabIndex=0 for keyboard focus", () => {
      render(<ContinuePlayingCard game={makeGame()} />);
      const card = screen.getByTestId("continue-playing-card-g1");
      expect(card).toHaveAttribute("tabindex", "0");
    });
  });

  describe("status accent", () => {
    it("applies success accent for playing status", () => {
      render(<ContinuePlayingCard game={makeGame({ status: "playing" })} />);
      const btn = screen.getByTestId("continue-playing-play-g1");
      expect(btn.className).toContain("bg-success");
    });

    it("applies primary accent for completed status", () => {
      render(<ContinuePlayingCard game={makeGame({ status: "completed" })} />);
      const btn = screen.getByTestId("continue-playing-play-g1");
      expect(btn.className).toContain("bg-primary");
    });

    it("applies destructive accent for dropped status", () => {
      render(<ContinuePlayingCard game={makeGame({ status: "dropped" })} />);
      const btn = screen.getByTestId("continue-playing-play-g1");
      expect(btn.className).toContain("bg-destructive");
    });
  });
});
