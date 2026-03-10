import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { PerGameSessionPanel } from "@/components/GameDetail/PerGameSessionPanel";
import { SessionList } from "@/components/GameDetail/SessionList";
import { SessionPatternsCharts } from "@/components/GameDetail/SessionPatternsCharts";
import { GamePlayStats } from "@/components/GameDetail/GamePlayStats";
import type { PerGameSessionStats, SessionRecord } from "@/types/analytics";
import type { Game } from "@/stores/gameStore";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 200 }}>
        {children}
      </div>
    ),
  };
});

// ── Mock data ──────────────────────────────────────────────────────────────

function makeSessions(count: number): SessionRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    startedAt: `2026-02-${String(Math.min(i + 1, 28)).padStart(2, "0")}T10:00:00Z`,
    endedAt: `2026-02-${String(Math.min(i + 1, 28)).padStart(2, "0")}T12:00:00Z`,
    durationS: 7200,
    trackingMethod: i % 3 === 0 ? "manual" : "direct",
  }));
}

const mockDistribution = {
  buckets: [
    { label: "< 15m",  minS: 0,     maxS: 900,   count: 2,  totalPlayTimeS: 1200 },
    { label: "15–30m", minS: 900,   maxS: 1800,  count: 5,  totalPlayTimeS: 6750 },
    { label: "30m–1h", minS: 1800,  maxS: 3600,  count: 12, totalPlayTimeS: 32400 },
    { label: "1–2h",   minS: 3600,  maxS: 7200,  count: 20, totalPlayTimeS: 108000 },
    { label: "2–4h",   minS: 7200,  maxS: 14400, count: 6,  totalPlayTimeS: 64800 },
    { label: "4–8h",   minS: 14400, maxS: 28800, count: 2,  totalPlayTimeS: 43200 },
    { label: "8h+",    minS: 28800, maxS: null,   count: 0,  totalPlayTimeS: 0 },
  ],
  totalSessions: 47,
  meanDurationS: 5400,
  medianDurationS: 4800,
  p75DurationS: 7200,
  p95DurationS: 14400,
  shortestSessionS: 120,
  longestSessionS: 21600,
};

const mockStats: PerGameSessionStats = {
  sessions: makeSessions(47),
  distribution: mockDistribution,
  playTimeByMonth: [
    { month: 1, playTimeS: 36000 },
    { month: 2, playTimeS: 72000 },
    { month: 3, playTimeS: 18000 },
  ],
  playTimeByDayOfWeek: [
    { day: 0, playTimeS: 14400 },
    { day: 1, playTimeS: 7200 },
    { day: 2, playTimeS: 10800 },
    { day: 3, playTimeS: 3600 },
    { day: 4, playTimeS: 21600 },
    { day: 5, playTimeS: 28800 },
    { day: 6, playTimeS: 18000 },
  ],
  averageGapDays: 3.5,
};

const mockGame: Game = {
  id: "game-1",
  name: "Test Game",
  source: "steam",
  folderPath: null,
  exePath: "C:\\Games\\test.exe",
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
  totalPlayTimeS: 256350,
  lastPlayedAt: "2026-02-28T10:00:00Z",
  playCount: 47,
  addedAt: "2025-01-01T00:00:00Z",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
};

// ── SessionList tests ──────────────────────────────────────────────────────

describe("Story 17.3: SessionList", () => {
  it("renders correct session count", () => {
    render(<SessionList sessions={makeSessions(47)} />);
    expect(screen.getByTestId("session-count")).toHaveTextContent("47");
  });

  it("renders empty state when no sessions", () => {
    render(<SessionList sessions={[]} />);
    expect(screen.getByTestId("session-list-empty")).toBeInTheDocument();
    expect(screen.getByText("No sessions recorded yet")).toBeInTheDocument();
  });

  it("renders first 20 session rows by default", () => {
    render(<SessionList sessions={makeSessions(47)} />);
    const rows = screen.getAllByTestId("session-row");
    expect(rows).toHaveLength(20);
  });

  it("shows Load more button when more than 20 sessions", () => {
    render(<SessionList sessions={makeSessions(47)} />);
    expect(screen.getByTestId("load-more-btn")).toBeInTheDocument();
  });

  it("does not show Load more when 20 or fewer sessions", () => {
    render(<SessionList sessions={makeSessions(15)} />);
    expect(screen.queryByTestId("load-more-btn")).not.toBeInTheDocument();
  });

  it("Load more appends next 20 rows", () => {
    render(<SessionList sessions={makeSessions(47)} />);
    expect(screen.getAllByTestId("session-row")).toHaveLength(20);
    fireEvent.click(screen.getByTestId("load-more-btn"));
    expect(screen.getAllByTestId("session-row")).toHaveLength(40);
    fireEvent.click(screen.getByTestId("load-more-btn"));
    expect(screen.getAllByTestId("session-row")).toHaveLength(47);
    expect(screen.queryByTestId("load-more-btn")).not.toBeInTheDocument();
  });

  it("renders tracking method badges", () => {
    render(<SessionList sessions={makeSessions(3)} />);
    const badges = screen.getAllByTestId("tracking-badge");
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent("Manual");
    expect(badges[1]).toHaveTextContent("Auto");
    expect(badges[2]).toHaveTextContent("Auto");
  });
});

// ── SessionPatternsCharts tests ────────────────────────────────────────────

describe("Story 17.3: SessionPatternsCharts", () => {
  it("renders both charts", () => {
    render(
      <SessionPatternsCharts
        playTimeByMonth={mockStats.playTimeByMonth}
        playTimeByDayOfWeek={mockStats.playTimeByDayOfWeek}
        averageGapDays={3.5}
        totalSessions={47}
      />,
    );
    expect(screen.getByTestId("chart-by-month")).toBeInTheDocument();
    expect(screen.getByTestId("chart-by-day")).toBeInTheDocument();
  });

  it("renders return rate for multi-session games", () => {
    render(
      <SessionPatternsCharts
        playTimeByMonth={mockStats.playTimeByMonth}
        playTimeByDayOfWeek={mockStats.playTimeByDayOfWeek}
        averageGapDays={3.5}
        totalSessions={47}
      />,
    );
    expect(screen.getByTestId("return-rate")).toHaveTextContent(
      "You return to this game every 4 days on average",
    );
  });

  it("shows 'Play more' message for single-session games", () => {
    render(
      <SessionPatternsCharts
        playTimeByMonth={[]}
        playTimeByDayOfWeek={[]}
        averageGapDays={0}
        totalSessions={1}
      />,
    );
    expect(screen.getByTestId("return-rate-insufficient")).toHaveTextContent(
      "Play more to see return rate",
    );
  });
});

// ── PerGameSessionPanel tests ──────────────────────────────────────────────

describe("Story 17.3: PerGameSessionPanel", () => {
  it("renders with Sessions tab active by default", () => {
    render(<PerGameSessionPanel stats={mockStats} isLoading={false} />);
    expect(screen.getByTestId("per-game-session-panel")).toBeInTheDocument();
    expect(screen.getByTestId("session-list")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    render(<PerGameSessionPanel stats={null} isLoading={true} />);
    expect(screen.getByTestId("sessions-skeleton")).toBeInTheDocument();
  });

  it("switches to Patterns tab", async () => {
    const user = userEvent.setup();
    render(<PerGameSessionPanel stats={mockStats} isLoading={false} />);
    await user.click(screen.getByTestId("tab-patterns"));
    expect(screen.getByTestId("tab-patterns")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("tab-sessions")).toHaveAttribute("data-state", "inactive");
  });

  it("switches to Distribution tab", async () => {
    const user = userEvent.setup();
    render(<PerGameSessionPanel stats={mockStats} isLoading={false} />);
    await user.click(screen.getByTestId("tab-distribution"));
    expect(screen.getByTestId("tab-distribution")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("tab-sessions")).toHaveAttribute("data-state", "inactive");
  });

  it("renders View full stats button when callback provided", () => {
    const onViewFullStats = vi.fn();
    render(
      <PerGameSessionPanel
        stats={mockStats}
        isLoading={false}
        onViewFullStats={onViewFullStats}
      />,
    );
    const btn = screen.getByTestId("view-full-stats-link");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onViewFullStats).toHaveBeenCalledOnce();
  });
});

// ── GamePlayStats integration tests ────────────────────────────────────────

describe("Story 17.3: GamePlayStats expandable section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_play_stats") {
        return Promise.resolve({
          sessionCount: 47,
          totalTime: 256350,
          averageSession: 5454,
          lastPlayed: "2026-02-28T10:00:00Z",
        });
      }
      if (cmd === "get_per_game_session_stats") {
        return Promise.resolve(mockStats);
      }
      return Promise.resolve({});
    });
  });

  it("renders the session details toggle button", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("session-details-toggle")).toBeInTheDocument();
    });
  });

  it("panel is hidden by default", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("session-details-toggle")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("session-details-content")).not.toBeInTheDocument();
  });

  it("expands on click and shows panel", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("session-details-toggle")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("session-details-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("session-details-content")).toBeInTheDocument();
    });
  });

  it("calls getPerGameSessionStats on first expand only", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("session-details-toggle")).toBeInTheDocument();
    });

    const sessionCalls = () =>
      vi.mocked(invoke).mock.calls.filter(
        (c) => c[0] === "get_per_game_session_stats",
      ).length;

    expect(sessionCalls()).toBe(0);

    fireEvent.click(screen.getByTestId("session-details-toggle"));

    await waitFor(() => {
      expect(sessionCalls()).toBe(1);
    });

    expect(invoke).toHaveBeenCalledWith("get_per_game_session_stats", {
      gameId: "game-1",
      limit: null,
    });

    // Collapse and re-expand — should NOT re-fetch (cached)
    fireEvent.click(screen.getByTestId("session-details-toggle"));
    fireEvent.click(screen.getByTestId("session-details-toggle"));

    await waitFor(() => {
      expect(sessionCalls()).toBe(1);
    });
  });

  it("shows session data after expand", async () => {
    render(<GamePlayStats game={mockGame} />);
    await waitFor(() => {
      expect(screen.getByTestId("session-details-toggle")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("session-details-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("session-list")).toBeInTheDocument();
    });
    expect(screen.getByTestId("session-count")).toHaveTextContent("47");
  });
});
