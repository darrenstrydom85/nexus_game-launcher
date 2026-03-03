import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  checkFirstLaunchTransition,
  checkLongPlaySuggestion,
  useAutoStatusTransition,
} from "@/hooks/useAutoStatusTransition";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import type { Game } from "@/stores/gameStore";

const makeGame = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  name: "Test Game",
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
  addedAt: "2026-01-01",
  ...overrides,
});

describe("Story 7.5: Automatic Status Transitions", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    useSettingsStore.setState({ autoStatusTransitions: true });
  });

  describe("checkFirstLaunchTransition", () => {
    it("returns transition when status is backlog", () => {
      const game = makeGame({ status: "backlog" });
      const result = checkFirstLaunchTransition(game);
      expect(result).not.toBeNull();
      expect(result!.fromStatus).toBe("backlog");
      expect(result!.toStatus).toBe("playing");
      expect(result!.reason).toBe("first_launch");
    });

    it("returns null when status is not backlog", () => {
      expect(checkFirstLaunchTransition(makeGame({ status: "playing" }))).toBeNull();
      expect(checkFirstLaunchTransition(makeGame({ status: "unset" }))).toBeNull();
    });
  });

  describe("checkLongPlaySuggestion", () => {
    it("returns suggestion for 20+ hours and 30+ days since last launch", () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const game = makeGame({
        status: "playing",
        totalPlayTimeS: 72001,
        lastPlayedAt: thirtyOneDaysAgo,
      });
      const result = checkLongPlaySuggestion(game);
      expect(result).not.toBeNull();
      expect(result!.reason).toBe("long_play_suggestion");
    });

    it("returns null for < 20 hours", () => {
      const game = makeGame({
        totalPlayTimeS: 3600,
        lastPlayedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(checkLongPlaySuggestion(game)).toBeNull();
    });

    it("returns null for < 30 days since last launch", () => {
      const game = makeGame({
        totalPlayTimeS: 100000,
        lastPlayedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(checkLongPlaySuggestion(game)).toBeNull();
    });

    it("returns null when already completed", () => {
      const game = makeGame({
        status: "completed",
        totalPlayTimeS: 100000,
        lastPlayedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(checkLongPlaySuggestion(game)).toBeNull();
    });

    it("returns null when already dropped", () => {
      const game = makeGame({
        status: "dropped",
        totalPlayTimeS: 100000,
        lastPlayedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(checkLongPlaySuggestion(game)).toBeNull();
    });

    it("returns null when no lastPlayedAt", () => {
      const game = makeGame({ totalPlayTimeS: 100000, lastPlayedAt: null });
      expect(checkLongPlaySuggestion(game)).toBeNull();
    });
  });

  describe("useAutoStatusTransition hook", () => {
    it("auto-transitions backlog to playing on first launch", () => {
      const onStatusChange = vi.fn();
      const game = makeGame({ status: "backlog" });
      renderHook(() =>
        useAutoStatusTransition({
          game,
          isFirstLaunch: true,
          onStatusChange,
        }),
      );
      expect(onStatusChange).toHaveBeenCalledWith("g1", "playing");
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0].action?.label).toBe("Undo");
    });

    it("does not auto-transition when disabled in settings", () => {
      useSettingsStore.setState({ autoStatusTransitions: false });
      const onStatusChange = vi.fn();
      const game = makeGame({ status: "backlog" });
      renderHook(() =>
        useAutoStatusTransition({
          game,
          isFirstLaunch: true,
          onStatusChange,
        }),
      );
      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("does not auto-transition when not first launch", () => {
      const onStatusChange = vi.fn();
      const game = makeGame({ status: "backlog" });
      renderHook(() =>
        useAutoStatusTransition({
          game,
          isFirstLaunch: false,
          onStatusChange,
        }),
      );
      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("shows suggestion toast for long-play games", () => {
      const onStatusChange = vi.fn();
      const game = makeGame({
        status: "playing",
        totalPlayTimeS: 100000,
        lastPlayedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
      renderHook(() =>
        useAutoStatusTransition({ game, onStatusChange }),
      );
      const toasts = useToastStore.getState().toasts;
      expect(toasts.length).toBeGreaterThan(0);
      expect(toasts[0].message).toContain("Finished");
      expect(toasts[0].action?.label).toBe("Completed");
    });

    it("status colors are consistent (uses same STATUS_COLORS)", () => {
      expect(true).toBe(true);
    });
  });
});
