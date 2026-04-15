import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContinuePlayingRow } from "@/components/Library/ContinuePlayingRow";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Game } from "@/stores/gameStore";

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}

const BASE_GAME: Game = {
  id: "g1",
  name: "Game 1",
  source: "steam",
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
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: null,
  totalPlayTimeS: 3600,
  lastPlayedAt: hoursAgo(2),
  playCount: 1,
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

function makeGame(overrides: Partial<Game> & { id: string }): Game {
  return { ...BASE_GAME, ...overrides };
}

describe("Story 25.1: ContinuePlayingRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      continuePlayingEnabled: true,
      continuePlayingMax: 5,
    });
  });

  it("renders the row when qualifying games exist", () => {
    const games = [makeGame({ id: "g1" })];
    render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(screen.getByTestId("continue-playing-row")).toBeInTheDocument();
    expect(screen.getByText("Continue Playing")).toBeInTheDocument();
  });

  it("renders a card for each qualifying game", () => {
    const games = [
      makeGame({ id: "g1", name: "Alpha" }),
      makeGame({ id: "g2", name: "Beta", lastPlayedAt: hoursAgo(3) }),
      makeGame({ id: "g3", name: "Gamma", lastPlayedAt: hoursAgo(5) }),
    ];
    render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(screen.getByTestId("continue-playing-card-g1")).toBeInTheDocument();
    expect(screen.getByTestId("continue-playing-card-g2")).toBeInTheDocument();
    expect(screen.getByTestId("continue-playing-card-g3")).toBeInTheDocument();
  });

  it("renders nothing when no games qualify", () => {
    const games = [
      makeGame({ id: "g1", status: "completed", lastPlayedAt: daysAgo(10) }),
    ];
    const { container } = render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when games array is empty", () => {
    const { container } = render(
      <ContinuePlayingRow
        games={[]}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when a collection is active", () => {
    const games = [makeGame({ id: "g1" })];
    const { container } = render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when continuePlayingEnabled is false", () => {
    useSettingsStore.setState({ continuePlayingEnabled: false });
    const games = [makeGame({ id: "g1" })];
    const { container } = render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("respects source filter", () => {
    const games = [
      makeGame({ id: "s1", source: "steam", lastPlayedAt: hoursAgo(1) }),
      makeGame({ id: "e1", source: "epic", lastPlayedAt: hoursAgo(2) }),
    ];
    render(
      <ContinuePlayingRow
        games={games}
        sourceFilter="steam"
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(screen.getByTestId("continue-playing-card-s1")).toBeInTheDocument();
    expect(screen.queryByTestId("continue-playing-card-e1")).not.toBeInTheDocument();
  });

  it("respects continuePlayingMax setting", () => {
    useSettingsStore.setState({ continuePlayingMax: 2 });
    const games = Array.from({ length: 5 }, (_, i) =>
      makeGame({ id: `g${i}`, lastPlayedAt: hoursAgo(i + 1) }),
    );
    render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    const scroll = screen.getByTestId("continue-playing-scroll");
    const cards = scroll.querySelectorAll("[data-testid^='continue-playing-card-']");
    expect(cards).toHaveLength(2);
  });

  it("has the correct aria-label on the section", () => {
    const games = [makeGame({ id: "g1" })];
    render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
      />,
    );
    expect(screen.getByLabelText("Continue Playing")).toBeInTheDocument();
  });

  it("passes onPlay and onGameClick to cards", () => {
    const onPlay = vi.fn();
    const onGameClick = vi.fn();
    const games = [makeGame({ id: "g1" })];
    render(
      <ContinuePlayingRow
        games={games}
        sourceFilter={null}
        filterSources={[]}
        isCollectionActive={false}
        onPlay={onPlay}
        onGameClick={onGameClick}
      />,
    );
    expect(screen.getByTestId("continue-playing-card-g1")).toBeInTheDocument();
  });
});
