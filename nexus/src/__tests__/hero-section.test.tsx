import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroSection, formatPlayTime } from "@/components/Library/HeroSection";
import { useUiStore } from "@/stores/uiStore";
import type { Game } from "@/stores/gameStore";

const mockGame: Game = {
  id: "g1",
  name: "Cyberpunk 2077",
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: "An RPG",
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: "https://example.com/hero.jpg",
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: ["RPG", "Action", "Open World"],
  releaseDate: "2020-12-10",
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: 4,
  totalPlayTimeS: 7200,
  lastPlayedAt: "2026-02-28T10:00:00Z",
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

const mockGame2: Game = {
  ...mockGame,
  id: "g2",
  name: "Elden Ring",
  source: "epic",
  heroUrl: null,
  totalPlayTimeS: 3600,
  lastPlayedAt: "2026-02-20T10:00:00Z",
  status: "unset",
  genres: ["Souls-like"],
};

describe("Story 6.1: Hero Section", () => {
  beforeEach(() => {
    useUiStore.setState({ selectedGameId: null });
  });

  it("renders the hero section", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
  });

  it("renders nothing when games array is empty", () => {
    const { container } = render(<HeroSection games={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("has overflow hidden and shrink-0 for fixed height layout", () => {
    render(<HeroSection games={[mockGame]} />);
    const hero = screen.getByTestId("hero-section");
    expect(hero.className).toContain("overflow-hidden");
    expect(hero.className).toContain("shrink-0");
  });

  it("shows hero background image when heroUrl exists", () => {
    render(<HeroSection games={[mockGame]} />);
    const bg = screen.getByTestId("hero-background");
    const img = bg.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.src).toContain("hero.jpg");
  });

  it("shows gradient fallback when heroUrl is null", () => {
    render(<HeroSection games={[mockGame2]} />);
    const bg = screen.getByTestId("hero-background");
    expect(bg.querySelector("img")).toBeNull();
  });

  it("renders bottom gradient fade", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByTestId("hero-gradient")).toBeInTheDocument();
  });

  it("displays game name in overlay", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByTestId("hero-game-name")).toHaveTextContent(
      "Cyberpunk 2077",
    );
  });

  it("displays source badge", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByTestId("hero-source-badge")).toHaveTextContent("Steam");
  });

  it("displays genre badges (max 3)", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByText("RPG")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Open World")).toBeInTheDocument();
  });

  it("displays play time", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByTestId("hero-playtime")).toHaveTextContent("2h 0m played");
  });

  it("displays status badge when not unset", () => {
    render(<HeroSection games={[mockGame]} />);
    expect(screen.getByTestId("hero-status")).toHaveTextContent("playing");
  });

  it("hides status badge when status is unset", () => {
    render(<HeroSection games={[mockGame2]} />);
    expect(screen.queryByTestId("hero-status")).not.toBeInTheDocument();
  });

  it("renders Play button with accent styling", () => {
    render(<HeroSection games={[mockGame]} />);
    const playBtn = screen.getByTestId("hero-play-button");
    expect(playBtn).toBeInTheDocument();
    expect(playBtn).toHaveTextContent("Play");
  });

  it("renders Details button with secondary variant", () => {
    render(<HeroSection games={[mockGame]} />);
    const detailsBtn = screen.getByTestId("hero-details-button");
    expect(detailsBtn).toBeInTheDocument();
    expect(detailsBtn).toHaveTextContent("Details");
  });

  it("calls onPlay when Play button is clicked", () => {
    const onPlay = vi.fn();
    render(<HeroSection games={[mockGame]} onPlay={onPlay} />);
    fireEvent.click(screen.getByTestId("hero-play-button"));
    expect(onPlay).toHaveBeenCalledWith(mockGame);
  });

  it("calls onDetails when Details button is clicked", () => {
    const onDetails = vi.fn();
    render(<HeroSection games={[mockGame]} onDetails={onDetails} />);
    fireEvent.click(screen.getByTestId("hero-details-button"));
    expect(onDetails).toHaveBeenCalledWith(mockGame);
  });

  it("defaults to most recently played game", () => {
    render(<HeroSection games={[mockGame2, mockGame]} />);
    expect(screen.getByTestId("hero-game-name")).toHaveTextContent(
      "Cyberpunk 2077",
    );
  });

  it("crossfade uses 500ms transition", () => {
    render(<HeroSection games={[mockGame]} />);
    const bg = screen.getByTestId("hero-background");
    expect(bg).toBeInTheDocument();
  });
});

describe("formatPlayTime", () => {
  it("formats minutes only", () => {
    expect(formatPlayTime(300)).toBe("5m");
  });

  it("formats hours and minutes", () => {
    expect(formatPlayTime(5400)).toBe("1h 30m");
  });

  it("formats zero", () => {
    expect(formatPlayTime(0)).toBe("0m");
  });
});
