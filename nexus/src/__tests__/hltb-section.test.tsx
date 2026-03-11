import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Game } from "@/stores/gameStore";

const mockSearchHltb = vi.fn();

vi.mock("@/lib/hltb", () => ({
  searchHltb: (...args: unknown[]) => mockSearchHltb(...args),
}));

import { HltbSection } from "@/components/GameDetail/HltbSection";

const freshDate = new Date().toISOString();
const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Hades",
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
    status: "backlog",
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
    progress: null,
    milestonesJson: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchHltb.mockResolvedValue([]);
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_games") return Promise.resolve([]);
    return Promise.resolve({});
  });
});

describe("HltbSection — cached data display", () => {
  it("renders all three time rows when cached data is fresh", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbMainExtraH: 18.5,
      hltbCompletionistH: 45,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-section")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-main")).toHaveTextContent("12h");
    expect(screen.getByTestId("hltb-main-extra")).toHaveTextContent("18h 30m");
    expect(screen.getByTestId("hltb-completionist")).toHaveTextContent("45h");
  });

  it("shows em dash for null time values", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbMainExtraH: null,
      hltbCompletionistH: null,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-main")).toHaveTextContent("12h");
    });
    expect(screen.getByTestId("hltb-main-extra")).toHaveTextContent("\u2014");
    expect(screen.getByTestId("hltb-completionist")).toHaveTextContent("\u2014");
  });

  it("has correct aria-label on the section", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-section")).toHaveAttribute(
        "aria-label",
        "How Long to Beat estimates",
      );
    });
  });
});

describe("HltbSection — loading skeleton", () => {
  it("shows skeleton during fetch for stale data", async () => {
    mockSearchHltb.mockReturnValue(new Promise(() => {}));
    const game = makeGame({ hltbFetchedAt: staleDate });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-skeleton")).toBeInTheDocument();
    });
  });

  it("shows skeleton during fetch for missing data", async () => {
    mockSearchHltb.mockReturnValue(new Promise(() => {}));
    const game = makeGame({ hltbFetchedAt: null });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-skeleton")).toBeInTheDocument();
    });
  });
});

describe("HltbSection — no results shows search mode", () => {
  it("shows no-match card with search button when cache is fresh but no times", async () => {
    const game = makeGame({
      hltbMainH: null,
      hltbMainExtraH: null,
      hltbCompletionistH: null,
      hltbId: null,
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-section")).toBeInTheDocument();
    });
    expect(screen.getByText("No match found for this game.")).toBeInTheDocument();
    expect(screen.getByTestId("hltb-search-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("hltb-search-trigger")).toHaveTextContent("Search manually");
  });

  it("enters search mode when search manually button is clicked from no-match card", async () => {
    const game = makeGame({
      hltbMainH: null,
      hltbMainExtraH: null,
      hltbCompletionistH: null,
      hltbId: null,
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-search-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });
  });

  it("enters search mode when auto-search returns 0 results", async () => {
    mockSearchHltb.mockResolvedValue([]);
    const game = makeGame({ hltbFetchedAt: null });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-section")).toBeInTheDocument();
  });

  it("shows empty state message in search mode", async () => {
    mockSearchHltb.mockResolvedValue([]);
    const game = makeGame({ hltbFetchedAt: null });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-search-empty")).toHaveTextContent(
      "No results found. Try a different name.",
    );
  });
});

describe("HltbSection — attribution link", () => {
  it("renders attribution link when hltbId is present", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-attribution")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-attribution")).toHaveTextContent("via HowLongToBeat");
  });

  it("opens correct URL when attribution is clicked", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-attribution")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("hltb-attribution"));

    expect(openUrl).toHaveBeenCalledWith("https://howlongtobeat.com/game/26286");
  });
});

describe("HltbSection — re-fetch button", () => {
  it("renders re-fetch button", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-refetch")).toBeInTheDocument();
    });
  });

  it("triggers clear + fetch cycle on click", async () => {
    mockSearchHltb.mockResolvedValue([
      {
        id: 26286,
        name: "Hades",
        gameplayMain: 20,
        gameplayMainExtra: 40,
        gameplayCompletionist: 80,
        similarity: 1,
      },
    ]);

    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-refetch")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-refetch"));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("clear_hltb_data", { gameId: "g1" });
    });

    await waitFor(() => {
      expect(mockSearchHltb).toHaveBeenCalled();
    });
  });
});

describe("HltbSection — wrong game button", () => {
  it("renders wrong game button on data card", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });
  });

  it("enters search mode when wrong game button is clicked", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-wrong-game"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-search-cancel")).toBeInTheDocument();
  });
});

describe("HltbSection — manual search", () => {
  it("triggers search when submit button is clicked", async () => {
    mockSearchHltb.mockResolvedValue([
      {
        id: 100,
        name: "Hogwarts Legacy",
        gameplayMain: 26,
        gameplayMainExtra: 45,
        gameplayCompletionist: 72,
        similarity: 1,
      },
    ]);

    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-wrong-game"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("hltb-search-input"), {
      target: { value: "Hogwarts Legacy" },
    });
    fireEvent.click(screen.getByTestId("hltb-search-submit"));

    await waitFor(() => {
      expect(mockSearchHltb).toHaveBeenCalledWith("Hogwarts Legacy");
    });

    await waitFor(() => {
      expect(screen.getByTestId("hltb-result-100")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-result-100")).toHaveTextContent("Hogwarts Legacy");
    expect(screen.getByTestId("hltb-result-100")).toHaveTextContent("26h");
  });

  it("triggers search on Enter key", async () => {
    mockSearchHltb.mockResolvedValue([
      {
        id: 100,
        name: "Hogwarts Legacy",
        gameplayMain: 26,
        gameplayMainExtra: 45,
        gameplayCompletionist: 72,
        similarity: 1,
      },
    ]);

    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-wrong-game"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("hltb-search-input"), {
      target: { value: "Hogwarts" },
    });
    fireEvent.keyDown(screen.getByTestId("hltb-search-input"), { key: "Enter" });

    await waitFor(() => {
      expect(mockSearchHltb).toHaveBeenCalledWith("Hogwarts");
    });
  });

  it("saves selected result and exits search mode", async () => {
    mockSearchHltb.mockResolvedValue([
      {
        id: 100,
        name: "Hogwarts Legacy",
        gameplayMain: 26,
        gameplayMainExtra: 45,
        gameplayCompletionist: 72,
        similarity: 1,
      },
    ]);

    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-wrong-game"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("hltb-search-input"), {
      target: { value: "Hogwarts Legacy" },
    });
    fireEvent.click(screen.getByTestId("hltb-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-result-100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-result-100"));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("save_hltb_data", {
        gameId: "g1",
        hltbId: "100",
        mainH: 26,
        mainExtraH: 45,
        completionistH: 72,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("hltb-search-input")).not.toBeInTheDocument();
    });
  });

  it("cancel button exits search mode", async () => {
    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-wrong-game"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-cancel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-search-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("hltb-search-input")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-main")).toBeInTheDocument();
  });

  it("shows no results message when manual search returns empty", async () => {
    mockSearchHltb.mockResolvedValue([]);

    const game = makeGame({
      hltbMainH: 12,
      hltbId: "26286",
      hltbFetchedAt: freshDate,
    });

    render(<HltbSection game={game} />);

    await waitFor(() => {
      expect(screen.getByTestId("hltb-wrong-game")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hltb-wrong-game"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("hltb-search-input"), {
      target: { value: "xyznonexistent" },
    });
    fireEvent.click(screen.getByTestId("hltb-search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("hltb-search-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hltb-search-empty")).toHaveTextContent(
      "No results found. Try a different name.",
    );
  });
});
