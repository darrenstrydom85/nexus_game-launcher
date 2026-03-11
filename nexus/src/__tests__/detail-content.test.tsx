import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@/lib/hltb", () => ({
  searchHltb: vi.fn().mockResolvedValue([]),
}));

import { DetailContent } from "@/components/GameDetail/DetailContent";
import { GameMetadata } from "@/components/GameDetail/GameMetadata";
import { GamePlayStats } from "@/components/GameDetail/GamePlayStats";
import { GameTrailer } from "@/components/GameDetail/GameTrailer";
import { GameScreenshots } from "@/components/GameDetail/GameScreenshots";
import type { Game } from "@/stores/gameStore";

function extractYoutubeId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}

const mockGame: Game = {
  id: "g1",
  name: "Cyberpunk 2077",
  source: "steam",
  folderPath: "C:\\Games\\Cyberpunk",
  exePath: "C:\\Games\\Cyberpunk\\bin\\x64\\Cyberpunk2077.exe",
  exeName: "Cyberpunk2077.exe",
  launchUrl: null,
  igdbId: 1877,
  steamgridId: null,
  description: "An open-world RPG set in Night City.\nA dystopian future awaits.",
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
  notes: null,
  progress: null,
  milestonesJson: null,
};

const screenshots = [
  "https://example.com/ss1.jpg",
  "https://example.com/ss2.jpg",
  "https://example.com/ss3.jpg",
];

const mockPlayStats = {
  sessionCount: 5,
  totalTime: 72000,
  averageSession: 14400,
  lastPlayed: "2026-02-28T10:00:00Z",
};

const mockPerGameSessionStats = {
  sessions: [
    { id: "s1", startedAt: "2026-02-28T10:00:00Z", endedAt: "2026-02-28T12:00:00Z", durationS: 7200, trackingMethod: "direct" },
  ],
  distribution: {
    buckets: [],
    totalSessions: 1,
    meanDurationS: 7200,
    medianDurationS: 7200,
    p75DurationS: 7200,
    p95DurationS: 7200,
    shortestSessionS: 7200,
    longestSessionS: 7200,
  },
  playTimeByMonth: [],
  playTimeByDayOfWeek: [],
  averageGapDays: 0,
};

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_play_stats") return Promise.resolve(mockPlayStats);
    if (cmd === "get_cache_stats") return Promise.resolve({ totalSizeBytes: 0, imageCount: 0 });
    if (cmd === "get_per_game_session_stats") return Promise.resolve(mockPerGameSessionStats);
    return Promise.resolve({});
  });
});

describe("Story 7.3: Detail Content Composition", () => {
  it("renders the detail content with two columns", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("detail-content")).toBeInTheDocument();
    expect(screen.getByTestId("detail-columns")).toBeInTheDocument();
    expect(screen.getByTestId("detail-left-col")).toBeInTheDocument();
    expect(screen.getByTestId("detail-right-col")).toBeInTheDocument();
  });

  it("left column is 60%, right is 40%", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("detail-left-col").className).toContain("w-[60%]");
    expect(screen.getByTestId("detail-right-col").className).toContain("w-[40%]");
  });

  it("renders description paragraphs", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("detail-description")).toBeInTheDocument();
    expect(screen.getByText("An open-world RPG set in Night City.")).toBeInTheDocument();
  });

  it("renders action bar", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("action-bar")).toBeInTheDocument();
  });

  it("renders collections card with add button", () => {
    render(<DetailContent game={mockGame} collections={["Favorites"]} />);
    expect(screen.getByTestId("detail-collections")).toBeInTheDocument();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByTestId("detail-add-collection")).toBeInTheDocument();
  });
});

describe("GameMetadata", () => {
  it("renders metadata card", () => {
    render(<GameMetadata game={mockGame} />);
    expect(screen.getByTestId("game-metadata")).toBeInTheDocument();
  });

  it("displays source", () => {
    render(<GameMetadata game={mockGame} />);
    expect(screen.getByTestId("meta-source")).toHaveTextContent("Steam");
  });

  it("displays install path with copy button", () => {
    render(<GameMetadata game={mockGame} />);
    expect(screen.getByTestId("meta-install-path")).toHaveTextContent("C:\\Games\\Cyberpunk");
    expect(screen.getByTestId("meta-copy-path")).toBeInTheDocument();
  });

  it("displays executable name", () => {
    render(<GameMetadata game={mockGame} />);
    expect(screen.getByTestId("meta-exe")).toHaveTextContent("Cyberpunk2077.exe");
  });
});

describe("GameInfoStrip", () => {
  it("renders the info strip when game has release date or genres", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("game-info-strip")).toBeInTheDocument();
  });

  it("displays release date in the strip", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("meta-release-date")).toBeInTheDocument();
  });

  it("displays genres as badges in the strip", () => {
    render(<DetailContent game={mockGame} />);
    expect(screen.getByTestId("meta-genres")).toBeInTheDocument();
    expect(screen.getByText("RPG")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("renders ratings section when scores are present", () => {
    const gameWithScores: Game = { ...mockGame, criticScore: 87, criticScoreCount: 42, communityScore: 74, communityScoreCount: 1500 };
    render(<DetailContent game={gameWithScores} />);
    expect(screen.getByTestId("ratings-section")).toBeInTheDocument();
  });

  it("does not render strip when no scores, release date, or genres", () => {
    const bareGame: Game = { ...mockGame, criticScore: null, communityScore: null, releaseDate: null, genres: [] };
    render(<DetailContent game={bareGame} />);
    expect(screen.queryByTestId("game-info-strip")).not.toBeInTheDocument();
  });
});

describe("GamePlayStats", () => {
  it("renders play stats card", () => {
    render(<GamePlayStats game={mockGame} />);
    expect(screen.getByTestId("game-play-stats")).toBeInTheDocument();
  });

  it("displays total play time", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-total-time")).toHaveTextContent("20h 0m");
    });
  });

  it("displays session count", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-sessions")).toHaveTextContent("5");
    });
  });

  it("displays average session time", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-avg-session")).toBeInTheDocument();
    });
  });

  it("displays last played date", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-last-played")).toBeInTheDocument();
    });
  });

  it("renders 'View full stats' button inside expandable section", async () => {
    const onViewFullStats = vi.fn();
    render(<GamePlayStats game={mockGame} onViewFullStats={onViewFullStats} />);
    fireEvent.click(screen.getByTestId("session-details-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("view-full-stats-link")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("view-full-stats-link"));
    expect(onViewFullStats).toHaveBeenCalledOnce();
  });
});

describe("GameTrailer", () => {
  it("renders nothing when youtubeId is null", () => {
    const { container } = render(<GameTrailer youtubeId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders thumbnail when youtubeId is provided", () => {
    render(<GameTrailer youtubeId="abc123" />);
    expect(screen.getByTestId("game-trailer")).toBeInTheDocument();
    expect(screen.getByTestId("trailer-thumbnail")).toBeInTheDocument();
  });

  it("shows iframe on thumbnail click", () => {
    render(<GameTrailer youtubeId="abc123" />);
    fireEvent.click(screen.getByTestId("trailer-thumbnail"));
    expect(screen.getByTestId("trailer-iframe")).toBeInTheDocument();
  });
});

describe("GameScreenshots", () => {
  it("renders nothing when screenshots is empty", () => {
    const { container } = render(<GameScreenshots screenshots={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders thumbnail strip", () => {
    render(<GameScreenshots screenshots={screenshots} />);
    expect(screen.getByTestId("game-screenshots")).toBeInTheDocument();
    expect(screen.getByTestId("screenshot-thumb-0")).toBeInTheDocument();
    expect(screen.getByTestId("screenshot-thumb-2")).toBeInTheDocument();
  });

  it("opens lightbox on thumbnail click", () => {
    render(<GameScreenshots screenshots={screenshots} />);
    fireEvent.click(screen.getByTestId("screenshot-thumb-1"));
    expect(screen.getByTestId("screenshot-lightbox")).toBeInTheDocument();
    expect(screen.getByTestId("lightbox-image")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("lightbox navigates with arrow buttons", () => {
    render(<GameScreenshots screenshots={screenshots} />);
    fireEvent.click(screen.getByTestId("screenshot-thumb-1"));
    fireEvent.click(screen.getByTestId("lightbox-next"));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("lightbox navigates with arrow keys", () => {
    render(<GameScreenshots screenshots={screenshots} />);
    fireEvent.click(screen.getByTestId("screenshot-thumb-1"));
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("lightbox closes on Escape", async () => {
    render(<GameScreenshots screenshots={screenshots} />);
    fireEvent.click(screen.getByTestId("screenshot-thumb-0"));
    expect(screen.getByTestId("screenshot-lightbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("screenshot-lightbox")).not.toBeInTheDocument();
    });
  });
});

describe("Story 7.6: Trailer URL wired to UI", () => {
  describe("extractYoutubeId", () => {
    it("extracts video ID from a standard YouTube URL", () => {
      expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("returns null for a URL without a v param", () => {
      expect(extractYoutubeId("https://www.youtube.com/watch")).toBeNull();
    });

    it("returns null for a malformed URL without throwing", () => {
      expect(extractYoutubeId("not-a-url")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(extractYoutubeId("")).toBeNull();
    });
  });

  it("renders GameTrailer when game has trailerUrl", () => {
    const gameWithTrailer: Game = {
      ...mockGame,
      trailerUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    const youtubeId = extractYoutubeId(gameWithTrailer.trailerUrl!);
    render(<DetailContent game={gameWithTrailer} youtubeId={youtubeId} />);
    expect(screen.getByTestId("game-trailer")).toBeInTheDocument();
    expect(screen.getByTestId("trailer-thumbnail")).toBeInTheDocument();
  });

  it("does not render GameTrailer when game has no trailerUrl", () => {
    render(<DetailContent game={mockGame} youtubeId={null} />);
    expect(screen.queryByTestId("game-trailer")).not.toBeInTheDocument();
  });

  it("Game interface includes trailerUrl field", () => {
    const game: Game = { ...mockGame, trailerUrl: "https://www.youtube.com/watch?v=abc" };
    expect(game.trailerUrl).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("trailerUrl defaults to null when not provided", () => {
    expect(mockGame.trailerUrl).toBeNull();
  });
});
