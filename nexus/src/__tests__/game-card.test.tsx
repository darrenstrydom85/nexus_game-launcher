import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GameCard,
  SourceBadge,
  PlayTimeBadge,
  StatusBadge,
  placeholderGradient,
} from "@/components/GameCard";
import { useUiStore } from "@/stores/uiStore";
import type { Game } from "@/stores/gameStore";

const mockGame: Game = {
  id: "g1",
  name: "Test Game",
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
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
  genres: ["RPG"],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: 4,
  totalPlayTimeS: 7200,
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

const noArtGame: Game = {
  ...mockGame,
  id: "g2",
  name: "No Art Game",
  coverUrl: null,
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
};

describe("Story 6.3: GameCard Component", () => {
  beforeEach(() => {
    useUiStore.setState({ detailOverlayGameId: null });
  });

  it("renders the game card", () => {
    render(<GameCard game={mockGame} />);
    expect(screen.getByTestId("game-card-g1")).toBeInTheDocument();
  });

  it("displays cover art when coverUrl exists", () => {
    render(<GameCard game={mockGame} />);
    const img = screen.getByTestId("game-card-g1").querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.src).toContain("cover.jpg");
  });

  it("has 2:3 aspect ratio", () => {
    render(<GameCard game={mockGame} />);
    const card = screen.getByTestId("game-card-g1");
    expect(card.style.aspectRatio).toBe("2 / 3");
  });

  it("displays game name (max 2 lines ellipsis via line-clamp-2)", () => {
    render(<GameCard game={mockGame} />);
    const name = screen.getByTestId("game-card-name-g1");
    expect(name).toHaveTextContent("Test Game");
    expect(name.className).toContain("line-clamp-2");
  });

  it("has hover scale and glow effects in className", () => {
    render(<GameCard game={mockGame} />);
    const card = screen.getByTestId("game-card-g1");
    expect(card.className).toContain("hover:scale-105");
    expect(card.className).toContain("hover:-translate-y-1");
  });

  it("opens detail overlay on click", () => {
    render(<GameCard game={mockGame} />);
    fireEvent.click(screen.getByTestId("game-card-g1"));
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
  });

  it("is keyboard accessible (Enter opens detail)", () => {
    render(<GameCard game={mockGame} />);
    const card = screen.getByTestId("game-card-g1");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
  });

  it("calls onHover and onHoverEnd callbacks", () => {
    const onHover = vi.fn();
    const onHoverEnd = vi.fn();
    render(
      <GameCard game={mockGame} onHover={onHover} onHoverEnd={onHoverEnd} />,
    );
    const card = screen.getByTestId("game-card-g1");
    fireEvent.mouseEnter(card);
    expect(onHover).toHaveBeenCalledWith("g1");
    fireEvent.mouseLeave(card);
    expect(onHoverEnd).toHaveBeenCalled();
  });
});

describe("SourceBadge", () => {
  it("renders source label", () => {
    render(<SourceBadge source="steam" />);
    expect(screen.getByTestId("source-badge")).toHaveTextContent("Steam");
  });

  it("renders as pill with top-right positioning", () => {
    render(<SourceBadge source="epic" />);
    const badge = screen.getByTestId("source-badge");
    expect(badge.className).toContain("absolute");
    expect(badge.className).toContain("right-2");
    expect(badge.className).toContain("top-2");
    expect(badge.className).toContain("rounded-full");
  });
});

describe("PlayTimeBadge", () => {
  it("renders play time", () => {
    render(<PlayTimeBadge seconds={7200} />);
    expect(screen.getByTestId("playtime-badge")).toHaveTextContent("2h 0m");
  });

  it("returns null when seconds is 0", () => {
    const { container } = render(<PlayTimeBadge seconds={0} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("StatusBadge", () => {
  it("renders colored dot for playing status", () => {
    render(<StatusBadge status="playing" />);
    const badge = screen.getByTestId("status-badge");
    expect(badge.className).toContain("bg-success");
    expect(badge.className).toContain("rounded-full");
  });

  it("returns null for unset status", () => {
    const { container } = render(<StatusBadge status="unset" />);
    expect(container.firstChild).toBeNull();
  });
});


describe("Placeholder card", () => {
  it("renders placeholder when coverUrl is null", () => {
    render(<GameCard game={noArtGame} />);
    expect(
      screen.getByTestId("game-card-placeholder-g2"),
    ).toBeInTheDocument();
  });

  it("shows game name centered in placeholder", () => {
    render(<GameCard game={noArtGame} />);
    const placeholder = screen.getByTestId("game-card-placeholder-g2");
    expect(placeholder).toHaveTextContent("No Art Game");
  });

  it("placeholderGradient returns a linear-gradient string", () => {
    const grad = placeholderGradient("Test");
    expect(grad).toContain("linear-gradient");
    expect(grad).toContain("hsl(");
  });

  it("placeholderGradient is deterministic", () => {
    expect(placeholderGradient("Foo")).toBe(placeholderGradient("Foo"));
  });

  it("placeholderGradient varies by name", () => {
    expect(placeholderGradient("Foo")).not.toBe(placeholderGradient("Bar"));
  });
});
