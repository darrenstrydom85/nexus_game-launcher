import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HltbSection } from "@/components/GameDetail/HltbSection";
import { useGameStore } from "@/stores/gameStore";
import type { Game } from "@/stores/gameStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tauri", () => ({
  fetchHltb: vi.fn().mockResolvedValue(undefined),
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "DOOM Eternal",
    source: "standalone",
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
    hltbMainS: null,
    hltbMainPlusS: null,
    hltbCompletionistS: null,
    hltbGameId: null,
    status: "backlog",
    rating: null,
    totalPlayTimeS: 0,
    lastPlayedAt: null,
    playCount: 0,
    addedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Story 15.2: HltbSection", () => {
  beforeEach(() => {
    useGameStore.setState({ games: [], isLoading: false, error: null });
  });

  it("hides section when all values are null and never fetched", () => {
    const game = makeGame({ hltbMainS: null, hltbMainPlusS: null, hltbCompletionistS: null });
    const { container } = render(<HltbSection game={game} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders section when hltb data is present", () => {
    const game = makeGame({
      hltbMainS: 12 * 3600 + 30 * 60,
      hltbMainPlusS: 20 * 3600,
      hltbCompletionistS: 45 * 3600,
      hltbGameId: 12345,
    });
    render(<HltbSection game={game} />);
    expect(screen.getByTestId("hltb-section")).toBeInTheDocument();
  });

  it("renders all three rows with formatted times", () => {
    const game = makeGame({
      hltbMainS: 12 * 3600 + 30 * 60,
      hltbMainPlusS: 20 * 3600,
      hltbCompletionistS: 45 * 3600,
      hltbGameId: 12345,
    });
    render(<HltbSection game={game} />);
    expect(screen.getByText("12h 30m")).toBeInTheDocument();
    expect(screen.getByText("20h")).toBeInTheDocument();
    expect(screen.getByText("45h")).toBeInTheDocument();
  });

  it("shows em dash for individual null values", () => {
    const game = makeGame({
      hltbMainS: 12 * 3600,
      hltbMainPlusS: null,
      hltbCompletionistS: null,
      hltbGameId: 12345,
    });
    render(<HltbSection game={game} />);
    expect(screen.getByText("12h")).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
  });

  it("shows attribution link when hltb_game_id is set", () => {
    const game = makeGame({
      hltbMainS: 36000,
      hltbGameId: 12345,
    });
    render(<HltbSection game={game} />);
    expect(screen.getByTestId("hltb-attribution-link")).toBeInTheDocument();
  });

  it("hides attribution link when hltb_game_id is null", () => {
    const game = makeGame({
      hltbMainS: 36000,
      hltbGameId: null,
    });
    render(<HltbSection game={game} />);
    expect(screen.queryByTestId("hltb-attribution-link")).not.toBeInTheDocument();
  });

  it("renders re-fetch button", () => {
    const game = makeGame({ hltbMainS: 36000, hltbGameId: 1 });
    render(<HltbSection game={game} />);
    expect(screen.getByTestId("hltb-refetch-button")).toBeInTheDocument();
  });

  it("shows sentinel -1 as all-null display (searched but not found)", () => {
    // When hltbMainS = -1, the section should still render (fetched but not found)
    // but all values should show em dash
    const game = makeGame({
      hltbMainS: -1,
      hltbMainPlusS: null,
      hltbCompletionistS: null,
      hltbGameId: null,
    });
    render(<HltbSection game={game} />);
    expect(screen.getByTestId("hltb-section")).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(3);
  });

  it("has correct aria-label on section", () => {
    const game = makeGame({ hltbMainS: 36000, hltbGameId: 1 });
    render(<HltbSection game={game} />);
    expect(screen.getByLabelText("How Long to Beat estimates")).toBeInTheDocument();
  });

  it("triggers re-fetch on button click", async () => {
    const { fetchHltb } = await import("@/lib/tauri");
    const game = makeGame({ hltbMainS: 36000, hltbGameId: 1 });
    render(<HltbSection game={game} />);
    fireEvent.click(screen.getByTestId("hltb-refetch-button"));
    await waitFor(() => {
      expect(fetchHltb).toHaveBeenCalledWith("g1");
    });
  });
});
