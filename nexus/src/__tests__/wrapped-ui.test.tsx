import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WrappedReport, AvailableWrappedPeriods } from "@/types/wrapped";
import type { WatchAggregate } from "@/lib/tauri";
import { WrappedView } from "@/components/Wrapped/WrappedView";
import { buildSlides } from "@/components/Wrapped/slideDefs";
import { periodPhrase, partOfDay, peakDay } from "@/components/Wrapped/format";
import { outroSummary } from "@/components/Wrapped/slides/OutroSlide";
import { DotNavigation } from "@/components/Wrapped/DotNavigation";
import { LibraryStats } from "@/components/Library/LibraryStats";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";

// ── Mocks ──────────────────────────────────────────────────────────────────

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

vi.mock("html-to-image", () => ({
  toPng: vi.fn(() => Promise.resolve("data:image/png;base64,AAAA")),
}));

/** Motion preferences the tests flip: OS setting and the app's two settings. */
const motionPrefs = vi.hoisted(() => ({ os: false, reducedMotion: false, enableAnimations: true }));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (
    selector: (s: { reducedMotion: boolean; enableAnimations: boolean; accentColor: string }) => unknown,
  ) =>
    selector({
      reducedMotion: motionPrefs.reducedMotion,
      enableAnimations: motionPrefs.enableAnimations,
      accentColor: "#3B82F6",
    }),
}));

vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => motionPrefs.os,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockAvailable: AvailableWrappedPeriods = {
  yearsWithSessions: [2025, 2024],
  thisMonthHasData: true,
  lastMonthHasData: true,
  thisYearHasData: true,
  lastYearHasData: true,
};

const game = (id: string, name: string, playTimeS: number, sessionCount: number, source = "steam") => ({
  id,
  name,
  coverUrl: null,
  heroUrl: null,
  logoUrl: null,
  playTimeS,
  sessionCount,
  source,
});

const mockReport: WrappedReport = {
  periodLabel: "2025",
  totalPlayTimeS: 360000,
  totalSessions: 42,
  totalGamesPlayed: 15,
  totalGamesInLibrary: 120,
  newGamesAdded: 8,
  newTitlesInPeriod: 5,
  mostPlayedGame: game("g1", "Cyberpunk 2077", 180000, 20),
  mostPlayedGenre: "RPG",
  topGames: [
    game("g1", "Cyberpunk 2077", 180000, 20),
    game("g2", "Elden Ring", 90000, 12),
    game("g3", "Hades", 54000, 8, "epic"),
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
  longestSession: { gameId: "g1", gameName: "Cyberpunk 2077", startedAt: "2025-06-15T20:00:00Z", durationS: 28800 },
  longestStreakDays: 7,
  busiestDay: "2025-06-15",
  busiestDayPlayTimeS: 28800,
  firstGamePlayed: game("g3", "Hades", 54000, 8, "epic"),
  lastGamePlayed: game("g1", "Cyberpunk 2077", 180000, 20),
  playTimeByMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, playTimeS: i * 3600 })),
  // Monday 0 … Sunday 6: Saturday (5) is not the peak, Sunday (6) is.
  playTimeByDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ day: i, playTimeS: i * 3600 })),
  playTimeByHourOfDay: Array.from({ length: 24 }, (_, i) => ({ hour: i, playTimeS: i === 21 ? 9000 : i * 60 })),
  funFacts: [{ kind: "marathons", value: 25, label: "That's equivalent to 25 marathons" }],
  comparisonPreviousPeriod: { previousTotalS: 300000, percentChange: 20, label: "Up 20% from last year" },
  moodTagline: "Mostly chill vibes",
  hiddenGem: { gameId: "g3", name: "Hades", playTimeS: 54000, rating: 65, tagline: "You put 15.0h into a 65-rated title" },
  trivia: ["Your top game has a 90% rating"],
};

/** A report with sessions but nothing optional: only intro and outro qualify. */
const bareReport: WrappedReport = {
  ...mockReport,
  mostPlayedGame: null,
  mostPlayedGenre: null,
  topGames: [],
  genreBreakdown: [],
  genreTagline: null,
  platformBreakdown: [],
  longestSession: null,
  longestStreakDays: 0,
  busiestDay: null,
  newGamesAdded: 0,
  newTitlesInPeriod: 0,
  playTimeByDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ day: i, playTimeS: 0 })),
  playTimeByHourOfDay: [],
  funFacts: [],
  comparisonPreviousPeriod: null,
  moodTagline: null,
  hiddenGem: null,
  trivia: [],
  firstGamePlayed: null,
  lastGamePlayed: null,
};

const emptyReport: WrappedReport = { ...mockReport, totalSessions: 0, totalPlayTimeS: 0, totalGamesPlayed: 0 };

const watch: WatchAggregate = {
  totals: { totalSecs: 7200, sessionCount: 3 },
  topChannels: [{ channelLogin: "shroud", channelDisplayName: "shroud", totalSecs: 3600, sessionCount: 2 }],
  topGames: [{ twitchGameId: "1", twitchGameName: "Valorant", nexusGameId: null, totalSecs: 3600, sessionCount: 1 }],
};

const FULL_ORDER = [
  "intro",
  "top-game",
  "top-games",
  "genres",
  "rhythm",
  "milestones",
  "variety",
  "library",
  "extras",
  "outro",
];

function mockBackend({
  report = mockReport,
  twitch = {} as unknown,
}: { report?: WrappedReport | Error; twitch?: unknown } = {}) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_available_wrapped_periods") return Promise.resolve(mockAvailable);
    if (cmd === "get_wrapped_report") return report instanceof Error ? Promise.reject(report) : Promise.resolve(report);
    if (cmd === "get_twitch_watch_for_range") return Promise.resolve(twitch);
    return Promise.resolve({});
  });
}

const currentSlide = () => screen.getByRole("group");
/** The first load can be slow when the whole suite runs in parallel. */
const LOAD = { timeout: 5000 };
const reportCalls = () => vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "get_wrapped_report").length;

async function renderStory(onClose = vi.fn()) {
  const utils = render(<WrappedView onClose={onClose} />);
  await screen.findByTestId("wrapped-slide-intro", {}, LOAD);
  // Let the Twitch lookup and any other mount-time fetch land before driving the story;
  // under a loaded parallel run they could otherwise resolve mid-test.
  await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_twitch_watch_for_range", expect.anything()), LOAD);
  await act(async () => {});
  return { ...utils, onClose };
}

beforeEach(() => {
  motionPrefs.os = false;
  motionPrefs.reducedMotion = false;
  motionPrefs.enableAnimations = true;
  mockBackend();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Slide selection (pure) ─────────────────────────────────────────────────

describe("buildSlides", () => {
  it("includes every slide that has data, in story order", () => {
    expect(buildSlides(mockReport, null).map((s) => s.id)).toEqual(FULL_ORDER);
  });

  it("keeps only intro and outro when the report has nothing optional", () => {
    expect(buildSlides(bareReport, null).map((s) => s.id)).toEqual(["intro", "outro"]);
  });

  it("adds the Twitch slide before the outro only when there is watch time", () => {
    expect(buildSlides(mockReport, watch).map((s) => s.id).slice(-2)).toEqual(["twitch", "outro"]);
    const none = { ...watch, totals: { totalSecs: 0, sessionCount: 0 } };
    expect(buildSlides(mockReport, none).map((s) => s.id)).not.toContain("twitch");
  });

  it("skips the top games list when it would only repeat the #1 game", () => {
    const one = { ...mockReport, topGames: [mockReport.topGames[0]] };
    expect(buildSlides(one, null).map((s) => s.id)).not.toContain("top-games");
  });

  it("titles the intro with the period", () => {
    expect(buildSlides(mockReport, null)[0].title).toBe("Your 2025 in games");
    expect(buildSlides({ ...mockReport, periodLabel: "This month" }, null)[0].title).toBe("Your month in games");
  });
});

describe("story copy helpers", () => {
  it("phrases periods to read after 'Your'", () => {
    expect(periodPhrase("This year")).toBe("year");
    expect(periodPhrase("Last 7 days")).toBe("last 7 days");
    expect(periodPhrase("March 2025")).toBe("March 2025");
    expect(periodPhrase("2025-01-01 – 2025-03-01")).toBe("time");
  });

  it("finds the peak day and the busiest part of the day", () => {
    expect(peakDay(mockReport.playTimeByDayOfWeek)?.name).toBe("Sunday");
    expect(peakDay(bareReport.playTimeByDayOfWeek)).toBeNull();
    expect(partOfDay(mockReport.playTimeByHourOfDay)).toEqual({ part: "evening", peakHour: 21 });
    expect(partOfDay([])).toBeNull();
  });

  it("summarises the period in one line", () => {
    expect(outroSummary(mockReport)).toBe("100 hours, 15 games and a 7-day streak. Your 2025, well played.");
  });
});

// ── WrappedView: states ────────────────────────────────────────────────────

describe("WrappedView states", () => {
  it("shows a static skeleton while loading, with the period pill available", async () => {
    render(<WrappedView onClose={vi.fn()} />);
    expect(screen.getByTestId("wrapped-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("period-selector")).toBeInTheDocument();
    expect(screen.getByTestId("wrapped-skeleton").querySelector(".animate-pulse")).toBeNull();
    await screen.findByTestId("wrapped-slide-intro", {}, LOAD);
  });

  it("shows the empty state when the period has no sessions", async () => {
    mockBackend({ report: emptyReport });
    render(<WrappedView onClose={vi.fn()} />);
    expect(await screen.findByTestId("wrapped-empty", {}, LOAD)).toHaveTextContent("No play data for 2025");
    expect(screen.getByTestId("period-selector")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("shows the error state and retries", async () => {
    mockBackend({ report: new Error("database locked") });
    render(<WrappedView onClose={vi.fn()} />);
    expect(await screen.findByTestId("wrapped-error", {}, LOAD)).toHaveTextContent("database locked");
    expect(screen.getByTestId("period-selector")).toBeInTheDocument();
    const before = reportCalls();
    mockBackend();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("wrapped-slide-intro", {}, LOAD)).toBeInTheDocument();
    expect(reportCalls()).toBeGreaterThan(before);
  });
});

// ── WrappedView: story structure ───────────────────────────────────────────

describe("WrappedView story", () => {
  it("mounts one slide at a time, labelled for assistive tech", async () => {
    await renderStory();
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(currentSlide()).toHaveAttribute("aria-roledescription", "slide");
    expect(currentSlide()).toHaveAccessibleName("1 of 10: Your 2025 in games");
    const stage = screen.getByRole("region", { name: "Your 2025 in games" });
    expect(stage).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getByTestId("wrapped-live")).toHaveTextContent("Your 2025 in games, slide 1 of 10");
  });

  it("has one progress segment per visible slide", async () => {
    await renderStory();
    expect(within(screen.getByTestId("wrapped-progress")).getAllByRole("button")).toHaveLength(FULL_ORDER.length);
  });

  it("filters slides by data", async () => {
    mockBackend({ report: bareReport });
    await renderStory();
    expect(within(screen.getByTestId("wrapped-progress")).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-slide-outro")).toBeInTheDocument();
  });

  it("adds the Twitch slide when there is watch time", async () => {
    mockBackend({ twitch: watch });
    await renderStory();
    await waitFor(() => expect(within(screen.getByTestId("wrapped-progress")).getAllByRole("button")).toHaveLength(11), LOAD);
    fireEvent.keyDown(window, { key: "End" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("wrapped-slide-twitch")).toHaveTextContent("Channels you watched most");
    expect(screen.getByTestId("wrapped-twitch-hours")).toHaveTextContent(/2[.,]0/);
  });

  it("renders every slide's content as you step through", async () => {
    await renderStory();
    const seen: string[] = [];
    for (let i = 0; i < FULL_ORDER.length; i++) {
      seen.push(currentSlide().getAttribute("data-testid")!.replace("wrapped-slide-", ""));
      fireEvent.click(screen.getByTestId("wrapped-next"));
    }
    expect(seen).toEqual(FULL_ORDER);
    // Spot-check content on the way back.
    fireEvent.keyDown(window, { key: "Home" });
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-top-game-name")).toHaveTextContent("Cyberpunk 2077");
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-top-games").querySelectorAll("li")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-genre-headline")).toHaveTextContent("You were all about RPG");
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-peak-day")).toHaveTextContent("Sundays were yours");
    expect(screen.getByTestId("wrapped-time-of-day")).toHaveTextContent("Mostly an evening player");
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-streak")).toHaveTextContent("7");
    expect(screen.getByTestId("wrapped-longest-session")).toHaveTextContent("8h 0m on Cyberpunk 2077");
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-variety-headline")).toHaveTextContent("2 launchers, one library");
    expect(screen.getByTestId("wrapped-new-titles")).toHaveTextContent("5");
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(screen.getByTestId("wrapped-games-added")).toHaveTextContent("8");
    fireEvent.click(screen.getByTestId("wrapped-next"));
    const extras = screen.getByTestId("wrapped-extras");
    expect(extras).toHaveTextContent("Mostly chill vibes");
    expect(extras).toHaveTextContent("Hades");
    expect(extras).toHaveTextContent("25 marathons");
    expect(extras).toHaveTextContent("90% rating");
  });

  it("uses Lucide icons, not emoji, for the empty and error states", async () => {
    mockBackend({ report: emptyReport });
    render(<WrappedView onClose={vi.fn()} />);
    const empty = await screen.findByTestId("wrapped-empty", {}, LOAD);
    expect(empty.querySelector("svg")).not.toBeNull();
    expect(empty.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

// ── WrappedView: navigation ────────────────────────────────────────────────

describe("WrappedView navigation", () => {
  it("moves with the Previous and Next buttons", async () => {
    await renderStory();
    fireEvent.click(screen.getByTestId("wrapped-next"));
    expect(currentSlide()).toHaveAccessibleName("2 of 10: Your #1 game");
    expect(screen.getByTestId("wrapped-live")).toHaveTextContent("Your #1 game, slide 2 of 10");
    fireEvent.click(screen.getByTestId("wrapped-prev"));
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
    // Previous does nothing on the first slide.
    expect(screen.getByTestId("wrapped-prev")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByTestId("wrapped-prev"));
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
  });

  it("moves with the arrow keys, Space, Home and End", async () => {
    await renderStory();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("wrapped-slide-top-games")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "End" });
    expect(screen.getByTestId("wrapped-slide-outro")).toBeInTheDocument();
    expect(screen.getByTestId("wrapped-next")).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(window, { key: "Home" });
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
  });

  it("leaves Space to a focused button", async () => {
    await renderStory();
    const share = screen.getByTestId("wrapped-save-image");
    share.focus();
    fireEvent.keyDown(share, { key: " " });
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
  });

  it("clicking the left third goes back, the rest goes forward", async () => {
    await renderStory();
    const stage = screen.getByTestId("wrapped-stage");
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(screen.getByTestId("wrapped-intro-headline"), { clientX: 700 });
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    fireEvent.click(stage, { clientX: 400 });
    expect(screen.getByTestId("wrapped-slide-top-games")).toBeInTheDocument();
    fireEvent.click(stage, { clientX: 100 });
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
  });

  it("buttons inside a slide keep their own clicks", async () => {
    useGameStore.setState({
      games: [{ id: "g1", name: "Cyberpunk 2077", status: "playing", coverUrl: null, heroUrl: null } as unknown as Game],
    });
    await renderStory();
    fireEvent.click(screen.getByTestId("wrapped-next"));
    fireEvent.click(screen.getByRole("button", { name: /View game/ }));
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    act(() => {
      useGameStore.setState({ games: [] });
      useUiStore.getState().setDetailOverlayGameId(null);
    });
  });

  it("Escape and the close button call onClose", async () => {
    const { onClose } = await renderStory();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("wrapped-close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Escape closes even before the report loads", async () => {
    const onClose = vi.fn();
    render(<WrappedView onClose={onClose} />);
    expect(screen.getByTestId("wrapped-skeleton")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    await screen.findByTestId("wrapped-slide-intro", {}, LOAD);
  });

  it("changing the period refetches and starts again from slide 1", async () => {
    await renderStory();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("wrapped-slide-top-games")).toBeInTheDocument();
    const before = reportCalls();
    fireEvent.click(screen.getByTestId("period-selector-trigger"));
    fireEvent.click(await screen.findByTestId("period-year-2024", {}, LOAD));
    await waitFor(() => expect(reportCalls()).toBeGreaterThan(before), LOAD);
    expect(await screen.findByTestId("wrapped-slide-intro", {}, LOAD)).toBeInTheDocument();
  });
});

// ── WrappedView: autoplay ──────────────────────────────────────────────────

describe("WrappedView autoplay", () => {
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it("is off by default", async () => {
    await renderStory();
    vi.useFakeTimers();
    advance(30_000);
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
    expect(screen.getByTestId("wrapped-autoplay")).toHaveAccessibleName("Play autoplay");
  });

  it("advances every 7 seconds while playing", async () => {
    await renderStory();
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    expect(screen.getByTestId("wrapped-autoplay")).toHaveAccessibleName("Pause autoplay");
    expect(screen.getByTestId("wrapped-progress-live")).toBeInTheDocument();
    advance(6_999);
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
    advance(1);
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    advance(7_000);
    expect(screen.getByTestId("wrapped-slide-top-games")).toBeInTheDocument();
  });

  it("keeps playing with the pointer over the stage and focus on the Play button", async () => {
    await renderStory();
    vi.useFakeTimers();
    const stage = screen.getByTestId("wrapped-stage");
    const play = screen.getByTestId("wrapped-autoplay");
    fireEvent.mouseEnter(stage);
    fireEvent.pointerEnter(stage);
    play.focus();
    fireEvent.click(play);
    expect(document.activeElement).toBe(play);
    advance(7_000);
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    advance(7_000);
    expect(screen.getByTestId("wrapped-slide-top-games")).toBeInTheDocument();
  });

  it("press-and-hold on the stage pauses; release resumes with the time that was left", async () => {
    await renderStory();
    vi.useFakeTimers();
    const stage = screen.getByTestId("wrapped-stage");
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    advance(3_000);
    fireEvent.pointerDown(stage);
    advance(20_000);
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
    fireEvent.pointerUp(stage);
    // The click that follows a hold's release must not navigate.
    fireEvent.click(stage);
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
    advance(3_999);
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
    advance(1);
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
  });

  it("a hold that drags off the stage also resumes", async () => {
    await renderStory();
    vi.useFakeTimers();
    const stage = screen.getByTestId("wrapped-stage");
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    fireEvent.pointerDown(stage);
    advance(10_000);
    fireEvent.pointerLeave(stage);
    advance(7_000);
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
  });

  it("a quick tap still navigates", async () => {
    await renderStory();
    vi.useFakeTimers();
    const stage = screen.getByTestId("wrapped-stage");
    fireEvent.pointerDown(stage);
    advance(100);
    fireEvent.pointerUp(stage);
    fireEvent.click(stage);
    expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
  });

  it("pauses while the window is hidden", async () => {
    await renderStory();
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };
    try {
      setVisibility("hidden");
      advance(20_000);
      expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
      setVisibility("visible");
      advance(7_000);
      expect(screen.getByTestId("wrapped-slide-top-game")).toBeInTheDocument();
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    }
  });

  it("Pause stops it", async () => {
    await renderStory();
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    advance(3_000);
    fireEvent.click(screen.getByRole("button", { name: "Pause autoplay" }));
    advance(30_000);
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
  });

  it("stops on reaching the last slide", async () => {
    await renderStory();
    fireEvent.keyDown(window, { key: "End" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    advance(7_000);
    expect(screen.getByTestId("wrapped-slide-outro")).toBeInTheDocument();
    expect(screen.getByTestId("wrapped-autoplay")).toHaveAccessibleName("Play autoplay");
  });
});

// ── WrappedView: motion preferences ────────────────────────────────────────

describe("WrappedView reduced motion", () => {
  const visibleHours = () => screen.getByTestId("wrapped-intro-hours").querySelector("[data-countup]")!.textContent;

  it("counts numbers up from zero when motion is on, with the final value for screen readers", async () => {
    await renderStory();
    expect(visibleHours()).toBe("0");
    expect(within(screen.getByTestId("wrapped-intro-hours")).getByText("100", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("shows final numbers immediately with the app's reduced motion setting", async () => {
    motionPrefs.reducedMotion = true;
    await renderStory();
    expect(visibleHours()).toBe("100");
  });

  it("shows final numbers immediately when animations are turned off", async () => {
    motionPrefs.enableAnimations = false;
    await renderStory();
    expect(visibleHours()).toBe("100");
  });

  it("shows final numbers immediately with the OS reduced motion setting", async () => {
    motionPrefs.os = true;
    await renderStory();
    expect(visibleHours()).toBe("100");
  });

  it("shows the progress segment filled rather than animating", async () => {
    motionPrefs.reducedMotion = true;
    await renderStory();
    fireEvent.click(screen.getByTestId("wrapped-autoplay"));
    expect(screen.queryByTestId("wrapped-progress-live")).not.toBeInTheDocument();
    const segments = within(screen.getByTestId("wrapped-progress")).getAllByRole("button");
    expect(segments[0]).toHaveAttribute("data-state", "current");
    expect(segments[0].querySelector(".bg-white")).not.toBeNull();
  });
});

// ── WrappedView: sharing ───────────────────────────────────────────────────

describe("WrappedView sharing", () => {
  it("opens the share dialog from the top bar; Escape closes it, not the view", async () => {
    const { onClose } = await renderStory();
    fireEvent.click(screen.getByRole("button", { name: "Share your Wrapped" }));
    expect(screen.getByTestId("wrapped-share-modal")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("wrapped-share-modal")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not navigate with arrow keys while the share dialog is open", async () => {
    await renderStory();
    fireEvent.click(screen.getByTestId("wrapped-save-image"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
  });

  it("opens the share dialog from the outro, which can also replay the story", async () => {
    await renderStory();
    fireEvent.keyDown(window, { key: "End" });
    expect(screen.getByTestId("wrapped-outro-summary")).toHaveTextContent("Your 2025, well played.");
    fireEvent.click(screen.getByTestId("wrapped-outro-share"));
    expect(screen.getByTestId("wrapped-share-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("share-modal-close"));
    fireEvent.click(screen.getByRole("button", { name: /Watch again/ }));
    expect(screen.getByTestId("wrapped-slide-intro")).toBeInTheDocument();
  });
});

// ── DotNavigation (still used by the retirement ceremony) ─────────────────

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
