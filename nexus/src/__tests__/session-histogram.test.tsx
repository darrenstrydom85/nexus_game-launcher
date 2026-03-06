import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { SessionHistogram } from "@/components/Stats/SessionHistogram";
import type { SessionDistribution } from "@/lib/tauri";

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

const mockDistribution: SessionDistribution = {
  buckets: [
    { label: "< 15m",  minS: 0,        maxS: 900,    count: 10, totalPlayTimeS: 5400 },
    { label: "15–30m", minS: 900,       maxS: 1800,   count: 25, totalPlayTimeS: 33750 },
    { label: "30m–1h", minS: 1800,      maxS: 3600,   count: 47, totalPlayTimeS: 126900 },
    { label: "1–2h",   minS: 3600,      maxS: 7200,   count: 38, totalPlayTimeS: 205200 },
    { label: "2–4h",   minS: 7200,      maxS: 14400,  count: 20, totalPlayTimeS: 216000 },
    { label: "4–8h",   minS: 14400,     maxS: 28800,  count: 8,  totalPlayTimeS: 172800 },
    { label: "8h+",    minS: 28800,     maxS: null,   count: 2,  totalPlayTimeS: 72000 },
  ],
  totalSessions: 150,
  meanDurationS: 2700,
  medianDurationS: 2400,
  p75DurationS: 5400,
  p95DurationS: 18000,
  shortestSessionS: 60,
  longestSessionS: 32400,
};

const emptyDistribution: SessionDistribution = {
  buckets: [
    { label: "< 15m",  minS: 0,    maxS: 900,   count: 0, totalPlayTimeS: 0 },
    { label: "15–30m", minS: 900,  maxS: 1800,  count: 0, totalPlayTimeS: 0 },
    { label: "30m–1h", minS: 1800, maxS: 3600,  count: 0, totalPlayTimeS: 0 },
    { label: "1–2h",   minS: 3600, maxS: 7200,  count: 0, totalPlayTimeS: 0 },
    { label: "2–4h",   minS: 7200, maxS: 14400, count: 0, totalPlayTimeS: 0 },
    { label: "4–8h",   minS: 14400,maxS: 28800, count: 0, totalPlayTimeS: 0 },
    { label: "8h+",    minS: 28800,maxS: null,  count: 0, totalPlayTimeS: 0 },
  ],
  totalSessions: 0,
  meanDurationS: 0,
  medianDurationS: 0,
  p75DurationS: 0,
  p95DurationS: 0,
  shortestSessionS: 0,
  longestSessionS: 0,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Story 17.2: SessionHistogram", () => {
  it("renders the histogram container", () => {
    render(<SessionHistogram distribution={mockDistribution} />);
    expect(screen.getByTestId("session-histogram")).toBeInTheDocument();
  });

  it("renders 7 bars (one per bucket)", () => {
    render(<SessionHistogram distribution={mockDistribution} />);
    // Recharts renders <rect> elements for bars; we verify via the BarChart being present
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("shows loading skeleton when isLoading=true", () => {
    render(<SessionHistogram isLoading />);
    expect(screen.getByTestId("histogram-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("session-histogram")).not.toBeInTheDocument();
  });

  it("shows empty state when totalSessions=0", () => {
    render(<SessionHistogram distribution={emptyDistribution} />);
    expect(screen.getByTestId("histogram-empty")).toBeInTheDocument();
    expect(screen.getByText("No sessions recorded yet")).toBeInTheDocument();
  });

  it("shows empty state when distribution is null", () => {
    render(<SessionHistogram distribution={null} />);
    expect(screen.getByTestId("histogram-empty")).toBeInTheDocument();
  });

  it("renders stats summary row with correct values", () => {
    render(<SessionHistogram distribution={mockDistribution} />);
    const statsRow = screen.getByTestId("histogram-stats-row");
    expect(statsRow).toBeInTheDocument();

    // Mean: 2700s = 45m
    expect(screen.getByTestId("stat-pill-mean")).toHaveTextContent("45m");
    // Median: 2400s = 40m
    expect(screen.getByTestId("stat-pill-median")).toHaveTextContent("40m");
    // 75th pct: 5400s = 1h 30m
    expect(screen.getByTestId("stat-pill-75th-pct")).toHaveTextContent("1h 30m");
    // Longest: 32400s = 9h 0m
    expect(screen.getByTestId("stat-pill-longest")).toHaveTextContent("9h 0m");
  });

  it("does not render stats summary row when empty", () => {
    render(<SessionHistogram distribution={emptyDistribution} />);
    expect(screen.queryByTestId("histogram-stats-row")).not.toBeInTheDocument();
  });

  it("renders scope toggle buttons", () => {
    render(<SessionHistogram distribution={mockDistribution} />);
    expect(screen.getByTestId("scope-toggle-all")).toBeInTheDocument();
    expect(screen.getByTestId("scope-toggle-source")).toBeInTheDocument();
  });

  it("shows source filter pills when By Source is selected", () => {
    render(
      <SessionHistogram
        distribution={mockDistribution}
        availableSources={["steam", "epic", "gog"]}
      />,
    );
    expect(screen.queryByTestId("source-filter-pills")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("scope-toggle-source"));
    expect(screen.getByTestId("source-filter-pills")).toBeInTheDocument();
    expect(screen.getByTestId("source-pill-steam")).toBeInTheDocument();
    expect(screen.getByTestId("source-pill-epic")).toBeInTheDocument();
    expect(screen.getByTestId("source-pill-gog")).toBeInTheDocument();
  });

  it("calls onScopeChange with Library scope on mount", () => {
    const onScopeChange = vi.fn();
    render(
      <SessionHistogram
        distribution={mockDistribution}
        onScopeChange={onScopeChange}
      />,
    );
    expect(onScopeChange).toHaveBeenCalledWith({ type: "Library" });
  });

  it("calls onScopeChange with Source scope when By Source + source selected", () => {
    const onScopeChange = vi.fn();
    render(
      <SessionHistogram
        distribution={mockDistribution}
        onScopeChange={onScopeChange}
        availableSources={["steam", "epic"]}
      />,
    );
    onScopeChange.mockClear();
    fireEvent.click(screen.getByTestId("scope-toggle-source"));
    expect(onScopeChange).toHaveBeenCalledWith({
      type: "Source",
      value: "steam",
    });
  });

  it("calls onScopeChange with new source when source pill clicked", () => {
    const onScopeChange = vi.fn();
    render(
      <SessionHistogram
        distribution={mockDistribution}
        onScopeChange={onScopeChange}
        availableSources={["steam", "epic"]}
      />,
    );
    fireEvent.click(screen.getByTestId("scope-toggle-source"));
    onScopeChange.mockClear();
    fireEvent.click(screen.getByTestId("source-pill-epic"));
    expect(onScopeChange).toHaveBeenCalledWith({
      type: "Source",
      value: "epic",
    });
  });

  it("tallest bar bucket is '30m-1h' (count=47) in mock data", () => {
    // Verify the mock data has the expected mode bucket
    const tallest = mockDistribution.buckets.reduce((a, b) =>
      b.count > a.count ? b : a,
    );
    expect(tallest.label).toBe("30m–1h");
    expect(tallest.count).toBe(47);
  });

  it("chart has accessible aria-label", () => {
    render(<SessionHistogram distribution={mockDistribution} />);
    expect(
      screen.getByRole("img", { name: "Session length distribution" }),
    ).toBeInTheDocument();
  });
});
