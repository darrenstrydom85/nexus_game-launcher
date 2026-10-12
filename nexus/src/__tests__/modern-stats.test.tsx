import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { StatsPage } from "@/modern/stats/StatsPage";
import { useStatsRange } from "@/modern/stats/useStatsData";
import { TierLegend } from "@/components/Stats/TierLegend";
import { MilestoneHistorySection } from "@/components/Milestones/MilestoneHistorySection";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { useMilestoneStore } from "@/stores/milestoneStore";
import { toDateStr } from "@/lib/statsRange";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  activityBuckets,
  activityUnit,
  filterSessionsByRange,
  heatmapWeeks,
  newGamesInRange,
  previousRange,
  sessionLengthCounts,
} from "@/lib/statsData";

const thisMonth = `${toDateStr(new Date()).slice(0, 8)}01T10:00:00Z`;
const sessions = [
  { id: "s1", gameId: "g1", gameName: "Ori", startedAt: thisMonth, endedAt: thisMonth, durationS: 7200, note: null },
  { id: "s2", gameId: "g1", gameName: "Ori", startedAt: "2020-01-05T10:00:00Z", endedAt: "2020-01-05T11:00:00Z", durationS: 3600, note: null },
];

function backend(cmd: string) {
  switch (cmd) {
    case "get_library_stats":
      return { totalPlayTimeS: 36_000, gamesPlayed: 4, gamesUnplayed: 10, mostPlayedGame: "Ori", weeklyPlayTimeS: 0 };
    case "get_all_sessions":
      return sessions;
    case "get_top_games":
      return [{ id: "g1", name: "Ori", coverUrl: null, totalPlayTimeS: 36_000 }];
    case "get_session_distribution":
      return null;
    default:
      return [];
  }
}

const scrollIntoView = vi.fn();

describe("v1 Stats page", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(backend(cmd)));
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
    useGameStore.setState({ games: [], lastSessionEndedAt: 0 });
    useUiStore.setState({ statsScrollTarget: null });
  });

  afterEach(() => {
    // jsdom has no scrollIntoView; keep the stub from leaking.
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("totals the current month, and the whole library for All time", async () => {
    render(<StatsPage onOpenWrapped={vi.fn()} />, { wrapper: TooltipProvider });
    await waitFor(() => expect(screen.getByTestId("stats-summary")).toBeInTheDocument());
    expect(screen.getByTestId("stats-summary")).toHaveTextContent("2h 0m");
    fireEvent.click(screen.getByRole("radio", { name: "All time" }));
    expect(screen.getByTestId("stats-summary")).toHaveTextContent("10h 0m");
  });

  it("opens Wrapped", async () => {
    const onOpenWrapped = vi.fn();
    render(<StatsPage onOpenWrapped={onOpenWrapped} />, { wrapper: TooltipProvider });
    fireEvent.click(screen.getByTestId("open-wrapped-button"));
    expect(onOpenWrapped).toHaveBeenCalledOnce();
  });

  it("jumps to a section from the links", async () => {
    render(<StatsPage onOpenWrapped={vi.fn()} />, { wrapper: TooltipProvider });
    await waitFor(() => expect(screen.getByTestId("stats-summary")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("stats-jump-sessions"));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId("stats-jump-sessions")).toHaveAttribute("aria-current", "true");
  });

  it("honours a scroll target from a notification, then clears it", async () => {
    useUiStore.setState({ statsScrollTarget: "xp" });
    render(<StatsPage onOpenWrapped={vi.fn()} />, { wrapper: TooltipProvider });
    await waitFor(() => expect(useUiStore.getState().statsScrollTarget).toBeNull());
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId("stats-jump-level")).toHaveAttribute("aria-current", "true");
  });

  it("says so when stats fail to load, and retries", async () => {
    mockInvoke.mockImplementation((cmd: string) => (cmd === "get_all_sessions" ? Promise.reject(new Error("db")) : Promise.resolve(backend(cmd))));
    render(<StatsPage onOpenWrapped={vi.fn()} />, { wrapper: TooltipProvider });
    await waitFor(() => expect(screen.getByTestId("stats-error")).toBeInTheDocument());
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(backend(cmd)));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("stats-summary")).toBeInTheDocument());
  });

  it("keeps the page up while refetching after a session ends", async () => {
    render(<StatsPage onOpenWrapped={vi.fn()} />, { wrapper: TooltipProvider });
    await waitFor(() => expect(screen.getByTestId("stats-summary")).toBeInTheDocument());
    act(() => useGameStore.setState({ lastSessionEndedAt: Date.now() }));
    expect(screen.queryByTestId("stats-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("stats-summary")).toBeInTheDocument();
  });
});

describe("useStatsRange", () => {
  it("rejects a backwards custom range and applies a valid one", () => {
    const { result } = renderHook(() => useStatsRange());
    let ok = true;
    act(() => {
      ok = result.current.applyCustom("2026-10-10", "2026-10-01");
    });
    expect(ok).toBe(false);
    expect(result.current.choice).toBe("this_month");
    act(() => {
      result.current.applyCustom("2026-10-01", "2026-10-10");
    });
    expect(result.current.choice).toBe("custom");
    expect(result.current.range).toEqual({ start: "2026-10-01", end: "2026-10-10" });
  });
});

describe("regressions", () => {
  it("TierLegend survives tiers loading after it mounted", () => {
    useMasteryStore.setState({ tiers: new Map() });
    render(<TierLegend />);
    act(() =>
      useMasteryStore.setState({
        tiers: new Map([["g1", { gameId: "g1", tier: "gold", totalPlayTimeS: 100_000, nextTierThresholdS: 180_000, progressToNextTier: 0.2 }]]),
      }),
    );
    expect(screen.getByText(/gold/i)).toBeInTheDocument();
  });

  it("milestones from a previous range don't linger on an empty one", () => {
    useMilestoneStore.setState({
      history: [{ sessionId: "s1", milestones: [{ id: "m1", title: "Night owl", description: "", icon: "Moon", category: "time", gameName: "Ori" }] }],
      historyLoading: false,
    } as never);
    render(<MilestoneHistorySection sessionIds={[]} />);
    expect(screen.queryByText("Night owl")).not.toBeInTheDocument();
  });

  it("counts sessions on the local calendar day, not the UTC one", () => {
    // Just after midnight and just before it, local time: one of these crosses the UTC date line anywhere but UTC.
    const at = (h: number, m: number) => new Date(2026, 9, 2, h, m).toISOString();
    const local = [
      { ...sessions[0], id: "early", startedAt: at(0, 30) },
      { ...sessions[0], id: "late", startedAt: at(23, 30) },
    ];
    expect(filterSessionsByRange(local, { start: "2026-10-02", end: "2026-10-02" }).map((s) => s.id)).toEqual(["early", "late"]);
  });
});

describe("stats helpers", () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
  const sess = (id: string, gameId: string, startedAt: string, durationS: number) => ({
    id, gameId, gameName: gameId, startedAt, endedAt: startedAt, durationS, note: null,
  });

  it("compares a month or year to the same days before it, clamping short months", () => {
    expect(previousRange("this_month", { start: "2026-10-01", end: "2026-10-12" })).toEqual({ start: "2026-09-01", end: "2026-09-12" });
    expect(previousRange("this_month", { start: "2026-03-01", end: "2026-03-31" })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousRange("this_year", { start: "2026-01-01", end: "2026-10-12" })).toEqual({ start: "2025-01-01", end: "2025-10-12" });
    expect(previousRange("last_30_days", { start: "2026-09-13", end: "2026-10-12" })).toEqual({ start: "2026-08-14", end: "2026-09-12" });
  });

  it("sizes chart buckets to the range", () => {
    expect(activityUnit({ start: "2026-10-01", end: "2026-10-31" })).toBe("day");
    expect(activityUnit({ start: "2026-08-01", end: "2026-10-12" })).toBe("week");
    expect(activityUnit({ start: "2026-01-01", end: "2026-10-12" })).toBe("month");
    expect(activityUnit({ start: "2020-01-01", end: "2026-10-12" })).toBe("year");
  });

  it("sums sessions into their local day and marks today", () => {
    const buckets = activityBuckets(
      [sess("a", "g", at(2026, 10, 2), 3600), sess("b", "g", at(2026, 10, 2, 23), 1800), sess("c", "g", at(2026, 9, 30), 999)],
      { start: "2026-10-01", end: "2026-10-03" },
      "2026-10-03",
    );
    expect(buckets.map((b) => b.seconds)).toEqual([0, 5400, 0]);
    expect(buckets.map((b) => b.current)).toEqual([false, false, true]);
  });

  it("groups a year by month", () => {
    const buckets = activityBuckets([sess("a", "g", at(2026, 3, 15), 600)], { start: "2026-01-01", end: "2026-10-12" }, "2026-10-12");
    expect(buckets).toHaveLength(10);
    expect(buckets[2].seconds).toBe(600);
  });

  it("lays the heatmap out Monday-first and hides future days", () => {
    // 2026-10-14 is a Wednesday.
    const weeks = heatmapWeeks([sess("a", "g", at(2026, 10, 12), 7200)], 2, "2026-10-14");
    expect(weeks).toHaveLength(2);
    expect(weeks[1][0]).toMatchObject({ date: "2026-10-12", level: 4 });
    expect(weeks[1].filter((c) => c.future).map((c) => c.date)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("bands session lengths", () => {
    expect(sessionLengthCounts([sess("a", "g", at(2026, 1, 1), 60), sess("b", "g", at(2026, 1, 1), 3600), sess("c", "g", at(2026, 1, 1), 20_000)])).toEqual([1, 0, 1, 0, 1]);
  });

  it("counts games first played inside the range", () => {
    const all = [sess("a", "old", at(2026, 9, 1), 60), sess("b", "old", at(2026, 10, 2), 60), sess("c", "new", at(2026, 10, 3), 60)];
    expect(newGamesInRange(all, { start: "2026-10-01", end: "2026-10-31" })).toBe(1);
  });
});

