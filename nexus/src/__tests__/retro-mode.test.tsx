import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RetroLibrary } from "@/retro/RetroLibrary";
import { RetroApp } from "@/retro/RetroApp";
import { RetroDetail } from "@/retro/RetroDetail";
import { RetroToasts } from "@/retro/RetroToasts";
import { RetroSessionNote } from "@/retro/RetroSessionNote";
import { AppearanceSettings } from "@/components/Settings/AppearanceSettings";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import { useSessionNoteStore } from "@/stores/sessionNoteStore";
import { fmtStars, fmtDate, fmtClock, fmtDur, fmtBar } from "@/retro/format";
import { RetroStats } from "@/retro/RetroStats";
import { hexToHsl, retroPalette } from "@/retro/palette";

vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return {
    ...actual,
    updateSessionNote: vi.fn(() => Promise.resolve()),
    getSessionDistribution: vi.fn(() =>
      Promise.resolve({
        buckets: [
          { label: "15-30M", minS: 900, maxS: 1800, count: 3, totalPlayTimeS: 4500 },
          { label: "30-60M", minS: 1800, maxS: 3600, count: 1, totalPlayTimeS: 2000 },
        ],
        totalSessions: 4,
        meanDurationS: 1625,
        medianDurationS: 1500,
        p75DurationS: 1700,
        p95DurationS: 1900,
        shortestSessionS: 900,
        longestSessionS: 2000,
      }),
    ),
    getPerGameSessionStats: vi.fn(() =>
      Promise.resolve({
        sessions: [
          {
            id: "s1",
            startedAt: "2026-08-01T10:00:00Z",
            endedAt: "2026-08-01T11:30:00Z",
            durationS: 5400,
            trackingMethod: "process",
            note: "good run",
          },
        ],
        distribution: { buckets: [] },
        playTimeByMonth: [],
        playTimeByDayOfWeek: [],
        averageGapDays: 0,
      }),
    ),
  };
});

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    name: "Doom",
    source: "steam",
    folderPath: null,
    exePath: null,
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
    status: "unset",
    rating: null,
    totalPlayTimeS: 0,
    lastPlayedAt: null,
    playCount: 0,
    addedAt: "2026-01-01T00:00:00Z",
    isHidden: false,
    hltbMainH: null,
    hltbMainExtraH: null,
    hltbCompletionistH: null,
    hltbId: null,
    hltbFetchedAt: null,
    notes: null,
    progress: null,
    milestonesJson: null,
    completed: false,
    ...overrides,
  };
}

const noop = () => {};

/** RetroApp shows the BIOS boot screen first; any key skips it. */
function skipBoot() {
  fireEvent.keyDown(document, { key: "F13" });
}

describe("retro format helpers", () => {
  it("formats stars, dates, clocks, durations", () => {
    expect(fmtStars(3)).toBe("***..");
    expect(fmtStars(null)).toBe(".....");
    expect(fmtDate(null)).toBe("--/--/--");
    expect(fmtDate("2026-08-03T10:00:00Z")).toMatch(/^\d{2}\/\d{2}\/26$/);
    expect(fmtClock(3661)).toBe("01:01:01");
    expect(fmtDur(59 * 60)).toBe("59M");
    expect(fmtDur(3600 + 5 * 60)).toBe("1H 05M");
  });

  it("renders ASCII bars", () => {
    expect(fmtBar(5, 10, 10)).toBe("#####.....");
    expect(fmtBar(0, 10, 4)).toBe("....");
    expect(fmtBar(10, 10, 6)).toBe("######");
    expect(fmtBar(1, 1000, 10)).toBe("#.........");
  });
});

describe("retro palette", () => {
  it("converts hex to hsl", () => {
    expect(hexToHsl("#0000AA")).toEqual({ h: 240, s: 100, l: 33 });
    expect(hexToHsl("#808080")).toEqual({ h: 0, s: 0, l: 50 });
    expect(hexToHsl("not-a-color")).toBeNull();
  });

  it("derives a single-hue DOS scheme from the accent", () => {
    expect(retroPalette("#00AA00")).toEqual({
      screen: "hsl(120, 100%, 30%)",
      bar: "hsl(120, 100%, 38%)",
      bright: "hsl(120, 100%, 72%)",
    });
    expect(retroPalette("garbage")).toBeNull();
  });
});

describe("RetroLibrary", () => {
  beforeEach(() => {
    useGameStore.setState({
      games: [
        makeGame({ id: "a", name: "Alpha" }),
        makeGame({ id: "b", name: "Beta" }),
        makeGame({ id: "c", name: "Gamma" }),
        makeGame({ id: "hidden", name: "Hidden", isHidden: true }),
        makeGame({ id: "gone", name: "Gone", status: "removed" }),
      ],
      activeSession: null,
      showProcessPicker: false,
    });
    useSettingsStore.setState({ hiddenGameIds: [] });
  });

  it("lists visible games sorted by name, hides hidden/archived", () => {
    render(<RetroLibrary enabled onOpenDetail={noop} onLaunch={noop} />);
    expect(screen.getByTestId("retro-title-count")).toHaveTextContent("3");
    expect(screen.getByTestId("retro-library-row-0")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("retro-library-row-2")).toHaveTextContent("Gamma");
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("Gone")).not.toBeInTheDocument();
  });

  it("arrow keys move selection, Enter opens detail, F8 launches", () => {
    const onOpenDetail = vi.fn();
    const onLaunch = vi.fn();
    render(<RetroLibrary enabled onOpenDetail={onOpenDetail} onLaunch={onLaunch} />);
    const input = screen.getByTestId("retro-search");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByTestId("retro-library-row-1")).toHaveClass("retro-row-selected");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ name: "Beta" }));

    fireEvent.keyDown(input, { key: "F8" });
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ name: "Beta" }));
  });

  it("F4 opens collection picker; Enter applies the filter", async () => {
    const { useCollectionStore } = await import("@/stores/collectionStore");
    useCollectionStore.setState({
      collections: [
        { id: "c1", name: "Shooters", icon: "", color: null, sortOrder: 0, isSmart: false, rulesJson: null, gameIds: ["b"] },
      ],
    });
    render(<RetroLibrary enabled onOpenDetail={noop} onLaunch={noop} />);
    const input = screen.getByTestId("retro-search");

    fireEvent.keyDown(input, { key: "F4" });
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("FILTER BY COLLECTION");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByTestId("retro-modal")).not.toBeInTheDocument();
    expect(screen.getByTestId("retro-coll-filter")).toHaveTextContent("Shooters");
    expect(screen.getByTestId("retro-title-count")).toHaveTextContent("1");
    expect(screen.getByTestId("retro-library-row-0")).toHaveTextContent("Beta");
    useCollectionStore.setState({ collections: [] });
  });

  it("typing filters the list", async () => {
    const user = userEvent.setup();
    render(<RetroLibrary enabled onOpenDetail={noop} onLaunch={noop} />);
    await user.type(screen.getByTestId("retro-search"), "gam");
    expect(screen.getByTestId("retro-title-count")).toHaveTextContent("1");
    expect(screen.getByTestId("retro-library-row-0")).toHaveTextContent("Gamma");
  });
});

describe("RetroApp shell", () => {
  beforeEach(() => {
    useGameStore.setState({
      games: [makeGame({ id: "a", name: "Alpha" })],
      activeSession: null,
      showProcessPicker: false,
    });
    useSettingsStore.setState({ hiddenGameIds: [] });
  });

  it("renders header, status line, and F-key bar; F9 opens setup", () => {
    render(
      <RetroApp
        onExit={noop}
        onLaunch={noop}
        onStop={noop}
        onResync={noop}
        isSyncing={false}
        onSetStatus={noop}
        onSetRating={noop}
        onProcessSelected={noop}
        onCancelProcessPicker={noop}
      />,
    );
    expect(screen.getByTestId("retro-boot")).toBeInTheDocument();
    skipBoot();
    expect(screen.queryByTestId("retro-boot")).not.toBeInTheDocument();

    expect(screen.getByTestId("retro-app")).toBeInTheDocument();
    expect(screen.getByTestId("retro-status-left")).toHaveTextContent("1 TITLES ON FILE");
    expect(screen.getByTestId("retro-status-right")).toHaveTextContent("NO GAME RUNNING");

    fireEvent.keyDown(document, { key: "F9" });
    expect(screen.getByTestId("retro-settings")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("retro-library-list")).toBeInTheDocument();
  });

  it("applies the retro theme preset palette, independent of the app accent", () => {
    useSettingsStore.setState({ retroTheme: "green", accentColor: "#7600da" });
    const { container, unmount } = render(
      <RetroApp
        onExit={noop} onLaunch={noop} onStop={noop} onResync={noop} isSyncing={false}
        onSetStatus={noop} onSetRating={noop} onProcessSelected={noop} onCancelProcessPicker={noop}
      />,
    );
    const root = container.querySelector<HTMLElement>(".retro-root")!;
    expect(root.style.getPropertyValue("--vga-blue")).toBe("hsl(120, 100%, 30%)");
    unmount();

    useSettingsStore.setState({ retroTheme: "classic" });
    const { container: c2 } = render(
      <RetroApp
        onExit={noop} onLaunch={noop} onStop={noop} onResync={noop} isSyncing={false}
        onSetStatus={noop} onSetRating={noop} onProcessSelected={noop} onCancelProcessPicker={noop}
      />,
    );
    expect(c2.querySelector<HTMLElement>(".retro-root")!.style.getPropertyValue("--vga-blue")).toBe("");
  });

  it("F2 opens the theme picker; arrows live-preview; Enter persists", () => {
    useSettingsStore.setState({ retroTheme: "classic" });
    const { container } = render(
      <RetroApp
        onExit={noop} onLaunch={noop} onStop={noop} onResync={noop} isSyncing={false}
        onSetStatus={noop} onSetRating={noop} onProcessSelected={noop} onCancelProcessPicker={noop}
      />,
    );
    skipBoot();
    fireEvent.keyDown(document, { key: "F2" });
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("SELECT THEME");

    const root = container.querySelector<HTMLElement>(".retro-root")!;
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(root.style.getPropertyValue("--vga-blue")).toBe("hsl(120, 100%, 30%)");

    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.queryByTestId("retro-modal")).not.toBeInTheDocument();
    expect(useSettingsStore.getState().retroTheme).toBe("green");

    fireEvent.keyDown(document, { key: "F2" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useSettingsStore.getState().retroTheme).toBe("green");
    useSettingsStore.setState({ retroTheme: "classic" });
  });

  it("failed launch shows Abort/Retry/Fail prompt; R retries, A closes", async () => {
    const onLaunch = vi.fn(() =>
      Promise.resolve({ sessionId: "s", gameId: "a", status: "failed" as const, error: "exe missing" }),
    );
    render(
      <RetroApp
        onExit={noop} onLaunch={onLaunch} onStop={noop} onResync={noop} isSyncing={false}
        onSetStatus={noop} onSetRating={noop} onProcessSelected={noop} onCancelProcessPicker={noop}
      />,
    );
    skipBoot();
    fireEvent.keyDown(screen.getByTestId("retro-search"), { key: "F8" });
    await waitFor(() => expect(screen.getByTestId("retro-launch-error")).toHaveTextContent("CANNOT RUN: Alpha"));

    fireEvent.keyDown(document, { key: "r" });
    await waitFor(() => expect(onLaunch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("retro-launch-error")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "a" });
    expect(screen.queryByTestId("retro-launch-error")).not.toBeInTheDocument();
  });

  it("applies the CRT effect class when enabled", () => {
    useSettingsStore.setState({ retroCrt: true });
    const { container } = render(
      <RetroApp
        onExit={noop} onLaunch={noop} onStop={noop} onResync={noop} isSyncing={false}
        onSetStatus={noop} onSetRating={noop} onProcessSelected={noop} onCancelProcessPicker={noop}
      />,
    );
    expect(container.querySelector(".retro-root")).toHaveClass("retro-crt");
    useSettingsStore.setState({ retroCrt: false });
  });

  it("F1 opens the help popup; Esc closes it", () => {
    render(
      <RetroApp
        onExit={noop} onLaunch={noop} onStop={noop} onResync={noop} isSyncing={false}
        onSetStatus={noop} onSetRating={noop} onProcessSelected={noop} onCancelProcessPicker={noop}
      />,
    );
    skipBoot();
    fireEvent.keyDown(document, { key: "F1" });
    expect(screen.getByTestId("retro-help")).toHaveTextContent("FILTER BY COLLECTION");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("retro-help")).not.toBeInTheDocument();
  });

  it("shows running game with elapsed time in the status line", () => {
    useGameStore.setState({
      activeSession: {
        sessionId: "s1",
        gameId: "a",
        gameName: "Alpha",
        coverUrl: null,
        heroUrl: null,
        startedAt: new Date(Date.now() - 61_000).toISOString(),
        dominantColor: "#000",
        pid: 123,
        exeName: "alpha.exe",
        folderPath: null,
        potentialExeNames: null,
        processDetected: true,
        hasDbSession: true,
      },
    });
    render(
      <RetroApp
        onExit={noop}
        onLaunch={noop}
        onStop={noop}
        onResync={noop}
        isSyncing={false}
        onSetStatus={noop}
        onSetRating={noop}
        onProcessSelected={noop}
        onCancelProcessPicker={noop}
      />,
    );
    expect(screen.getByTestId("retro-status-right")).toHaveTextContent(/RUN: Alpha 00:01:0\d/);
  });
});

describe("RetroDetail", () => {
  const detailProps = {
    gameId: "a",
    enabled: true,
    onBack: noop,
    onLaunch: noop,
    onStop: noop,
  };

  beforeEach(() => {
    useGameStore.setState({
      games: [
        makeGame({
          id: "a",
          name: "Alpha",
          status: "backlog",
          rating: 2,
          description: "A game about shooting demons.",
        }),
      ],
      activeSession: null,
      showProcessPicker: false,
    });
  });

  it("Tab cycles section focus", () => {
    render(<RetroDetail {...detailProps} onSetStatus={noop} onSetRating={noop} />);
    expect(screen.getByTestId("retro-detail-info")).toHaveClass("retro-panel-focused");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByTestId("retro-detail-meta")).toHaveClass("retro-panel-focused");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByTestId("retro-detail-desc")).toHaveClass("retro-panel-focused");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByTestId("retro-detail-sessions")).toHaveClass("retro-panel-focused");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByTestId("retro-detail-desc")).toHaveClass("retro-panel-focused");
  });

  it("F7 opens status modal; letter hotkey sets status", () => {
    const onSetStatus = vi.fn();
    render(<RetroDetail {...detailProps} onSetStatus={onSetStatus} onSetRating={noop} />);
    fireEvent.keyDown(document, { key: "F7" });
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("SET STATUS");
    fireEvent.keyDown(document, { key: "d" });
    expect(onSetStatus).toHaveBeenCalledWith("a", "completed");
    expect(screen.queryByTestId("retro-modal")).not.toBeInTheDocument();
  });

  it("Enter on RATING row opens rating modal; digit sets rating", () => {
    const onSetRating = vi.fn();
    render(<RetroDetail {...detailProps} onSetStatus={noop} onSetRating={onSetRating} />);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("RATE TITLE");
    fireEvent.keyDown(document, { key: "4" });
    expect(onSetRating).toHaveBeenCalledWith("a", 4);
    expect(screen.queryByTestId("retro-modal")).not.toBeInTheDocument();
  });

  it("Enter on a session row opens the session pseudo-modal", async () => {
    render(<RetroDetail {...detailProps} onSetStatus={noop} onSetRating={noop} />);
    await screen.findByTestId("retro-session-row-0");
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("SESSION DETAIL");
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("good run");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("retro-modal")).not.toBeInTheDocument();
  });

  it("Esc goes back only when no modal is open", () => {
    const onBack = vi.fn();
    render(<RetroDetail {...detailProps} onBack={onBack} onSetStatus={noop} onSetRating={noop} />);
    fireEvent.keyDown(document, { key: "F7" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("RetroStats", () => {
  it("shows totals, top-10 bars, and the session histogram; Esc goes back", async () => {
    useGameStore.setState({
      games: [
        makeGame({ id: "a", name: "Alpha", totalPlayTimeS: 7200, playCount: 3, status: "completed" }),
        makeGame({ id: "b", name: "Beta", totalPlayTimeS: 3600, playCount: 1, status: "playing" }),
        makeGame({ id: "gone", name: "Gone", status: "removed", totalPlayTimeS: 99999 }),
      ],
      activeSession: null,
    });
    const onBack = vi.fn();
    render(<RetroStats enabled onBack={onBack} />);

    const totals = screen.getByTestId("retro-stats-totals");
    expect(totals).toHaveTextContent("TITLES");
    expect(totals).toHaveTextContent("2");
    expect(totals).toHaveTextContent("3.0");

    expect(screen.getByTestId("retro-stats-top-0")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("retro-stats-top-0")).toHaveTextContent("#");

    await waitFor(() =>
      expect(screen.getByTestId("retro-stats-histogram")).toHaveTextContent("15-30M"),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onBack).toHaveBeenCalled();
  });
});

describe("RetroToasts", () => {
  beforeEach(() => {
    useToastStore.getState().clearToasts();
  });

  it("renders tagged toasts; click dismisses; action fires", () => {
    const action = vi.fn();
    render(<RetroToasts />);
    act(() => {
      useToastStore.getState().addToast({ type: "error", message: "launch failed", duration: 0 });
      useToastStore.getState().addToast({
        type: "warning",
        message: "3 games missing",
        duration: 0,
        action: { label: "Review", onClick: action },
      });
    });

    expect(screen.getByTestId("retro-toast-error")).toHaveTextContent("[ERR] launch failed");
    fireEvent.click(screen.getByTestId("retro-toast-action"));
    expect(action).toHaveBeenCalled();
    expect(screen.queryByTestId("retro-toast-warning")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("retro-toast-error"));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe("RetroSessionNote", () => {
  it("prompts on queued session; Enter saves note and dequeues", async () => {
    useSettingsStore.setState({ sessionNotePromptEnabled: true, sessionNotePromptTimeout: 0 });
    render(<RetroSessionNote />);
    act(() => {
      useSessionNoteStore.getState().enqueue({ sessionId: "s9", gameName: "Alpha", durationS: 3600 });
    });

    expect(screen.getByTestId("retro-session-note")).toHaveTextContent("Alpha");
    const input = screen.getByTestId("retro-session-note-input");
    fireEvent.change(input, { target: { value: "beat the boss" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const { updateSessionNote } = await import("@/lib/tauri");
    await waitFor(() => expect(updateSessionNote).toHaveBeenCalledWith("s9", "beat the boss"));
    expect(useSessionNoteStore.getState().queue).toHaveLength(0);
  });

  it("Esc skips without saving", () => {
    useSettingsStore.setState({ sessionNotePromptEnabled: true, sessionNotePromptTimeout: 0 });
    render(<RetroSessionNote />);
    act(() => {
      useSessionNoteStore.getState().enqueue({ sessionId: "s10", gameName: "Beta", durationS: 60 });
    });
    fireEvent.keyDown(screen.getByTestId("retro-session-note-input"), { key: "Escape" });
    expect(useSessionNoteStore.getState().queue).toHaveLength(0);
  });
});

describe("RetroUpdatePrompt", () => {
  it("shows when update available; Enter installs; Esc dismisses", async () => {
    const { RetroUpdatePrompt } = await import("@/retro/RetroUpdatePrompt");
    const { useUpdateStore } = await import("@/stores/updateStore");
    const downloadAndInstall = vi.fn();
    useUpdateStore.setState({
      updateAvailable: true,
      popupDismissed: false,
      latestVersion: "0.5.0",
      phase: "available",
      downloadAndInstall,
    });
    render(<RetroUpdatePrompt />);
    expect(screen.getByTestId("retro-update-prompt")).toHaveTextContent("0.5.0");

    fireEvent.keyDown(document, { key: "Enter" });
    expect(downloadAndInstall).toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(useUpdateStore.getState().popupDismissed).toBe(true);
    expect(screen.queryByTestId("retro-update-prompt")).not.toBeInTheDocument();
    useUpdateStore.setState({ updateAvailable: false, latestVersion: null, phase: "idle", popupDismissed: false });
  });

  it("shows download progress and ready state", async () => {
    const { RetroUpdatePrompt } = await import("@/retro/RetroUpdatePrompt");
    const { useUpdateStore } = await import("@/stores/updateStore");
    useUpdateStore.setState({
      updateAvailable: true,
      popupDismissed: false,
      latestVersion: "0.5.0",
      phase: "downloading",
      downloadedBytes: 5 * 1024 * 1024,
      totalBytes: 10 * 1024 * 1024,
    });
    const { rerender } = render(<RetroUpdatePrompt />);
    expect(screen.getByTestId("retro-update-progress")).toHaveTextContent("5.0/10.0 MB");

    act(() => {
      useUpdateStore.setState({ phase: "ready" });
    });
    rerender(<RetroUpdatePrompt />);
    expect(screen.getByTestId("retro-modal")).toHaveTextContent("RESTART TO APPLY");
    useUpdateStore.setState({ updateAvailable: false, latestVersion: null, phase: "idle" });
  });
});

describe("retro mode setting", () => {
  it("persists the active view so launch restores it", () => {
    useSettingsStore.getState().setRetroMode(true);
    const persisted = JSON.parse(localStorage.getItem("nexus-settings") ?? "{}");
    expect(persisted.state.retroMode).toBe(true);
    useSettingsStore.getState().setRetroMode(false);
    const persisted2 = JSON.parse(localStorage.getItem("nexus-settings") ?? "{}");
    expect(persisted2.state.retroMode).toBe(false);
  });

  it("titlebar button toggles retro mode", async () => {
    const { Titlebar } = await import("@/components/shared/Titlebar");
    useSettingsStore.setState({ retroMode: false });
    render(<Titlebar />);
    const btn = screen.getByTestId("titlebar-retro");
    expect(btn).toHaveTextContent("Retro");
    fireEvent.click(btn);
    expect(useSettingsStore.getState().retroMode).toBe(true);
    expect(btn).toHaveTextContent("Modern");
    useSettingsStore.setState({ retroMode: false });
  });

  it("AppearanceSettings toggle flips retroMode in the store", () => {
    useSettingsStore.setState({ retroMode: false });
    render(<AppearanceSettings />);
    const checkbox = screen.getByTestId("pref-retro-mode");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(useSettingsStore.getState().retroMode).toBe(true);
    useSettingsStore.getState().setRetroMode(false);
  });
});
