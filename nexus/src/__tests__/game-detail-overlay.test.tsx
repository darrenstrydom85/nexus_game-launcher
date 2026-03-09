import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameDetailOverlay } from "@/components/GameDetail/GameDetailOverlay";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore, type Game } from "@/stores/gameStore";

const mockGame: Game = {
  id: "g1",
  name: "Cyberpunk 2077",
  source: "steam",
  folderPath: "C:\\Games\\Cyberpunk",
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: "An open-world RPG",
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: "https://example.com/hero.jpg",
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: ["RPG", "Action"],
  releaseDate: "2020-12-10",
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: 4,
  totalPlayTimeS: 72000,
  lastPlayedAt: "2026-02-28T10:00:00Z",
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
};

describe("Story 7.1: Game Detail Overlay Shell", () => {
  beforeEach(() => {
    useGameStore.setState({ games: [mockGame] });
    useUiStore.setState({ detailOverlayGameId: null });
    document.body.style.overflow = "";
  });

  it("renders nothing when detailOverlayGameId is null", () => {
    render(<GameDetailOverlay />);
    expect(screen.queryByTestId("detail-overlay")).not.toBeInTheDocument();
  });

  it("renders overlay when detailOverlayGameId is set", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    expect(screen.getByTestId("detail-overlay")).toBeInTheDocument();
  });

  it("renders glassmorphism backdrop", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    const backdrop = screen.getByTestId("detail-overlay-backdrop");
    expect(backdrop).toBeInTheDocument();
    expect(backdrop.className).toContain("glass-overlay");
  });

  it("renders content panel", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    expect(screen.getByTestId("detail-overlay-panel")).toBeInTheDocument();
  });

  it("renders hero banner at top 40%", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    const hero = screen.getByTestId("detail-overlay-hero");
    expect(hero).toBeInTheDocument();
    expect(hero.className).toContain("h-[40%]");
  });

  it("displays hero image when heroUrl exists", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    const hero = screen.getByTestId("detail-overlay-hero");
    const img = hero.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img?.src).toContain("hero.jpg");
  });

  it("displays game name when no logoUrl", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    expect(screen.getByTestId("detail-overlay-title")).toHaveTextContent(
      "Cyberpunk 2077",
    );
  });

  it("displays source badge", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    expect(screen.getByTestId("detail-overlay-source")).toHaveTextContent(
      "Steam",
    );
  });

  it("renders scrollable content area", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    const content = screen.getByTestId("detail-overlay-content");
    expect(content).toBeInTheDocument();
    expect(content.className).toContain("overflow-y-auto");
  });

  it("renders children with game data", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(
      <GameDetailOverlay>
        {(game) => <div data-testid="child">{game.name}</div>}
      </GameDetailOverlay>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Cyberpunk 2077");
  });

  it("closes on X button click", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    fireEvent.click(screen.getByTestId("detail-overlay-close"));
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });

  it("closes on backdrop click", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    fireEvent.click(screen.getByTestId("detail-overlay-backdrop"));
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });

  it("closes on Escape key", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useUiStore.getState().detailOverlayGameId).toBeNull();
  });

  it("close button has aria-label", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    expect(screen.getByTestId("detail-overlay-close")).toHaveAttribute(
      "aria-label",
      "Close detail overlay",
    );
  });

  it("locks body scroll when open", () => {
    useUiStore.setState({ detailOverlayGameId: "g1" });
    render(<GameDetailOverlay />);
    expect(document.body.style.overflow).toBe("hidden");
  });
});
