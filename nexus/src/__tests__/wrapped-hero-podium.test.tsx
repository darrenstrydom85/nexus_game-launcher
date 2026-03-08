import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PodiumVisual } from "@/components/Wrapped/PodiumVisual";
import { HeroCard } from "@/components/Wrapped/HeroCard";
import type { WrappedGame, WrappedReport } from "@/types/wrapped";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 300 }}>
        {children}
      </div>
    ),
  };
});

vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tauri-apps/api/core")>();
  return {
    ...actual,
    invoke: vi.fn(() => Promise.resolve({})),
    convertFileSrc: (p: string) => p,
  };
});

vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const makeGame = (overrides: Partial<WrappedGame> & { id: string; name: string }): WrappedGame => ({
  coverUrl: null,
  playTimeS: 3600,
  sessionCount: 5,
  source: "steam",
  ...overrides,
});

const game1 = makeGame({ id: "g1", name: "Cyberpunk 2077", playTimeS: 180000, coverUrl: "https://example.com/cp.jpg" });
const game2 = makeGame({ id: "g2", name: "Elden Ring", playTimeS: 90000, coverUrl: "https://example.com/er.jpg" });
const game3 = makeGame({ id: "g3", name: "Hades", playTimeS: 54000 });

const mockReport: WrappedReport = {
  periodLabel: "2025",
  totalPlayTimeS: 360000,
  totalSessions: 42,
  totalGamesPlayed: 15,
  totalGamesInLibrary: 120,
  newGamesAdded: 8,
  newTitlesInPeriod: 5,
  mostPlayedGame: game1,
  mostPlayedGenre: "RPG",
  topGames: [game1, game2, game3],
  genreBreakdown: [{ name: "RPG", playTimeS: 270000, percent: 75 }],
  genreTagline: null,
  platformBreakdown: [{ source: "steam", playTimeS: 360000, percent: 100 }],
  longestSession: null,
  longestStreakDays: 0,
  busiestDay: null,
  busiestDayPlayTimeS: 0,
  firstGamePlayed: null,
  lastGamePlayed: null,
  playTimeByMonth: [],
  playTimeByDayOfWeek: [],
  playTimeByHourOfDay: [],
  funFacts: [],
  comparisonPreviousPeriod: null,
  moodTagline: null,
  hiddenGem: null,
  trivia: [],
};

// ── PodiumVisual ────────────────────────────────────────────────────────────

describe("PodiumVisual", () => {
  it("renders 3 podium positions with correct ranks", () => {
    render(<PodiumVisual topGames={[game1, game2, game3]} isVisible />);
    expect(screen.getByTestId("podium-visual")).toBeInTheDocument();
    expect(screen.getByTestId("podium-position-1")).toBeInTheDocument();
    expect(screen.getByTestId("podium-position-2")).toBeInTheDocument();
    expect(screen.getByTestId("podium-position-3")).toBeInTheDocument();
  });

  it("displays rank labels (1st, 2nd, 3rd)", () => {
    render(<PodiumVisual topGames={[game1, game2, game3]} isVisible />);
    expect(screen.getByText("1st")).toBeInTheDocument();
    expect(screen.getByText("2nd")).toBeInTheDocument();
    expect(screen.getByText("3rd")).toBeInTheDocument();
  });

  it("displays play time for each game", () => {
    render(<PodiumVisual topGames={[game1, game2, game3]} isVisible />);
    expect(screen.getByText("50h 0m")).toBeInTheDocument();
    expect(screen.getByText("25h 0m")).toBeInTheDocument();
    expect(screen.getByText("15h 0m")).toBeInTheDocument();
  });

  it("renders only 2 positions when 2 games provided", () => {
    render(<PodiumVisual topGames={[game1, game2]} isVisible />);
    expect(screen.getByTestId("podium-position-1")).toBeInTheDocument();
    expect(screen.getByTestId("podium-position-2")).toBeInTheDocument();
    expect(screen.queryByTestId("podium-position-3")).not.toBeInTheDocument();
  });

  it("renders only 1 position when 1 game provided", () => {
    render(<PodiumVisual topGames={[game1]} isVisible />);
    expect(screen.getByTestId("podium-position-1")).toBeInTheDocument();
    expect(screen.queryByTestId("podium-position-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("podium-position-3")).not.toBeInTheDocument();
  });

  it("renders nothing when 0 games provided", () => {
    const { container } = render(<PodiumVisual topGames={[]} isVisible />);
    expect(container.firstChild).toBeNull();
  });

  it("shows fallback placeholder when coverUrl is null", () => {
    render(<PodiumVisual topGames={[game3]} isVisible />);
    expect(screen.getByText("Hades")).toBeInTheDocument();
  });

  it("renders cover images with correct alt text including rank", () => {
    render(<PodiumVisual topGames={[game1, game2, game3]} isVisible />);
    expect(screen.getByAltText("1st place: Cyberpunk 2077")).toBeInTheDocument();
    expect(screen.getByAltText("2nd place: Elden Ring")).toBeInTheDocument();
  });

  it("renders cover images with src from resolveUrl", () => {
    render(<PodiumVisual topGames={[game1]} isVisible />);
    const img = screen.getByAltText("1st place: Cyberpunk 2077") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/cp.jpg");
  });
});

// ── HeroCard with podium integration ────────────────────────────────────────

describe("HeroCard podium integration", () => {
  it("renders podium when topGames has entries", () => {
    render(<HeroCard report={mockReport} isVisible />);
    expect(screen.getByTestId("podium-visual")).toBeInTheDocument();
  });

  it("does not render podium when topGames is empty", () => {
    render(<HeroCard report={{ ...mockReport, topGames: [] }} isVisible />);
    expect(screen.queryByTestId("podium-visual")).not.toBeInTheDocument();
  });

  it("still renders existing hero content alongside podium", () => {
    render(<HeroCard report={mockReport} isVisible />);
    expect(screen.getByTestId("hero-card")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getAllByText(/100h/i).length).toBeGreaterThan(0);
  });
});
