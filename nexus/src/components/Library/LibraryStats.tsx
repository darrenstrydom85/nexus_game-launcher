import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, Clock, Gamepad2, GamepadIcon, Gift, Trophy, TrendingUp } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { ActivityChart } from "./stats/ActivityChart";
import { ActivityHeatmap } from "./stats/ActivityHeatmap";
import { TopGamesChart } from "./stats/TopGamesChart";
import { SessionHistory } from "./stats/SessionHistory";

export type StatsDateRange =
  | "all"
  | { start: string; end: string };

export interface PlayStats {
  totalPlayTimeS: number;
  gamesPlayed: number;
  gamesUnplayed: number;
  mostPlayedGame: string | null;
  weeklyPlayTimeS: number;
}

export interface ActivityDataPoint {
  date: string;
  minutes: number;
}

export interface TopGame {
  id: string;
  name: string;
  coverUrl: string | null;
  totalPlayTimeS: number;
}

export interface SessionRecord {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
}

// Raw shapes returned by the Tauri backend
interface BackendLibraryStats {
  totalPlayTimeS: number;
  gamesPlayed: number;
  gamesUnplayed: number;
  mostPlayedGame: string | null;
  weeklyPlayTimeS: number;
}

interface BackendActivityBucket {
  period: string;
  totalTime: number;
  sessionCount: number;
}

interface BackendTopGame {
  id: string;
  name: string;
  coverUrl: string | null;
  totalPlayTimeS: number;
}

interface BackendSession {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
}

/** Formats play time in seconds as "Xh Ym" or "Xm". Exported for tests. */
export function formatHours(seconds: number): string {
  return formatPlayTime(seconds);
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-4",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface LibraryStatsProps {
  /** Pass data directly (used in tests). When omitted, data is fetched from the backend. */
  stats?: PlayStats;
  activityData?: ActivityDataPoint[];
  topGames?: TopGame[];
  sessions?: SessionRecord[];
  /** Initial date range. When omitted, defaults to current month (used when navigating to stats in app). */
  initialDateRange?: StatsDateRange;
  /** Called when the user clicks "My Wrapped". */
  onOpenWrapped?: () => void;
}

const DEFAULT_STATS: PlayStats = {
  totalPlayTimeS: 0,
  gamesPlayed: 0,
  gamesUnplayed: 0,
  mostPlayedGame: null,
  weeklyPlayTimeS: 0,
};

function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return {
    start: `${y}-${m}-01`,
    end: now.toISOString().slice(0, 10),
  };
}

function filterByDateRange<T extends { date: string }>(
  items: T[],
  range: StatsDateRange,
): T[] {
  if (range === "all") return items;
  return items.filter((d) => d.date >= range.start && d.date <= range.end);
}

function filterSessionsByRange(
  sessions: SessionRecord[],
  range: StatsDateRange,
): SessionRecord[] {
  if (range === "all") return sessions;
  return sessions.filter((s) => {
    const date = s.startedAt.slice(0, 10);
    return date >= range.start && date <= range.end;
  });
}

function deriveStatsFromSessions(sessions: SessionRecord[]): PlayStats {
  const totalPlayTimeS = sessions.reduce((sum, s) => sum + s.durationS, 0);
  const gameIds = new Set(sessions.map((s) => s.gameId));
  const byGame = new Map<string, { name: string; durationS: number }>();
  for (const s of sessions) {
    const cur = byGame.get(s.gameId);
    if (!cur) byGame.set(s.gameId, { name: s.gameName, durationS: s.durationS });
    else cur.durationS += s.durationS;
  }
  let mostPlayedGame: string | null = null;
  let maxDuration = 0;
  byGame.forEach((v, _k) => {
    if (v.durationS > maxDuration) {
      maxDuration = v.durationS;
      mostPlayedGame = v.name;
    }
  });
  return {
    totalPlayTimeS,
    gamesPlayed: gameIds.size,
    gamesUnplayed: 0,
    mostPlayedGame,
    weeklyPlayTimeS: totalPlayTimeS,
  };
}

function deriveTopGamesFromSessions(
  sessions: SessionRecord[],
  coverByGameId: Map<string, string | null>,
  coverByName: Map<string, string | null>,
): TopGame[] {
  const byGame = new Map<
    string,
    { name: string; totalPlayTimeS: number }
  >();
  for (const s of sessions) {
    const cur = byGame.get(s.gameId);
    if (!cur)
      byGame.set(s.gameId, { name: s.gameName, totalPlayTimeS: s.durationS });
    else cur.totalPlayTimeS += s.durationS;
  }
  const sorted = [...byGame.entries()]
    .sort((a, b) => b[1].totalPlayTimeS - a[1].totalPlayTimeS)
    .slice(0, 10);
  return sorted.map(([id, v]) => ({
    id,
    name: v.name,
    coverUrl: coverByGameId.get(id) ?? coverByName.get(v.name.toLowerCase()) ?? null,
    totalPlayTimeS: v.totalPlayTimeS,
  }));
}

export function LibraryStats({
  stats: statsProp,
  activityData: activityDataProp,
  topGames: topGamesProp,
  sessions: sessionsProp,
  initialDateRange,
  onOpenWrapped,
}: LibraryStatsProps) {
  const [stats, setStats] = React.useState<PlayStats>(statsProp ?? DEFAULT_STATS);
  const [activityData, setActivityData] = React.useState<ActivityDataPoint[]>(activityDataProp ?? []);
  const [topGames, setTopGames] = React.useState<TopGame[]>(topGamesProp ?? []);
  const [sessions, setSessions] = React.useState<SessionRecord[]>(sessionsProp ?? []);
  const [loading, setLoading] = React.useState(!statsProp);
  const defaultRange = initialDateRange ?? getCurrentMonthRange();
  const [dateRange, setDateRange] = React.useState<StatsDateRange>(() =>
    defaultRange,
  );
  const [rangeStart, setRangeStart] = React.useState(() =>
    defaultRange === "all" ? "" : defaultRange.start,
  );
  const [rangeEnd, setRangeEnd] = React.useState(() =>
    defaultRange === "all" ? "" : defaultRange.end,
  );
  const accentColor = useSettingsStore((s) => s.accentColor);
  const storeGames = useGameStore((s) => s.games);

  const filteredActivity = React.useMemo(
    () => filterByDateRange(activityData, dateRange),
    [activityData, dateRange],
  );
  const filteredSessions = React.useMemo(
    () => filterSessionsByRange(sessions, dateRange),
    [sessions, dateRange],
  );
  const displayStats = React.useMemo((): PlayStats => {
    if (dateRange === "all") return stats;
    return deriveStatsFromSessions(filteredSessions);
  }, [dateRange, stats, filteredSessions]);
  const coverByGameId = React.useMemo(
    () => new Map(topGames.map((g) => [g.id, g.coverUrl])),
    [topGames],
  );
  const coverByName = React.useMemo(
    () => new Map(storeGames.map((g) => [g.name.toLowerCase(), g.coverUrl])),
    [storeGames],
  );
  const displayTopGames = React.useMemo((): TopGame[] => {
    if (dateRange === "all") return topGames;
    return deriveTopGamesFromSessions(filteredSessions, coverByGameId, coverByName);
  }, [dateRange, topGames, filteredSessions, coverByGameId, coverByName]);

  React.useEffect(() => {
    if (statsProp !== undefined) return;

    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      try {
        const [libraryStats, activityBuckets, topGamesData, allSessions] = await Promise.all([
          invoke<BackendLibraryStats>("get_library_stats"),
          invoke<BackendActivityBucket[]>("get_activity_data", { params: { period: "daily" } }),
          invoke<BackendTopGame[]>("get_top_games"),
          invoke<BackendSession[]>("get_all_sessions"),
        ]);

        if (cancelled) return;

        setStats({
          totalPlayTimeS: libraryStats.totalPlayTimeS,
          gamesPlayed: libraryStats.gamesPlayed,
          gamesUnplayed: libraryStats.gamesUnplayed,
          mostPlayedGame: libraryStats.mostPlayedGame,
          weeklyPlayTimeS: libraryStats.weeklyPlayTimeS,
        });

        setActivityData(
          activityBuckets.map((b) => ({
            date: b.period,
            minutes: Math.round(b.totalTime / 60),
          })),
        );

        setTopGames(
          topGamesData.map((g) => ({
            id: g.id,
            name: g.name,
            coverUrl: g.coverUrl,
            totalPlayTimeS: g.totalPlayTimeS,
          })),
        );

        setSessions(
          allSessions.map((s) => ({
            id: s.id,
            gameId: s.gameId,
            gameName: s.gameName,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationS: s.durationS,
          })),
        );
      } catch {
        // leave defaults in place on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [statsProp]);

  const isCustomRange = dateRange !== "all";
  const applyRange = () => {
    if (rangeStart && rangeEnd) setDateRange({ start: rangeStart, end: rangeEnd });
  };

  return (
    <div data-testid="library-stats" className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">Library Stats</h2>
          {onOpenWrapped && (
            <button
              type="button"
              data-testid="open-wrapped-button"
              onClick={onOpenWrapped}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
                "transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Gift className="size-3.5" aria-hidden />
              My Wrapped
            </button>
          )}
        </div>
        <div
          data-testid="stats-date-range"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            data-testid="stats-range-all"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              dateRange === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            onClick={() => setDateRange("all")}
          >
            <Calendar className="size-3.5" aria-hidden />
            All time
          </button>
          <span className="text-xs text-muted-foreground">From</span>
          <input
            type="date"
            data-testid="stats-range-start"
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            aria-label="Start date"
          />
          <span className="text-xs text-muted-foreground">To</span>
          <input
            type="date"
            data-testid="stats-range-end"
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            aria-label="End date"
          />
          <button
            type="button"
            data-testid="stats-range-apply"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={applyRange}
          >
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div
            data-testid="stats-summary"
            className="grid grid-cols-2 gap-4 lg:grid-cols-5"
          >
            <StatCard
              icon={<Clock className="size-5" />}
              label="Total Hours"
              value={formatPlayTime(displayStats.totalPlayTimeS)}
            />
            <StatCard
              icon={<Gamepad2 className="size-5" />}
              label="Games Played"
              value={String(displayStats.gamesPlayed)}
            />
            <StatCard
              icon={<GamepadIcon className="size-5" />}
              label="Games Unplayed"
              value={isCustomRange ? "—" : String(displayStats.gamesUnplayed)}
            />
            <StatCard
              icon={<Trophy className="size-5" />}
              label="Most Played"
              value={displayStats.mostPlayedGame ?? "—"}
            />
            <StatCard
              icon={<TrendingUp className="size-5" />}
              label={isCustomRange ? "Play Time" : "Weekly Play Time"}
              value={formatPlayTime(displayStats.weeklyPlayTimeS)}
            />
          </div>

          {/* Activity Chart */}
          <div className="rounded-lg border border-border bg-card p-4">
            <ActivityChart data={filteredActivity} accentColor={accentColor} />
          </div>

          {/* Heatmap + Top Games side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <ActivityHeatmap data={filteredActivity} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <TopGamesChart games={displayTopGames} />
            </div>
          </div>

          {/* Session History */}
          <div className="rounded-lg border border-border bg-card p-4">
            <SessionHistory sessions={filteredSessions} />
          </div>
        </>
      )}
    </div>
  );
}
