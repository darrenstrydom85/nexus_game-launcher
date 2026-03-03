import * as React from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { Clock, Gamepad2, GamepadIcon, Trophy, TrendingUp } from "lucide-react";
import { ActivityChart } from "./stats/ActivityChart";
import { ActivityHeatmap } from "./stats/ActivityHeatmap";
import { TopGamesChart } from "./stats/TopGamesChart";
import { SessionHistory } from "./stats/SessionHistory";

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

export function formatHours(seconds: number): string {
  return `${Math.round(seconds / 3600)}h`;
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
}

const DEFAULT_STATS: PlayStats = {
  totalPlayTimeS: 0,
  gamesPlayed: 0,
  gamesUnplayed: 0,
  mostPlayedGame: null,
  weeklyPlayTimeS: 0,
};

export function LibraryStats({
  stats: statsProp,
  activityData: activityDataProp,
  topGames: topGamesProp,
  sessions: sessionsProp,
}: LibraryStatsProps) {
  const [stats, setStats] = React.useState<PlayStats>(statsProp ?? DEFAULT_STATS);
  const [activityData, setActivityData] = React.useState<ActivityDataPoint[]>(activityDataProp ?? []);
  const [topGames, setTopGames] = React.useState<TopGame[]>(topGamesProp ?? []);
  const [sessions, setSessions] = React.useState<SessionRecord[]>(sessionsProp ?? []);
  const [loading, setLoading] = React.useState(!statsProp);

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

  return (
    <div data-testid="library-stats" className="flex flex-col gap-6 p-6">
      <h2 className="text-2xl font-bold text-foreground">Library Stats</h2>

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
              value={formatHours(stats.totalPlayTimeS)}
            />
            <StatCard
              icon={<Gamepad2 className="size-5" />}
              label="Games Played"
              value={String(stats.gamesPlayed)}
            />
            <StatCard
              icon={<GamepadIcon className="size-5" />}
              label="Games Unplayed"
              value={String(stats.gamesUnplayed)}
            />
            <StatCard
              icon={<Trophy className="size-5" />}
              label="Most Played"
              value={stats.mostPlayedGame ?? "—"}
            />
            <StatCard
              icon={<TrendingUp className="size-5" />}
              label="Weekly Play Time"
              value={formatHours(stats.weeklyPlayTimeS)}
            />
          </div>

          {/* Activity Chart */}
          <div className="rounded-lg border border-border bg-card p-4">
            <ActivityChart data={activityData} />
          </div>

          {/* Heatmap + Top Games side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <ActivityHeatmap data={activityData} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <TopGamesChart games={topGames} />
            </div>
          </div>

          {/* Session History */}
          <div className="rounded-lg border border-border bg-card p-4">
            <SessionHistory sessions={sessions} />
          </div>
        </>
      )}
    </div>
  );
}
