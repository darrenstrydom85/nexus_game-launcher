/**
 * The story's two hero slides: the intro (kinetic headline + total hours) and
 * the #1 game (full-bleed art with its fallbacks). The old podium visual was
 * replaced by the ranked "Top games" slide.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { WrappedGame, WrappedReport } from "@/types/wrapped";
import { IntroSlide } from "@/components/Wrapped/slides/IntroSlide";
import { TopGameSlide } from "@/components/Wrapped/slides/TopGameSlide";
import { useGameStore, type Game } from "@/stores/gameStore";

vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tauri-apps/api/core")>();
  return {
    ...actual,
    invoke: vi.fn(() => Promise.resolve({})),
    convertFileSrc: (p: string) => p,
  };
});

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => reduced.value,
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const makeGame = (overrides: Partial<WrappedGame> & { id: string; name: string }): WrappedGame => ({
  coverUrl: null,
  heroUrl: null,
  logoUrl: null,
  playTimeS: 3600,
  sessionCount: 5,
  source: "steam",
  ...overrides,
});

const game1 = makeGame({ id: "g1", name: "Cyberpunk 2077", playTimeS: 180000, sessionCount: 20 });

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
  topGames: [game1],
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
  comparisonPreviousPeriod: { previousTotalS: 300000, percentChange: 20, label: "Up 20% from last year" },
  moodTagline: null,
  hiddenGem: null,
  trivia: [],
};

const libraryGame = (overrides: Partial<Game>) =>
  ({ id: "g1", name: "Cyberpunk 2077", status: "playing", coverUrl: null, heroUrl: null, ...overrides }) as Game;

/** Screen-reader text of a stat: the final value, whatever the animation is doing. */
const srText = (el: HTMLElement) => Array.from(el.querySelectorAll(".sr-only")).map((n) => n.textContent);

beforeEach(() => {
  reduced.value = false;
  useGameStore.setState({ games: [] });
});

// ── IntroSlide ──────────────────────────────────────────────────────────────

describe("IntroSlide", () => {
  it("sets the period headline as separate words that read as one sentence", () => {
    render(<IntroSlide report={mockReport} />);
    const h = screen.getByRole("heading", { level: 2 });
    expect(h).toHaveTextContent("Your 2025 in games");
    expect(h.querySelectorAll("span.inline-block.overflow-hidden")).toHaveLength(4);
  });

  it("phrases relative periods naturally", () => {
    render(<IntroSlide report={{ ...mockReport, periodLabel: "Last 30 days" }} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Your last 30 days in games");
  });

  it("gives screen readers the final hours, sessions and games", () => {
    render(<IntroSlide report={mockReport} />);
    expect(srText(screen.getByTestId("wrapped-intro-hours"))).toEqual(["100"]);
    expect(screen.getByText("42", { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.getByText("15", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("starts the visible count at zero, or at the final value with reduced motion", () => {
    const { unmount } = render(<IntroSlide report={mockReport} />);
    expect(screen.getByTestId("wrapped-intro-hours").querySelector("[data-countup]")).toHaveTextContent(/^0$/);
    unmount();
    reduced.value = true;
    render(<IntroSlide report={mockReport} />);
    expect(screen.getByTestId("wrapped-intro-hours").querySelector("[data-countup]")).toHaveTextContent(/^100$/);
  });

  it("uses one decimal under ten hours", () => {
    reduced.value = true;
    render(<IntroSlide report={{ ...mockReport, totalPlayTimeS: 23400 }} />);
    expect(screen.getByTestId("wrapped-intro-hours")).toHaveTextContent(/6[.,]5/); // follows the user's locale
  });

  it("shows the comparison only when there is one", () => {
    const { unmount } = render(<IntroSlide report={mockReport} />);
    expect(screen.getByTestId("wrapped-intro-comparison")).toHaveTextContent("Up 20%");
    unmount();
    render(<IntroSlide report={{ ...mockReport, comparisonPreviousPeriod: null }} />);
    expect(screen.queryByTestId("wrapped-intro-comparison")).not.toBeInTheDocument();
  });
});

// ── TopGameSlide ────────────────────────────────────────────────────────────

describe("TopGameSlide", () => {
  it("shows the name, hours, share and sessions", () => {
    reduced.value = true;
    render(<TopGameSlide report={mockReport} />);
    expect(screen.getByTestId("wrapped-top-game-name")).toHaveTextContent("Cyberpunk 2077");
    const stats = within(screen.getByTestId("wrapped-top-game-name").parentElement!);
    expect(stats.getByText("Hours played").nextElementSibling).toHaveTextContent("50");
    expect(stats.getByText("Of all your play").nextElementSibling).toHaveTextContent("50%");
    expect(stats.getByText("Sessions").nextElementSibling).toHaveTextContent("20");
  });

  it("uses the report's hero art first", () => {
    render(<TopGameSlide report={{ ...mockReport, mostPlayedGame: { ...game1, heroUrl: "https://example.com/hero.jpg" } }} />);
    const art = screen.getByTestId("wrapped-top-game-art");
    expect(art).toHaveAttribute("src", "https://example.com/hero.jpg");
    expect(art).toHaveAttribute("data-art", "hero");
  });

  it("falls back to the library's art when the report has none", () => {
    useGameStore.setState({ games: [libraryGame({ heroUrl: "https://example.com/lib-hero.jpg" })] });
    render(<TopGameSlide report={mockReport} />);
    expect(screen.getByTestId("wrapped-top-game-art")).toHaveAttribute("src", "https://example.com/lib-hero.jpg");
  });

  it("matches the library by name when the id differs", () => {
    useGameStore.setState({ games: [libraryGame({ id: "other-id", heroUrl: "https://example.com/by-name.jpg" })] });
    render(<TopGameSlide report={mockReport} />);
    expect(screen.getByTestId("wrapped-top-game-art")).toHaveAttribute("src", "https://example.com/by-name.jpg");
  });

  it("blurs a cover into the background when there is no hero (20px or less)", () => {
    render(<TopGameSlide report={{ ...mockReport, mostPlayedGame: { ...game1, coverUrl: "https://example.com/cover.jpg" } }} />);
    const art = screen.getByTestId("wrapped-top-game-art");
    expect(art).toHaveAttribute("data-art", "cover");
    const blur = /blur-\[(\d+)px\]/.exec(art.className);
    expect(blur).not.toBeNull();
    expect(Number(blur![1])).toBeLessThanOrEqual(20);
  });

  it("renders without art when nothing is available", () => {
    render(<TopGameSlide report={mockReport} />);
    expect(screen.queryByTestId("wrapped-top-game-art")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View game/ })).not.toBeInTheDocument();
  });

  it("offers View game and the uninstalled tag for a removed library game", () => {
    useGameStore.setState({ games: [libraryGame({ status: "removed" as Game["status"] })] });
    render(<TopGameSlide report={mockReport} />);
    expect(screen.getByRole("button", { name: /View game/ })).toBeInTheDocument();
    expect(screen.getByText("Uninstalled")).toBeInTheDocument();
  });
});
