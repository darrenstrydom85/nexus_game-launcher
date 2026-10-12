import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "@/stores/gameStore";
import { getCurrentMonthRange, getPresetRange, toDateStr, type StatsDateRange, type StatsPreset } from "@/lib/statsRange";
import {
  EMPTY_STATS,
  deriveStatsFromSessions,
  deriveTopGamesFromSessions,
  filterSessionsByRange,
  type PlayStats,
  type SessionRecord,
  type TopGame,
} from "@/lib/statsData";

export type RangeChoice = StatsPreset | "custom";

/** The Stats period: a preset, or a custom start/end applied explicitly. */
export function useStatsRange() {
  const [choice, setChoice] = React.useState<RangeChoice>("this_month");
  const [range, setRange] = React.useState<StatsDateRange>(() => getCurrentMonthRange());

  const choosePreset = React.useCallback((preset: StatsPreset) => {
    setChoice(preset);
    setRange(getPresetRange(preset));
  }, []);

  const applyCustom = React.useCallback((start: string, end: string) => {
    if (start.length !== 10 || end.length !== 10 || start > end) return false;
    setChoice("custom");
    setRange({ start, end });
    return true;
  }, []);

  return { choice, range, choosePreset, applyCustom };
}

interface BackendTopGame {
  id: string;
  name: string;
  coverUrl: string | null;
  totalPlayTimeS: number;
}

/**
 * Everything the Stats page shows for a range. Fetches once, refetches when a
 * session ends, and only reports `loading` before the first data arrives so a
 * refresh never blanks the page or loses scroll.
 */
export function useLibraryStatsData(range: StatsDateRange) {
  const games = useGameStore((s) => s.games);
  const sessionEnded = useGameStore((s) => s.lastSessionEndedAt);
  const [stats, setStats] = React.useState<PlayStats>(EMPTY_STATS);
  const [topGames, setTopGames] = React.useState<TopGame[]>([]);
  const [sessions, setSessions] = React.useState<SessionRecord[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const hasData = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<PlayStats>("get_library_stats"),
      invoke<BackendTopGame[]>("get_top_games"),
      invoke<SessionRecord[]>("get_all_sessions"),
    ])
      .then(([lib, top, all]) => {
        if (cancelled) return;
        hasData.current = true;
        setFailed(false);
        setStats(lib ?? EMPTY_STATS);
        setTopGames(top ?? []);
        setSessions(all ?? []);
      })
      // Zeros would read as "you played nothing"; say it failed. A failed refresh keeps what's showing.
      .catch(() => !cancelled && !hasData.current && setFailed(true))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionEnded, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  const visibleGameCount = React.useMemo(
    () => games.filter((g) => !g.isHidden && g.status !== "removed").length,
    [games],
  );
  // "All time" as real dates: first session to today.
  const span = React.useMemo(() => {
    if (range !== "all") return range;
    const today = toDateStr(new Date());
    const first = sessions.reduce((min, s) => {
      const day = toDateStr(new Date(s.startedAt));
      return day < min ? day : min;
    }, today);
    return { start: first, end: today };
  }, [range, sessions]);
  const filteredSessions = React.useMemo(() => filterSessionsByRange(sessions, range), [sessions, range]);
  const displayStats = React.useMemo(
    () => (range === "all" ? stats : deriveStatsFromSessions(filteredSessions, visibleGameCount)),
    [range, stats, filteredSessions, visibleGameCount],
  );
  const displayTopGames = React.useMemo(() => {
    if (range === "all") return topGames;
    const byId = new Map(topGames.map((g) => [g.id, g.coverUrl]));
    const byName = new Map(games.map((g) => [g.name.toLowerCase(), g.coverUrl]));
    return deriveTopGamesFromSessions(filteredSessions, byId, byName);
  }, [range, topGames, filteredSessions, games]);
  const milestoneSessionIds = React.useMemo(() => filteredSessions.map((s) => s.id), [filteredSessions]);

  const patchSessionNote = React.useCallback((sessionId: string, note: string | null) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, note } : s)));
  }, []);

  return {
    loading: !loaded,
    failed,
    retry,
    displayStats,
    span,
    allSessions: sessions,
    filteredSessions,
    displayTopGames,
    milestoneSessionIds,
    patchSessionNote,
  };
}
