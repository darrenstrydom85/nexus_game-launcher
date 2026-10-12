import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// The real builders need a full Wrapped report; the format choice is what matters here.
vi.mock("@/lib/statsExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/statsExport")>();
  return {
    ...actual,
    buildStatsJson: vi.fn(() => '{"stats":true}'),
    buildStatsHtml: vi.fn(() => "<html></html>"),
    collectAssets: vi.fn(() => ({ assets: [], relPathFor: () => "", mostPlayedHero: null, mostPlayedLogo: null })),
  };
});

import { DataSection } from "@/modern/settings/sections/DataSection";
import { ExportSection } from "@/modern/settings/sections/ExportSection";
import { DeveloperSection } from "@/modern/settings/sections/DeveloperSection";
import { importLibraryFile } from "@/modern/settings/hooks/useDataManagement";
import { DataManagement } from "@/components/Settings/DataManagement";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import type { DeadGame } from "@/lib/tauri";

const responses: Record<string, unknown> = {};

function game(id: string, name: string): Game {
  return { id, name, coverUrl: null, customCover: null, totalPlayTimeS: 0, completed: false, isHidden: false } as Game;
}

const deadGame: DeadGame = {
  id: "d1",
  name: "Lost Game",
  source: "steam",
  exePath: "C:/Games/Lost/lost.exe",
  folderPath: "C:/Games/Lost",
  lastPlayed: null,
  totalPlayTimeS: 0,
};

async function renderData() {
  render(<DataSection />, { wrapper: TooltipProvider });
  await act(async () => {});
}

function invoked(cmd: string) {
  return mockInvoke.mock.calls.filter(([c]) => c === cmd);
}

const reload = vi.fn();
const originalLocation = window.location;

describe("v1 Data & health settings", () => {
  beforeEach(() => {
    for (const k of Object.keys(responses)) delete responses[k];
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      const r = responses[cmd];
      return Promise.resolve(typeof r === "function" ? r(args) : cmd in responses ? r : null);
    });
    // confirm_games returns the saved games in input order, as new rows.
    responses.confirm_games = ({ detectedGames }: { detectedGames: Record<string, unknown>[] }) =>
      detectedGames.map((g, i) => ({
        ...g,
        id: `new-${i}`,
        status: "backlog",
        rating: null,
        notes: null,
        progress: null,
        milestonesJson: null,
        completed: false,
        isHidden: !!g.isHidden,
      }));
    vi.mocked(openDialog).mockReset().mockResolvedValue(null);
    vi.mocked(save).mockReset().mockResolvedValue(null);
    vi.mocked(readTextFile).mockReset().mockResolvedValue("[]");
    vi.mocked(writeTextFile).mockReset().mockResolvedValue();
    reload.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, reload } });
    useSettingsStore.setState({
      autoHealthCheck: true,
      lastHealthCheckAt: null,
      healthCheckIssueCount: 0,
      hiddenGameIds: [],
    });
    useGameStore.setState({ games: [] });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("imports a library export with the detectedGames argument confirm_games expects", async () => {
    const games = [{ name: "Hades", source: "steam", sourceId: "1145360" }];
    vi.mocked(openDialog).mockResolvedValue("C:/nexus-library.json");
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(games));
    await renderData();

    fireEvent.click(screen.getByTestId("data-import"));

    await waitFor(() => expect(invoked("relink_play_sessions")).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledWith("confirm_games", { detectedGames: games });
    expect(readTextFile).toHaveBeenCalledWith("C:/nexus-library.json");
  });

  it("an import still succeeds when re-linking old sessions fails", async () => {
    const games = [{ name: "Hades", source: "steam", sourceId: "1145360" }];
    vi.mocked(openDialog).mockResolvedValue("C:/nexus-library.json");
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(games));
    const base = mockInvoke.getMockImplementation();
    mockInvoke.mockImplementation((cmd: string, args?: unknown) =>
      cmd === "relink_play_sessions" ? Promise.reject(new Error("db locked")) : base ? base(cmd, args) : Promise.resolve(undefined),
    );
    const result = await importLibraryFile();
    expect(result).toMatchObject({ imported: 1 });
  });

  it("classic Data panel imports with the same corrected argument", async () => {
    const games = [{ name: "Celeste", source: "epic" }];
    vi.mocked(openDialog).mockResolvedValue("C:/lib.json");
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(games));
    render(<DataManagement />);

    fireEvent.click(screen.getByTestId("data-import"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("confirm_games", { detectedGames: games }));
  });

  it("import skips removed games and puts back each game's status, rating and notes", async () => {
    const hades = { id: "old-1", name: "Hades", source: "steam", sourceId: "1", status: "playing", rating: 5, notes: "Run 12", progress: 40, completed: false, isHidden: false };
    const gone = { id: "old-2", name: "Uninstalled", source: "steam", sourceId: "2", status: "removed", rating: 3 };
    const celeste = { id: "old-3", name: "Celeste", source: "epic", status: "backlog", rating: null, notes: null, completed: false, isHidden: false };
    vi.mocked(openDialog).mockResolvedValue("C:/nexus-library.json");
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify([hades, gone, celeste]));
    await renderData();

    fireEvent.click(screen.getByTestId("data-import"));

    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "success", message: "Imported 2 games." }));
    expect(mockInvoke).toHaveBeenCalledWith("confirm_games", { detectedGames: [hades, celeste] });
    // Only Hades differs from a new game's defaults; `completed` rides along so update_game doesn't derive it.
    expect(invoked("update_game")).toEqual([
      ["update_game", { id: "new-0", fields: { status: "playing", rating: 5, notes: "Run 12", progress: 40, completed: false } }],
    ]);
    expect(invoked("relink_play_sessions")).toHaveLength(1);
    expect(invoked("get_games")).toHaveLength(1);
  });

  it("import says so when a game's details couldn't be put back", async () => {
    vi.mocked(openDialog).mockResolvedValue("C:/nexus-library.json");
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify([{ name: "Hades", source: "steam", sourceId: "1", status: "completed", rating: 4 }]));
    responses.update_game = () => Promise.reject(new Error("database is locked"));
    await renderData();

    fireEvent.click(screen.getByTestId("data-import"));

    await waitFor(() =>
      expect(useToastStore.getState().toasts).toEqual([
        expect.objectContaining({ type: "error", message: "Imported 1 game, but couldn’t restore the status, rating or notes of 1 game." }),
      ]),
    );
  });

  it("keeps one action's button disabled while a different action finishes", async () => {
    responses.get_cache_stats = { totalBytes: 2048 };
    let finishExport!: (path: string | null) => void;
    vi.mocked(save).mockReturnValue(new Promise((resolve) => (finishExport = resolve)));
    await renderData();

    fireEvent.click(screen.getByTestId("data-export"));
    await waitFor(() => expect(screen.getByTestId("data-export")).toBeDisabled());
    fireEvent.click(screen.getByTestId("data-clear-cache"));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe("Image cache cleared."));

    expect(screen.getByTestId("data-export")).toBeDisabled();
    await act(async () => finishExport(null));
    expect(screen.getByTestId("data-export")).toBeEnabled();
  });

  it("classic Data panel reports a failure instead of swallowing it", async () => {
    responses.get_cache_stats = { totalBytes: 2048 };
    responses.clear_cache = () => Promise.reject(new Error("in use"));
    render(<DataManagement />);
    await act(async () => {});

    fireEvent.click(screen.getByTestId("data-clear-cache"));

    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Couldn’t clear the image cache." }));
  });

  it("exports the library as JSON to the chosen file", async () => {
    responses.get_games = [{ id: "g1", name: "Hades" }];
    vi.mocked(save).mockResolvedValue("C:/out.json");
    await renderData();

    fireEvent.click(screen.getByTestId("data-export"));

    await waitFor(() => expect(writeTextFile).toHaveBeenCalledWith("C:/out.json", JSON.stringify(responses.get_games, null, 2)));
  });

  it("clears play history only after confirming", async () => {
    await renderData();

    fireEvent.click(screen.getByTestId("data-clear-history"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Clear play history?");
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(invoked("clear_play_history")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("data-clear-history"));
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(invoked("clear_play_history")).toHaveLength(1));
  });

  it("resets everything only after confirming, then reloads", async () => {
    await renderData();

    fireEvent.click(screen.getByTestId("data-reset-everything"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("including play history and API keys");
    expect(invoked("reset_all")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(invoked("reset_all")).toHaveLength(1);
    expect(invoked("reset_keep_keys")).toHaveLength(0);
  });

  it("keeps API keys when asked, and resets the library alone", async () => {
    await renderData();

    fireEvent.click(screen.getByTestId("data-reset-keep-keys"));
    fireEvent.click(screen.getByTestId("data-reset-everything"));
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(invoked("reset_keep_keys")).toHaveLength(1));

    fireEvent.click(screen.getByTestId("data-reset-library"));
    expect(invoked("reset_library_keep_stats")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(invoked("reset_library_keep_stats")).toHaveLength(1));
    expect(invoked("reset_all")).toHaveLength(0);
  });

  it("previews short sessions and removes them only after confirming", async () => {
    responses.count_short_sessions = { sessionsCount: 3, gamesAffected: 2 };
    responses.bulk_delete_short_sessions = { sessionsRemoved: 3, gamesAffected: 2 };
    await renderData();

    fireEvent.click(screen.getByTestId("data-short-sessions"));
    const dialog = await screen.findByRole("alertdialog");
    expect(mockInvoke).toHaveBeenCalledWith("count_short_sessions", { thresholdSecs: 120 });
    expect(dialog).toHaveTextContent("3 sessions across 2 games are under 2 minutes");
    expect(invoked("bulk_delete_short_sessions")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("bulk_delete_short_sessions", { thresholdSecs: 120 }));
  });

  it("uses the threshold and unit the user picks", async () => {
    responses.count_short_sessions = { sessionsCount: 0, gamesAffected: 0 };
    await renderData();

    fireEvent.change(screen.getByTestId("short-session-threshold"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("radio", { name: "sec" }));
    fireEvent.click(screen.getByTestId("data-short-sessions"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("count_short_sessions", { thresholdSecs: 45 }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(useToastStore.getState().toasts[0]?.message).toBe("No sessions under 45 seconds.");
  });

  it("auto health check toggle calls the setter", async () => {
    const setAutoHealthCheck = vi.fn();
    useSettingsStore.setState({ autoHealthCheck: true, setAutoHealthCheck });
    await renderData();

    const toggle = screen.getByTestId("auto-health-check-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(setAutoHealthCheck).toHaveBeenCalledWith(false);
  });

  it("runs a check and lists missing games with their fixes", async () => {
    responses.check_library_health = { deadGames: [deadGame], totalChecked: 12, checkedAt: new Date().toISOString() };
    await renderData();

    fireEvent.click(screen.getByTestId("run-health-check"));

    const row = await screen.findByTestId("dead-game-row-d1");
    expect(row).toHaveTextContent("Lost Game");
    expect(screen.getByTestId("health-summary")).toHaveTextContent("1 game missing");
    expect(useSettingsStore.getState().healthCheckIssueCount).toBe(1);

    fireEvent.click(within(row).getByTestId("dead-game-remove-d1"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "d1", fields: { isHidden: true } }));
    await waitFor(() => expect(screen.queryByTestId("dead-game-row-d1")).not.toBeInTheDocument());
    expect(useSettingsStore.getState().healthCheckIssueCount).toBe(0);
  });

  it("keeps a missing game listed when removing it fails", async () => {
    responses.check_library_health = { deadGames: [deadGame], totalChecked: 12, checkedAt: new Date().toISOString() };
    responses.update_game = () => Promise.reject(new Error("database is locked"));
    await renderData();

    fireEvent.click(screen.getByTestId("run-health-check"));
    fireEvent.click(await screen.findByTestId("dead-game-remove-d1"));

    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Couldn’t remove \"Lost Game\". Please try again." }));
    expect(screen.getByTestId("dead-game-row-d1")).toBeInTheDocument();
    expect(useSettingsStore.getState().healthCheckIssueCount).toBe(1);
  });

  it("remove all keeps the games it couldn't remove", async () => {
    const other: DeadGame = { ...deadGame, id: "d2", name: "Other Game" };
    responses.check_library_health = { deadGames: [deadGame, other], totalChecked: 12, checkedAt: new Date().toISOString() };
    responses.update_game = ({ id }: { id: string }) => (id === "d2" ? Promise.reject(new Error("locked")) : Promise.resolve(null));
    await renderData();

    fireEvent.click(screen.getByTestId("run-health-check"));
    fireEvent.click(await screen.findByTestId("health-check-remove-all"));
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() => expect(screen.queryByTestId("dead-game-row-d1")).not.toBeInTheDocument());
    expect(screen.getByTestId("dead-game-row-d2")).toBeInTheDocument();
    expect(useSettingsStore.getState().healthCheckIssueCount).toBe(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Removed 1 game, but couldn’t remove 1. Please try again." });
  });

  it("says so when the health check fails, and lets you run it again", async () => {
    responses.check_library_health = () => Promise.reject(new Error("boom"));
    await renderData();

    fireEvent.click(screen.getByTestId("run-health-check"));

    await waitFor(() => expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Couldn’t check your library. Please try again." }));
    expect(screen.getByTestId("run-health-check")).toBeEnabled();
  });

  it("fixes a missing game's path from the file picker", async () => {
    responses.check_library_health = { deadGames: [deadGame], totalChecked: 12, checkedAt: new Date().toISOString() };
    vi.mocked(openDialog).mockResolvedValue("D:/Games/Lost/lost.exe");
    await renderData();

    fireEvent.click(screen.getByTestId("run-health-check"));
    fireEvent.click(await screen.findByTestId("dead-game-fix-d1"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "d1", fields: { exePath: "D:/Games/Lost/lost.exe" } }),
    );
    expect(openDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "C:/Games/Lost" }));
  });

  it("shows when the last check ran and what it found", async () => {
    useSettingsStore.setState({ lastHealthCheckAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), healthCheckIssueCount: 0 });
    await renderData();

    expect(screen.getByText("3 days ago")).toBeInTheDocument();
    expect(screen.getByTestId("health-summary")).toHaveTextContent("No missing games");
  });

  it("manages hidden games and asks before unhiding them all", async () => {
    useGameStore.setState({ games: [game("g1", "Zelda"), game("g2", "Asteroids")] });
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    await renderData();

    expect(screen.getByText("2 hidden")).toBeInTheDocument();
    expect(screen.queryByTestId("hidden-games-list")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("hidden-games-manage"));

    const rows = within(screen.getByTestId("hidden-games-list")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["AsteroidsUnhide", "ZeldaUnhide"]);

    fireEvent.click(screen.getByRole("button", { name: "Unhide Zelda" }));
    await waitFor(() => expect(useSettingsStore.getState().hiddenGameIds).toEqual(["g2"]));
    expect(mockInvoke).toHaveBeenCalledWith("update_game", { id: "g1", fields: { isHidden: false } });
  });

  it("unhide all goes through a confirmation", async () => {
    useGameStore.setState({ games: [game("g1", "Zelda"), game("g2", "Asteroids")] });
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    await renderData();

    fireEvent.click(screen.getByTestId("hidden-games-manage"));
    fireEvent.click(screen.getByTestId("unhide-all"));
    expect(invoked("update_game")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() => expect(useSettingsStore.getState().hiddenGameIds).toEqual([]));
    expect(invoked("update_game")).toHaveLength(2);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "success", message: "Restored 2 games to your library." });
  });

  it("unhide all keeps the games it couldn't restore hidden", async () => {
    useGameStore.setState({ games: [game("g1", "Zelda"), game("g2", "Asteroids")] });
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    responses.update_game = ({ id }: { id: string }) => (id === "g2" ? Promise.reject(new Error("locked")) : Promise.resolve(null));
    await renderData();

    fireEvent.click(screen.getByTestId("hidden-games-manage"));
    fireEvent.click(screen.getByTestId("unhide-all"));
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() => expect(useSettingsStore.getState().hiddenGameIds).toEqual(["g2"]));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Restored 1 game, but couldn’t restore 1. Please try again." });
  });
});

describe("v1 Export stats settings", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "export_stats_zip" ? { assetsWritten: 4, assetsFailed: 0 } : {}),
    );
    vi.mocked(save).mockReset().mockResolvedValue("C:/out");
    vi.mocked(writeTextFile).mockReset().mockResolvedValue();
    useGameStore.setState({ games: [] });
  });

  function renderExport() {
    render(<ExportSection />, { wrapper: TooltipProvider });
  }

  it("defaults to all time as a zipped HTML page", async () => {
    renderExport();
    expect(screen.getByTestId("stats-export-range-value")).toHaveTextContent("All time");

    fireEvent.click(screen.getByTestId("stats-export-download"));

    await waitFor(() => expect(screen.getByTestId("stats-export-status")).toHaveTextContent("Exported HTML · 4 images packaged."));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "nexus-stats-all-time.zip" }));
    expect(mockInvoke).toHaveBeenCalledWith("export_stats_zip", expect.objectContaining({ destPath: "C:/out", html: "<html></html>" }));
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("exports JSON when that format is chosen", async () => {
    renderExport();
    fireEvent.click(screen.getByRole("radio", { name: "JSON" }));

    fireEvent.click(screen.getByTestId("stats-export-download"));

    await waitFor(() => expect(writeTextFile).toHaveBeenCalledWith("C:/out", '{"stats":true}'));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "nexus-stats-all-time.json" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("export_stats_zip", expect.anything());
    expect(screen.getByTestId("stats-export-status")).toHaveTextContent("Exported JSON.");
  });

  it("changes the range from the popover presets", async () => {
    renderExport();
    fireEvent.click(screen.getByTestId("stats-export-change-range"));
    fireEvent.click(await screen.findByTestId("stats-export-range-this_year"));

    const year = new Date().getFullYear();
    expect(screen.getByTestId("stats-export-range-value")).not.toHaveTextContent("All time");
    expect(screen.getByText("This year")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "JSON" }));
    fireEvent.click(screen.getByTestId("stats-export-download"));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(vi.mocked(save).mock.calls[0][0]?.defaultPath).toMatch(new RegExp(`^nexus-stats-${year}-01-01_to_${year}-\\d\\d-\\d\\d\\.json$`));
  });
});

describe("v1 Developer settings", () => {
  it("enables every notification setting for testing", () => {
    useSettingsStore.setState({
      enableNotifications: false,
      xpNotificationsEnabled: false,
      milestoneNotificationsEnabled: false,
      twitchEnabled: false,
      twitchNotificationsEnabled: false,
      twitchNotificationsFavoritesOnly: true,
    });
    mockInvoke.mockReset().mockResolvedValue(null);
    render(<DeveloperSection />);

    fireEvent.click(screen.getByTestId("dev-enable-notification-settings"));

    expect(useSettingsStore.getState()).toMatchObject({
      enableNotifications: true,
      xpNotificationsEnabled: true,
      milestoneNotificationsEnabled: true,
      twitchEnabled: true,
      twitchNotificationsEnabled: true,
      twitchNotificationsFavoritesOnly: false,
    });
    expect(screen.getByTestId("dev-notify-xp")).toBeInTheDocument();
    expect(screen.getByTestId("dev-notify-milestone")).toBeInTheDocument();
    expect(screen.getByTestId("dev-notify-twitch")).toBeInTheDocument();
  });
});
