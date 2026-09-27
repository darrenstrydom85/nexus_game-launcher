import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "@/stores/gameStore";
import { useStreakStore } from "@/stores/streakStore";
import { useXpStore } from "@/stores/xpStore";
import { LibraryStats, type SessionRecord } from "@/components/Library/LibraryStats";
import { Shelf } from "./Shelf";

interface BackdropStatsProps {
  onOpenWrapped?: () => void;
}

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/**
 * Backdrop stats: the mockup's cinematic layout — headline hours, weekday
 * rhythm, top-games bars, library breakdown, averages and the streak line —
 * with the full detailed stats (charts, heatmap, XP, sessions) below as a
 * "deep dive".
 */
export function BackdropStats({ onOpenWrapped }: BackdropStatsProps) {
  const games = useGameStore((s) => s.games);
  const streak = useStreakStore((s) => s.streak);
  const summary = useXpStore((s) => s.summary);
  const [sessions, setSessions] = React.useState<SessionRecord[]>([]);

  React.useEffect(() => {
    invoke<SessionRecord[]>("get_all_sessions")
      .then(setSessions)
      .catch(() => {});
  }, []);

  const visible = games.filter((g) => g.status !== "removed");
  const archivedCount = games.length - visible.length;
  const totalHours = Math.round(
    visible.reduce((acc, g) => acc + (g.totalPlayTimeS || 0), 0) / 3600,
  );
  const completedCount = games.filter((g) => g.completed).length;
  const playingCount = visible.filter((g) => g.status === "playing").length;
  const backlogCount = visible.filter((g) => g.status === "backlog").length;
  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;

  const weekday = React.useMemo(() => {
    const hours = Array(7).fill(0) as number[];
    for (const s of sessions) {
      const d = new Date(s.startedAt).getDay(); // 0 = Sunday
      hours[(d + 6) % 7] += s.durationS / 3600; // Monday-first
    }
    const max = Math.max(1, ...hours);
    return hours.map((h) => ({ h: Math.round(h), pct: (h / max) * 100 }));
  }, [sessions]);

  const topGames = React.useMemo(
    () =>
      [...visible]
        .filter((g) => g.totalPlayTimeS > 0)
        .sort((a, b) => b.totalPlayTimeS - a.totalPlayTimeS)
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [games],
  );
  const topMax = topGames[0]?.totalPlayTimeS ?? 1;

  const averages = React.useMemo(() => {
    if (sessions.length === 0) return null;
    const total = sessions.reduce((a, s) => a + s.durationS, 0);
    const longest = sessions.reduce((a, s) => (s.durationS > a.durationS ? s : a), sessions[0]);
    return {
      count: sessions.length,
      avg: fmtDuration(total / sessions.length),
      longest: fmtDuration(longest.durationS),
      longestGame: longest.gameName,
    };
  }, [sessions]);

  const streakSince = streak?.streakStartedAt
    ? new Date(streak.streakStartedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : null;

  return (
    <div
      data-testid="backdrop-stats"
      className="flex flex-col pb-8"
      style={{
        background:
          "radial-gradient(900px 400px at 80% -10%, color-mix(in srgb, var(--game-accent, var(--primary)) 12%, transparent), transparent 60%)",
      }}
    >
      {/* Headline */}
      <header
        data-testid="backdrop-stats-header"
        className="flex items-end justify-between gap-6 px-10 pb-2 pt-9"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Your play record · all time
          </p>
          <h1 className="font-display text-[84px] font-bold uppercase leading-[0.95] text-foreground">
            {totalHours.toLocaleString()}{" "}
            <span className="text-[40px] text-muted-foreground">hrs</span>
          </h1>
        </div>
        <div className="flex items-end gap-9 pb-2 text-right">
          {averages && (
            <div>
              <p className="font-display text-[30px] font-bold leading-none text-foreground">{averages.count}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Sessions</p>
            </div>
          )}
          {currentStreak > 0 && (
            <div>
              <p className="font-display text-[30px] font-bold leading-none text-warning">{currentStreak}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Day streak{longestStreak > 0 ? ` · best ${longestStreak}` : ""}
              </p>
            </div>
          )}
          {summary && (
            <div>
              <p className="font-display text-[30px] font-bold leading-none text-foreground">
                LVL {summary.currentLevel}
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                {summary.totalXp.toLocaleString()} XP · {Math.round(summary.progressToNextLevel * 100)}% to{" "}
                {summary.currentLevel + 1}
              </p>
            </div>
          )}
          {onOpenWrapped && (
            <button
              data-testid="open-wrapped-button"
              className="rounded-md border border-foreground/25 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onOpenWrapped}
            >
              Open Wrapped →
            </button>
          )}
        </div>
      </header>

      {/* Weekday rhythm */}
      {sessions.length > 0 && (
        <Shelf title="Hours by weekday" testid="stats-weekday">
          <div className="flex h-[110px] items-end gap-2">
            {weekday.map((d, i) => {
              const isPeak = d.pct === 100;
              return (
                <div key={WEEKDAYS[i]} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full transition-all"
                    style={{
                      height: `${Math.max(3, d.pct)}%`,
                      background: isPeak
                        ? "var(--game-accent, var(--primary))"
                        : `color-mix(in srgb, var(--game-accent, var(--primary)) ${25 + d.pct * 0.5}%, transparent)`,
                    }}
                  />
                  <span className={isPeak ? "text-[9px] text-foreground" : "text-[9px] text-muted-foreground"}>
                    {WEEKDAYS[i]} · {d.h}h
                  </span>
                </div>
              );
            })}
          </div>
        </Shelf>
      )}

      <div className="flex gap-12 px-10 pt-5">
        {/* Top games */}
        <div className="flex flex-[1.2] flex-col gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Top games</h2>
            <div className="h-px flex-1 bg-foreground/10" />
          </div>
          <div className="flex flex-col gap-2.5 text-xs" data-testid="stats-top-games">
            {topGames.map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <span className="w-[130px] truncate text-muted-foreground">{g.name}</span>
                <div className="h-3.5 flex-1 bg-foreground/5">
                  <div
                    className="h-full"
                    style={{
                      width: `${(g.totalPlayTimeS / topMax) * 100}%`,
                      background: `color-mix(in srgb, var(--game-accent, var(--primary)) ${
                        40 + (g.totalPlayTimeS / topMax) * 60
                      }%, transparent)`,
                    }}
                  />
                </div>
                <span className="w-12 text-right tabular-nums text-foreground">
                  {(g.totalPlayTimeS / 3600).toFixed(1)}h
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Library + averages + streak */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Library</h2>
            <div className="h-px flex-1 bg-foreground/10" />
          </div>
          <div className="flex gap-5 text-[11px] text-muted-foreground">
            <span><b className="text-success">●</b> Playing {playingCount}</span>
            <span><b className="text-warning">●</b> Backlog {backlogCount}</span>
            <span><b className="text-foreground">●</b> Completed {completedCount}</span>
            {archivedCount > 0 && <span><b className="opacity-50">●</b> Archived {archivedCount}</span>}
          </div>
          {averages && (
            <>
              <div className="mt-2 flex items-center gap-4">
                <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Averages</h2>
                <div className="h-px flex-1 bg-foreground/10" />
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="font-display text-[26px] font-bold leading-none text-foreground">{averages.avg}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Avg session</p>
                </div>
                <div>
                  <p className="font-display text-[26px] font-bold leading-none text-foreground">{averages.longest}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    Longest ({averages.longestGame})
                  </p>
                </div>
              </div>
            </>
          )}
          {currentStreak > 0 && streakSince && (
            <>
              <div className="mt-2 flex items-center gap-4">
                <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Streak</h2>
                <div className="h-px flex-1 bg-foreground/10" />
              </div>
              <p className="text-xs text-muted-foreground">
                Playing daily since <span className="text-foreground">{streakSince}</span> — {currentStreak} days.
                {longestStreak > currentStreak
                  ? ` Personal best is ${longestStreak}; ${longestStreak - currentStreak} to go.`
                  : " This is your personal best."}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Full detail below, in the same voice */}
      <Shelf title="Deep dive" className="mt-4" testid="stats-deep-dive">
        <div className="-mx-10">
          <LibraryStats hideTitle />
        </div>
      </Shelf>
    </div>
  );
}
