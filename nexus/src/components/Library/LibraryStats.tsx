import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { Clock, Gamepad2, GamepadIcon, Gift, Trophy, TrendingUp } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { ActivityChart } from "./stats/ActivityChart";
import { ActivityHeatmap } from "./stats/ActivityHeatmap";
import { TopGamesChart } from "./stats/TopGamesChart";
import { SessionHistory } from "./stats/SessionHistory";
import { SessionHistogram } from "@/components/Stats/SessionHistogram";
import { useSessionDistribution } from "@/hooks/useSessionDistribution";
import { StreakSection } from "@/components/Streak/StreakSection";
import { MilestoneHistorySection } from "@/components/Milestones/MilestoneHistorySection";
import type { SessionScope } from "@/lib/tauri";

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
  note: string | null;
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
  note: string | null;
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
  /** Pass distribution directly (used in tests). When omitted, fetched via hook. */
  distribution?: import("@/lib/tauri").SessionDistribution | null;
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

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  return {
    start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    end: toDateStr(now),
  };
}

type StatsPreset = "this_week" | "this_month" | "last_30_days" | "this_year" | "all";

function getPresetRange(preset: StatsPreset): StatsDateRange {
  if (preset === "all") return "all";
  const now = new Date();
  const todayStr = toDateStr(now);
  switch (preset) {
    case "this_week": {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(monday.getDate() - mondayOffset);
      return { start: toDateStr(monday), end: todayStr };
    }
    case "this_month":
      return getCurrentMonthRange();
    case "last_30_days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start: toDateStr(start), end: todayStr };
    }
    case "this_year":
      return { start: `${now.getFullYear()}-01-01`, end: todayStr };
  }
}

const PRESETS: { id: StatsPreset; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_year", label: "This year" },
  { id: "all", label: "All time" },
];

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

function deriveStatsFromSessions(sessions: SessionRecord[], totalLibraryGames: number): PlayStats {
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
  const gamesPlayed = gameIds.size;
  return {
    totalPlayTimeS,
    gamesPlayed,
    gamesUnplayed: Math.max(0, totalLibraryGames - gamesPlayed),
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
  distribution: distributionProp,
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
  const [activePreset, setActivePreset] = React.useState<StatsPreset | null>(() =>
    initialDateRange === "all" ? "all" : "this_month",
  );
  const [showCustom, setShowCustom] = React.useState(false);
  const [rangeStart, setRangeStart] = React.useState(() =>
    defaultRange === "all" ? "" : defaultRange.start,
  );
  const [rangeEnd, setRangeEnd] = React.useState(() =>
    defaultRange === "all" ? "" : defaultRange.end,
  );
  const accentColor = useSettingsStore((s) => s.accentColor);
  const storeGames = useGameStore((s) => s.games);

  // Session distribution histogram (Story 17.2)
  const {
    distribution: fetchedDistribution,
    isLoading: distributionLoading,
    refetch: refetchDistribution,
  } = useSessionDistribution();

  const distribution = distributionProp !== undefined ? distributionProp : fetchedDistribution;
  const isDistributionLoading = distributionProp !== undefined ? false : distributionLoading;

  const handleScopeChange = React.useCallback(
    (scope: SessionScope) => {
      if (distributionProp === undefined) refetchDistribution(scope);
    },
    [distributionProp, refetchDistribution],
  );

  const filteredActivity = React.useMemo(
    () => filterByDateRange(activityData, dateRange),
    [activityData, dateRange],
  );
  const filteredSessions = React.useMemo(
    () => filterSessionsByRange(sessions, dateRange),
    [sessions, dateRange],
  );
  const visibleGameCount = React.useMemo(
    () => storeGames.filter((g) => !g.isHidden && g.status !== "removed").length,
    [storeGames],
  );
  const displayStats = React.useMemo((): PlayStats => {
    if (dateRange === "all") return stats;
    return deriveStatsFromSessions(filteredSessions, visibleGameCount);
  }, [dateRange, stats, filteredSessions, visibleGameCount]);
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

  const milestoneSessionIds = React.useMemo(
    () => filteredSessions.map((s) => s.id),
    [filteredSessions],
  );

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
            note: s.note,
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
  const todayStr = React.useMemo(() => toDateStr(new Date()), []);
  const isValidRange = rangeStart.length === 10 && rangeEnd.length === 10 && rangeStart <= rangeEnd;
  const applyRange = () => {
    if (isValidRange) {
      setActivePreset(null);
      setDateRange({ start: rangeStart, end: rangeEnd });
    }
  };
  const handlePreset = (preset: StatsPreset) => {
    setActivePreset(preset);
    setShowCustom(false);
    const range = getPresetRange(preset);
    setDateRange(range);
    if (range !== "all") {
      setRangeStart(range.start);
      setRangeEnd(range.end);
    }
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
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`stats-range-${p.id}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activePreset === p.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
              )}
              onClick={() => handlePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="stats-range-custom-toggle"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              showCustom || (activePreset === null && dateRange !== "all")
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
            )}
            onClick={() => setShowCustom((v) => !v)}
          >
            Custom
          </button>
          {showCustom && (
            <div className="flex items-center gap-2">
              <DatePicker
                data-testid="stats-range-start"
                value={rangeStart}
                onChange={setRangeStart}
                label="Start date"
                maxDate={rangeEnd || todayStr}
                triggerClassName="h-8"
              />
              <span className="text-xs text-muted-foreground">&ndash;</span>
              <DatePicker
                data-testid="stats-range-end"
                value={rangeEnd}
                onChange={setRangeEnd}
                label="End date"
                minDate={rangeStart || undefined}
                maxDate={todayStr}
                triggerClassName="h-8"
              />
              <button
                type="button"
                data-testid="stats-range-apply"
                disabled={!isValidRange}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isValidRange
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
                onClick={applyRange}
              >
                Apply
              </button>
            </div>
          )}
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
              value={String(displayStats.gamesUnplayed)}
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

          {/* Streak Section */}
          <StreakSection />

          {/* Milestone History */}
          <MilestoneHistorySection sessionIds={milestoneSessionIds} />

          {/* Activity Chart */}
          <div className="rounded-lg border border-border bg-card p-4">
            <ActivityChart data={filteredActivity} accentColor={accentColor} />
          </div>

          {/* Heatmap + Top Games side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <ActivityHeatmap data={filteredActivity} dateRange={dateRange} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <TopGamesChart games={displayTopGames} />
            </div>
          </div>

          {/* Session History */}
          <div className="rounded-lg border border-border bg-card p-4">
            <SessionHistory
              sessions={filteredSessions}
              onNoteUpdated={(sessionId, note) => {
                setSessions((prev) =>
                  prev.map((s) => (s.id === sessionId ? { ...s, note } : s)),
                );
              }}
            />
          </div>

          {/* Session Lengths Histogram */}
          <div className="rounded-lg border border-border bg-card p-4">
            <SessionHistogram
              distribution={distribution}
              isLoading={isDistributionLoading}
              onScopeChange={handleScopeChange}
              accentColor={accentColor}
            />
          </div>
        </>
      )}
    </div>
  );
}
