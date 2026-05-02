import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WrappedReport, AvailableWrappedPeriods } from "@/types/wrapped";
import { HeroCard } from "@/components/Wrapped/HeroCard";
import { TopGameCard } from "@/components/Wrapped/TopGameCard";
import { TopGamesCard } from "@/components/Wrapped/TopGamesCard";
import { GenreCard } from "@/components/Wrapped/GenreCard";
import { PlayPatternsCard } from "@/components/Wrapped/PlayPatternsCard";
import { MilestonesCard } from "@/components/Wrapped/MilestonesCard";
import { DiversityCard } from "@/components/Wrapped/DiversityCard";
import { LibraryGrowthCard } from "@/components/Wrapped/LibraryGrowthCard";
import { FunExtrasCard } from "@/components/Wrapped/FunExtrasCard";
import { DotNavigation } from "@/components/Wrapped/DotNavigation";
import { WrappedView } from "@/components/Wrapped/WrappedView";
import { LibraryStats } from "@/components/Library/LibraryStats";

// ── Additional mocks ───────────────────────────────────────────────────────

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

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: { reducedMotion: boolean; accentColor: string }) => unknown) =>
    selector({ reducedMotion: false, accentColor: "#3B82F6" }),
}));

vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockAvailable: AvailableWrappedPeriods = {
  yearsWithSessions: [2025, 2024],
  thisMonthHasData: true,
  lastMonthHasData: true,
  thisYearHasData: true,
  lastYearHasData: true,
};

const mockReport: WrappedReport = {
  periodLabel: "2025",
  totalPlayTimeS: 360000,
  totalSessions: 42,
  totalGamesPlayed: 15,
  totalGamesInLibrary: 120,
  newGamesAdded: 8,
  newTitlesInPeriod: 5,
  mostPlayedGame: {
    id: "g1",
    name: "Cyberpunk 2077",
    coverUrl: null,
    heroUrl: null,
    logoUrl: null,
    playTimeS: 180000,
    sessionCount: 20,
    source: "steam",
  },
  mostPlayedGenre: "RPG",
  topGames: [
    { id: "g1", name: "Cyberpunk 2077", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 180000, sessionCount: 20, source: "steam" },
    { id: "g2", name: "Elden Ring", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 90000, sessionCount: 12, source: "steam" },
    { id: "g3", name: "Hades", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 54000, sessionCount: 8, source: "epic" },
  ],
  genreBreakdown: [
    { name: "RPG", playTimeS: 270000, percent: 75 },
    { name: "Action", playTimeS: 90000, percent: 25 },
  ],
  genreTagline: "You're a true adventurer at heart",
  platformBreakdown: [
    { source: "steam", playTimeS: 270000, percent: 75 },
    { source: "epic", playTimeS: 90000, percent: 25 },
  ],
  longestSession: {
    gameId: "g1",
    gameName: "Cyberpunk 2077",
    startedAt: "2025-06-15T20:00:00Z",
    durationS: 28800,
  },
  longestStreakDays: 7,
  busiestDay: "2025-06-15",
  busiestDayPlayTimeS: 28800,
  firstGamePlayed: { id: "g3", name: "Hades", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 54000, sessionCount: 8, source: "epic" },
  lastGamePlayed: { id: "g1", name: "Cyberpunk 2077", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 180000, sessionCount: 20, source: "steam" },
  playTimeByMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, playTimeS: i * 3600 })),
  playTimeByDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ day: i, playTimeS: i * 3600 })),
  playTimeByHourOfDay: Array.from({ length: 24 }, (_, i) => ({ hour: i, playTimeS: i * 600 })),
  funFacts: [{ kind: "marathons", value: 25, label: "That's equivalent to 25 marathons" }],
  comparisonPreviousPeriod: { previousTotalS: 300000, percentChange: 20, label: "Up 20% from last year" },
  moodTagline: "Mostly chill vibes",
  hiddenGem: { gameId: "g3", name: "Hades", playTimeS: 54000, rating: 65, tagline: "You put 15.0h into a 65-rated title" },
  trivia: ["Your top game has a 90% rating"],
};

const emptyReport: WrappedReport = {
  ...mockReport,
  totalSessions: 0,
  totalPlayTimeS: 0,
  totalGamesPlayed: 0,
};

// ── HeroCard ───────────────────────────────────────────────────────────────

describe("HeroCard", () => {
  it("renders total play time and sessions", () => {
    render(<HeroCard report={mockReport} />);
    expect(screen.getByTestId("hero-card")).toBeInTheDocument();
    expect(screen.getAllByText(/100h/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/42 session/i)).toBeInTheDocument();
  });

  it("renders fun fact", () => {
    render(<HeroCard report={mockReport} />);
    expect(screen.getByTestId("hero-fun-fact")).toHaveTextContent("25 marathons");
  });

  it("renders comparison when present", () => {
    render(<HeroCard report={mockReport} />);
    expect(screen.getByTestId("hero-comparison")).toHaveTextContent("Up 20%");
  });

  it("does not render comparison when absent", () => {
    render(<HeroCard report={{ ...mockReport, comparisonPreviousPeriod: null }} />);
    expect(screen.queryByTestId("hero-comparison")).not.toBeInTheDocument();
  });
});

// ── TopGameCard ────────────────────────────────────────────────────────────

describe("TopGameCard", () => {
  it("renders most played game", () => {
    render(<TopGameCard report={mockReport} />);
    expect(screen.getByTestId("top-game-card")).toBeInTheDocument();
    expect(screen.getByText("Cyberpunk 2077")).toBeInTheDocument();
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
  });

  it("renders fallback when no most played game", () => {
    render(<TopGameCard report={{ ...mockReport, mostPlayedGame: null }} />);
    expect(screen.getByText(/no top game/i)).toBeInTheDocument();
  });
});

// ── TopGamesCard ───────────────────────────────────────────────────────────

describe("TopGamesCard", () => {
  it("renders all top games", () => {
    render(<TopGamesCard report={mockReport} isVisible={true} />);
    expect(screen.getByTestId("top-games-card")).toBeInTheDocument();
    expect(screen.getByTestId("top-game-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("top-game-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("top-game-row-2")).toBeInTheDocument();
  });
});

// ── GenreCard ──────────────────────────────────────────────────────────────

describe("GenreCard", () => {
  it("renders genre breakdown and tagline", () => {
    render(<GenreCard report={mockReport} />);
    expect(screen.getByTestId("genre-card")).toBeInTheDocument();
    expect(screen.getByTestId("genre-tagline")).toHaveTextContent("true adventurer");
  });

  it("renders empty state when no genres", () => {
    render(<GenreCard report={{ ...mockReport, genreBreakdown: [] }} />);
    expect(screen.getByText(/no genre data/i)).toBeInTheDocument();
  });
});

// ── PlayPatternsCard ───────────────────────────────────────────────────────

describe("PlayPatternsCard", () => {
  it("renders play patterns with year report", () => {
    render(<PlayPatternsCard report={mockReport} />);
    expect(screen.getByTestId("play-patterns-card")).toBeInTheDocument();
    expect(screen.getByText(/By Month/i)).toBeInTheDocument();
    expect(screen.getByText(/By Day of Week/i)).toBeInTheDocument();
    expect(screen.getByText(/By Hour of Day/i)).toBeInTheDocument();
  });

  it("shows By Week for month reports (single entry)", () => {
    render(<PlayPatternsCard report={{ ...mockReport, playTimeByMonth: [{ month: 3, playTimeS: 3600 }] }} />);
    expect(screen.getByText(/By Week/i)).toBeInTheDocument();
  });
});

// ── MilestonesCard ─────────────────────────────────────────────────────────

describe("MilestonesCard", () => {
  it("renders milestones", () => {
    render(<MilestonesCard report={mockReport} />);
    expect(screen.getByTestId("milestones-card")).toBeInTheDocument();
    expect(screen.getByText(/7 day/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Cyberpunk 2077/i).length).toBeGreaterThan(0);
  });
});

// ── DiversityCard ──────────────────────────────────────────────────────────

describe("DiversityCard", () => {
  it("renders diversity stats", () => {
    render(<DiversityCard report={mockReport} />);
    expect(screen.getByTestId("diversity-card")).toBeInTheDocument();
    expect(screen.getByText(/5 new title/i)).toBeInTheDocument();
  });
});

// ── LibraryGrowthCard ──────────────────────────────────────────────────────

describe("LibraryGrowthCard", () => {
  it("renders library growth stats", () => {
    render(<LibraryGrowthCard report={mockReport} />);
    expect(screen.getByTestId("library-growth-card")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});

// ── FunExtrasCard ──────────────────────────────────────────────────────────

describe("FunExtrasCard", () => {
  it("renders all three sections when mood/gem/trivia present", () => {
    render(<FunExtrasCard report={mockReport} />);
    expect(screen.getByTestId("fun-extras-card")).toBeInTheDocument();
    expect(screen.getByText("Mostly chill vibes")).toBeInTheDocument();
    expect(screen.getByText("Hades")).toBeInTheDocument();
    expect(screen.getByText(/65-rated title/i)).toBeInTheDocument();
    expect(screen.getByText(/90% rating/i)).toBeInTheDocument();
  });

  it("renders nothing when no mood/gem/trivia", () => {
    const { container } = render(
      <FunExtrasCard
        report={{ ...mockReport, moodTagline: null, hiddenGem: null, trivia: [] }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only mood tagline when gem and trivia absent", () => {
    render(
      <FunExtrasCard
        report={{ ...mockReport, hiddenGem: null, trivia: [] }}
      />,
    );
    expect(screen.getByTestId("fun-extras-card")).toBeInTheDocument();
    expect(screen.getByText("Mostly chill vibes")).toBeInTheDocument();
    expect(screen.queryByText("Hades")).not.toBeInTheDocument();
  });

  it("renders only hidden gem when mood and trivia absent", () => {
    render(
      <FunExtrasCard
        report={{ ...mockReport, moodTagline: null, trivia: [] }}
      />,
    );
    expect(screen.getByTestId("fun-extras-card")).toBeInTheDocument();
    expect(screen.getByText("Hades")).toBeInTheDocument();
    expect(screen.getByText(/65-rated title/i)).toBeInTheDocument();
  });

  it("renders only trivia when mood and gem absent", () => {
    render(
      <FunExtrasCard
        report={{ ...mockReport, moodTagline: null, hiddenGem: null }}
      />,
    );
    expect(screen.getByTestId("fun-extras-card")).toBeInTheDocument();
    expect(screen.getByText(/90% rating/i)).toBeInTheDocument();
  });

  it("renders multiple trivia items", () => {
    render(
      <FunExtrasCard
        report={{
          ...mockReport,
          moodTagline: null,
          hiddenGem: null,
          trivia: ["Fact one", "Fact two", "Fact three"],
        }}
      />,
    );
    expect(screen.getByText("Fact one")).toBeInTheDocument();
    expect(screen.getByText("Fact two")).toBeInTheDocument();
    expect(screen.getByText("Fact three")).toBeInTheDocument();
  });
});

// ── DotNavigation ──────────────────────────────────────────────────────────

describe("DotNavigation", () => {
  it("renders correct number of dots", () => {
    render(<DotNavigation count={5} activeIndex={2} onDotClick={vi.fn()} />);
    const nav = screen.getByTestId("dot-navigation");
    expect(nav.querySelectorAll("button")).toHaveLength(5);
  });

  it("calls onDotClick with correct index", () => {
    const onClick = vi.fn();
    render(<DotNavigation count={3} activeIndex={0} onDotClick={onClick} />);
    const buttons = screen.getByTestId("dot-navigation").querySelectorAll("button");
    fireEvent.click(buttons[2]);
    expect(onClick).toHaveBeenCalledWith(2);
  });
});

// ── WrappedView integration ────────────────────────────────────────────────

// jsdom does not implement scrollTo on elements
Element.prototype.scrollTo = vi.fn();

// jsdom does not implement IntersectionObserver
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
  } as unknown as typeof IntersectionObserver;
}

describe("WrappedView", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_available_wrapped_periods") return Promise.resolve(mockAvailable);
      if (cmd === "get_wrapped_report") return Promise.resolve(mockReport);
      return Promise.resolve({});
    });
  });

  it("shows skeleton while loading", () => {
    render(<WrappedView onClose={vi.fn()} />);
    expect(screen.getByTestId("wrapped-skeleton")).toBeInTheDocument();
  });

  it("renders all cards with full mock report", async () => {
    render(<WrappedView onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("hero-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("top-game-card")).toBeInTheDocument();
    expect(screen.getByTestId("top-games-card")).toBeInTheDocument();
    expect(screen.getByTestId("genre-card")).toBeInTheDocument();
    expect(screen.getByTestId("milestones-card")).toBeInTheDocument();
    expect(screen.getByTestId("diversity-card")).toBeInTheDocument();
    expect(screen.getByTestId("library-growth-card")).toBeInTheDocument();
    expect(screen.getByTestId("fun-extras-card")).toBeInTheDocument();
  });

  it("shows empty state when totalSessions = 0", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_available_wrapped_periods") return Promise.resolve(mockAvailable);
      if (cmd === "get_wrapped_report") return Promise.resolve(emptyReport);
      return Promise.resolve({});
    });
    render(<WrappedView onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("wrapped-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/No play data/i)).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<WrappedView onClose={onClose} />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<WrappedView onClose={onClose} />);
    fireEvent.click(screen.getByTestId("wrapped-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("period selector change triggers re-fetch", async () => {
    render(<WrappedView onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("period-selector")).toBeInTheDocument();
    });
    const callsBefore = vi.mocked(invoke).mock.calls.filter(
      ([cmd]) => cmd === "get_wrapped_report",
    ).length;
    fireEvent.click(screen.getByTestId("period-preset-this_month"));
    await waitFor(() => {
      const callsAfter = vi.mocked(invoke).mock.calls.filter(
        ([cmd]) => cmd === "get_wrapped_report",
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  it("dot count matches visible card count", async () => {
    render(<WrappedView onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("dot-navigation")).toBeInTheDocument();
    });
    const dots = screen
      .getByTestId("dot-navigation")
      .querySelectorAll("button");
    const cards = document.querySelectorAll("[data-card]");
    expect(dots.length).toBe(cards.length);
  });
});

// ── LibraryStats "My Wrapped" button ──────────────────────────────────────

describe("LibraryStats My Wrapped button", () => {
  const emptyStats = {
    totalPlayTimeS: 0,
    gamesPlayed: 0,
    gamesUnplayed: 0,
    mostPlayedGame: null,
    weeklyPlayTimeS: 0,
  };

  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(() => Promise.resolve({}));
  });

  it("renders My Wrapped button when onOpenWrapped provided", () => {
    render(
      <LibraryStats
        stats={emptyStats}
        activityData={[]}
        topGames={[]}
        sessions={[]}
        onOpenWrapped={vi.fn()}
      />,
    );
    expect(screen.getByTestId("open-wrapped-button")).toBeInTheDocument();
  });

  it("calls onOpenWrapped when clicked", () => {
    const onOpenWrapped = vi.fn();
    render(
      <LibraryStats
        stats={emptyStats}
        activityData={[]}
        topGames={[]}
        sessions={[]}
        onOpenWrapped={onOpenWrapped}
      />,
    );
    fireEvent.click(screen.getByTestId("open-wrapped-button"));
    expect(onOpenWrapped).toHaveBeenCalled();
  });

  it("does not render My Wrapped button when onOpenWrapped not provided", () => {
    render(
      <LibraryStats
        stats={emptyStats}
        activityData={[]}
        topGames={[]}
        sessions={[]}
      />,
    );
    expect(screen.queryByTestId("open-wrapped-button")).not.toBeInTheDocument();
  });
});
