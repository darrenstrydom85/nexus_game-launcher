import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import {
  LibraryStats,
  formatHours,
  type PlayStats,
  type ActivityDataPoint,
  type TopGame,
  type SessionRecord,
} from "@/components/Library/LibraryStats";

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: { accentColor: string }) => string) =>
    selector({ accentColor: "#7600da" }),
}));

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

const emptyDistribution = {
  buckets: [
    { label: "< 15m",  minS: 0,     maxS: 900,   count: 0, totalPlayTimeS: 0 },
    { label: "15–30m", minS: 900,   maxS: 1800,  count: 0, totalPlayTimeS: 0 },
    { label: "30m–1h", minS: 1800,  maxS: 3600,  count: 0, totalPlayTimeS: 0 },
    { label: "1–2h",   minS: 3600,  maxS: 7200,  count: 0, totalPlayTimeS: 0 },
    { label: "2–4h",   minS: 7200,  maxS: 14400, count: 0, totalPlayTimeS: 0 },
    { label: "4–8h",   minS: 14400, maxS: 28800, count: 0, totalPlayTimeS: 0 },
    { label: "8h+",    minS: 28800, maxS: null,  count: 0, totalPlayTimeS: 0 },
  ],
  totalSessions: 0,
  meanDurationS: 0,
  medianDurationS: 0,
  p75DurationS: 0,
  p95DurationS: 0,
  shortestSessionS: 0,
  longestSessionS: 0,
};

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_library_stats")
      return Promise.resolve({
        totalPlayTimeS: 0,
        gamesPlayed: 0,
        gamesUnplayed: 0,
        mostPlayedGame: null,
        weeklyPlayTimeS: 0,
      });
    if (cmd === "get_activity_data") return Promise.resolve([]);
    if (cmd === "get_top_games") return Promise.resolve([]);
    if (cmd === "get_all_sessions") return Promise.resolve([]);
    if (cmd === "get_session_distribution") return Promise.resolve(emptyDistribution);
    return Promise.resolve({});
  });
});

const mockStats: PlayStats = {
  totalPlayTimeS: 360000,
  gamesPlayed: 25,
  gamesUnplayed: 10,
  mostPlayedGame: "Cyberpunk 2077",
  weeklyPlayTimeS: 36000,
};

const mockActivity: ActivityDataPoint[] = [
  { date: "2026-02-25", minutes: 120 },
  { date: "2026-02-26", minutes: 60 },
  { date: "2026-02-27", minutes: 90 },
];

const mockTopGames: TopGame[] = [
  { id: "g1", name: "Cyberpunk 2077", coverUrl: null, totalPlayTimeS: 100000 },
  { id: "g2", name: "Elden Ring", coverUrl: null, totalPlayTimeS: 80000 },
  { id: "g3", name: "Hades", coverUrl: null, totalPlayTimeS: 50000 },
];

const mockSessions: SessionRecord[] = Array.from({ length: 25 }, (_, i) => ({
  id: `s${i}`,
  gameId: `g${i}`,
  gameName: `Game ${i}`,
  startedAt: `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  endedAt: `2026-02-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
  durationS: 7200,
}));

describe("Story 6.7: Library Stats Page", () => {
  it("renders the stats dashboard", () => {
    render(<LibraryStats stats={mockStats} initialDateRange="all" />);
    expect(screen.getByTestId("library-stats")).toBeInTheDocument();
  });

  it("renders summary cards", () => {
    render(<LibraryStats stats={mockStats} initialDateRange="all" />);
    expect(screen.getByTestId("stats-summary")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-total-hours")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-games-played")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-games-unplayed")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-most-played")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-weekly-play-time")).toBeInTheDocument();
  });

  it("displays correct stat values", () => {
    render(<LibraryStats stats={mockStats} initialDateRange="all" />);
    expect(screen.getByTestId("stat-card-total-hours")).toHaveTextContent(
      "100h 0m",
    );
    expect(screen.getByTestId("stat-card-games-played")).toHaveTextContent("25");
    expect(screen.getByTestId("stat-card-games-unplayed")).toHaveTextContent(
      "10",
    );
    expect(screen.getByTestId("stat-card-most-played")).toHaveTextContent(
      "Cyberpunk 2077",
    );
    expect(screen.getByTestId("stat-card-weekly-play-time")).toHaveTextContent(
      "10h 0m",
    );
  });

  it("renders activity chart and date range chooser", () => {
    render(
      <LibraryStats stats={mockStats} activityData={mockActivity} initialDateRange="all" />,
    );
    expect(screen.getByTestId("activity-chart")).toBeInTheDocument();
    expect(screen.getByTestId("stats-date-range")).toBeInTheDocument();
    expect(screen.getByTestId("stats-range-all")).toBeInTheDocument();
    expect(screen.getByTestId("stats-range-start")).toBeInTheDocument();
    expect(screen.getByTestId("stats-range-end")).toBeInTheDocument();
    expect(screen.getByTestId("stats-range-apply")).toBeInTheDocument();
  });

  it("renders activity heatmap", () => {
    render(
      <LibraryStats stats={mockStats} activityData={mockActivity} initialDateRange="all" />,
    );
    expect(screen.getByTestId("activity-heatmap")).toBeInTheDocument();
  });

  it("renders top games chart", () => {
    render(
      <LibraryStats stats={mockStats} topGames={mockTopGames} initialDateRange="all" />,
    );
    expect(screen.getByTestId("top-games-chart")).toBeInTheDocument();
    expect(screen.getByTestId("top-game-0")).toBeInTheDocument();
    expect(screen.getByTestId("top-game-1")).toBeInTheDocument();
    expect(screen.getByTestId("top-game-2")).toBeInTheDocument();
  });

  it("renders session history with pagination", () => {
    render(
      <LibraryStats stats={mockStats} sessions={mockSessions} initialDateRange="all" />,
    );
    expect(screen.getByTestId("session-history")).toBeInTheDocument();
    expect(screen.getByTestId("session-pagination")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("session pagination navigates pages", () => {
    render(
      <LibraryStats stats={mockStats} sessions={mockSessions} initialDateRange="all" />,
    );
    expect(screen.getByTestId("session-s0")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("session-next"));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("session-s20")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("session-prev"));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("shows 20 sessions per page", () => {
    render(
      <LibraryStats stats={mockStats} sessions={mockSessions} initialDateRange="all" />,
    );
    const sessionElements = screen.getAllByTestId(/^session-s\d+$/);
    expect(sessionElements).toHaveLength(20);
  });

  it("renders with default empty stats", async () => {
    render(<LibraryStats />);
    await waitFor(() => {
      expect(screen.getByTestId("stat-card-total-hours")).toHaveTextContent(
        "0m",
      );
    });
  });
});

describe("formatHours", () => {
  it("formats seconds as hours and minutes", () => {
    expect(formatHours(3600)).toBe("1h 0m");
    expect(formatHours(7200)).toBe("2h 0m");
    expect(formatHours(9000)).toBe("2h 30m");
    expect(formatHours(0)).toBe("0m");
  });
});
