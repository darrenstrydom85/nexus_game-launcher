import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { AchievementsPage, sortAchievements } from "@/modern/achievements/AchievementsPage";
import { useAchievementStore } from "@/stores/achievementStore";
import type { AchievementStatus } from "@/lib/tauri";

function ach(over: Partial<AchievementStatus> & { id: string }): AchievementStatus {
  return {
    name: over.id,
    description: "",
    icon: "Trophy",
    category: "library",
    rarity: "common",
    points: 10,
    unlocked: false,
    unlockedAt: null,
    contextJson: null,
    ...over,
  };
}

const statuses = [
  ach({ id: "first", name: "First Steps", unlocked: true, unlockedAt: "2026-10-01T10:00:00Z", points: 25 }),
  ach({ id: "newest", name: "Night Owl", category: "session", rarity: "rare", unlocked: true, unlockedAt: "2026-10-10T10:00:00Z", points: 50 }),
  ach({ id: "collector", name: "Collector", progressCurrent: 9, progressTarget: 10 }),
  ach({ id: "marathon", name: "Marathon", category: "play", rarity: "epic", progressCurrent: 2, progressTarget: 10 }),
  ach({ id: "untouched", name: "Untouched", category: "streak", rarity: "legendary", progressCurrent: 0, progressTarget: 30 }),
];

const scrollIntoView = vi.fn();

async function renderPage() {
  render(<AchievementsPage />);
  // Let the mount fetch settle.
  await act(async () => {});
}

describe("v1 Achievements page", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(cmd === "get_achievement_status" ? statuses : null));
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
    useAchievementStore.setState({ statuses, loading: false, highlightId: null, newUnlockCount: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("summarises progress, refreshes and clears the unread badge", async () => {
    await renderPage();
    expect(screen.getByTestId("achievements-summary")).toHaveTextContent("2 of 5 unlocked · 75 XP");
    expect(screen.getByRole("progressbar", { name: "Achievements unlocked" })).toHaveAttribute("aria-valuenow", "40");
    expect(mockInvoke).toHaveBeenCalledWith("get_achievement_status");
    expect(useAchievementStore.getState().newUnlockCount).toBe(0);
  });

  it("lists Almost there by progress, skipping unstarted ones", async () => {
    await renderPage();
    const almost = within(screen.getByTestId("achievements-almost")).getAllByRole("button");
    expect(almost.map((b) => b.dataset.testid)).toEqual(["almost-collector", "almost-marathon"]);
    expect(almost[0]).toHaveTextContent("9 / 10");
  });

  it("filters by category", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ach-tab-session"));
    expect(screen.getByTestId("achievement-newest")).toBeInTheDocument();
    expect(screen.queryByTestId("achievement-first")).not.toBeInTheDocument();
  });

  it("filters by rarity, and clears filters from the empty state", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ach-rarity-epic"));
    expect(screen.getByTestId("achievement-marathon")).toBeInTheDocument();
    expect(screen.queryByTestId("achievement-first")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ach-tab-session"));
    expect(screen.getByTestId("achievements-empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByTestId(/^achievement-/)).toHaveLength(statuses.length);
  });

  it("drops filters for a highlighted card, scrolls to it, then clears the highlight", async () => {
    vi.useFakeTimers();
    await renderPage();
    fireEvent.click(screen.getByTestId("ach-tab-session"));
    act(() => useAchievementStore.getState().setHighlightId("collector"));
    expect(screen.getByTestId("ach-tab-all")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("achievement-collector")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    act(() => vi.advanceTimersByTime(1600));
    expect(useAchievementStore.getState().highlightId).toBeNull();
  });

  it("Almost there highlights the card in the grid", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("almost-marathon"));
    expect(useAchievementStore.getState().highlightId).toBe("marathon");
  });

  it("shows an empty state with no achievements", async () => {
    useAchievementStore.setState({ statuses: [] });
    mockInvoke.mockImplementation(() => Promise.resolve([]));
    await renderPage();
    expect(screen.getByTestId("achievements-empty")).toHaveTextContent("No achievements yet");
  });

  it("shows a skeleton only before the first load", () => {
    useAchievementStore.setState({ statuses: [], loading: true });
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<AchievementsPage />);
    expect(screen.getByTestId("achievements-loading")).toBeInTheDocument();
  });
});

describe("sortAchievements", () => {
  it("puts newest unlocks first, then locked by progress, then rarity", () => {
    expect(sortAchievements(statuses).map((s) => s.id)).toEqual(["newest", "first", "collector", "marathon", "untouched"]);
  });
});
