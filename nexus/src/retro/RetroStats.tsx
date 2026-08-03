import * as React from "react";
import { useGameStore } from "@/stores/gameStore";
import { useXpStore } from "@/stores/xpStore";
import { useStreakStore } from "@/stores/streakStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { getSessionDistribution } from "@/lib/tauri";
import type { SessionDistribution } from "@/types/analytics";
import { SOURCE_CODE, STATUS_CODE, fmtHours, fmtBar, fmtDur, fmtDate } from "./format";
import type { GameSource, GameStatus } from "@/stores/gameStore";

export interface RetroStatsProps {
  enabled: boolean;
  /** "lib" = library statistics, "progress" = XP / achievements / streak. */
  page: "lib" | "progress";
  onBack: () => void;
}

const BAR_W = 24;

function ProgressPage() {
  const summary = useXpStore((s) => s.summary);
  const streak = useStreakStore((s) => s.streak);
  const statuses = useAchievementStore((s) => s.statuses);

  React.useEffect(() => {
    if (useAchievementStore.getState().statuses.length === 0) {
      useAchievementStore.getState().fetchStatuses();
    }
  }, []);

  const sorted = React.useMemo(
    () => [...statuses].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)),
    [statuses],
  );
  const unlockedCount = statuses.filter((s) => s.unlocked).length;
  const points = statuses.filter((s) => s.unlocked).reduce((acc, s) => acc + s.points, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }} data-testid="retro-progress">
      <div style={{ display: "flex", gap: 8 }}>
        <div className="retro-panel" style={{ flex: 1 }} data-testid="retro-progress-xp">
          <div className="retro-panel-header"><span>PLAYER XP</span></div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "10ch" }}>LEVEL</span>
            <span className="retro-value">{summary?.currentLevel ?? 1}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "10ch" }}>PROGRESS</span>
            <span className="retro-dim">
              {fmtBar(summary?.currentLevelXp ?? 0, Math.max(summary?.nextLevelXp ?? 1, 1), 20)}
            </span>
            <span className="retro-value">
              &nbsp;{summary?.currentLevelXp ?? 0}/{summary?.nextLevelXp ?? "?"}
            </span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "10ch" }}>TOTAL XP</span>
            <span className="retro-value">{summary?.totalXp ?? 0}</span>
          </div>
        </div>

        <div className="retro-panel" style={{ flex: 1 }} data-testid="retro-progress-streak">
          <div className="retro-panel-header"><span>PLAY STREAK</span></div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "10ch" }}>CURRENT</span>
            <span className="retro-value">{streak?.currentStreak ?? 0} DAYS</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "10ch" }}>LONGEST</span>
            <span className="retro-value">{streak?.longestStreak ?? 0} DAYS</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "10ch" }}>LAST PLAY</span>
            <span className="retro-value">{fmtDate(streak?.lastPlayDate ?? null)}</span>
          </div>
        </div>
      </div>

      <div className="retro-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-testid="retro-progress-achievements">
        <div className="retro-panel-header">
          <span>ACHIEVEMENTS ({unlockedCount}/{statuses.length})</span>
          <span>{points} PTS</span>
        </div>
        <div className="retro-scroll" style={{ flex: 1, minHeight: 0 }}>
          {sorted.length === 0 ? (
            <div className="retro-row retro-dim">NO ACHIEVEMENT DATA</div>
          ) : (
            sorted.map((a) => (
              <div key={a.id} className="retro-row" style={{ padding: 0 }}>
                <span className={a.unlocked ? "retro-good" : "retro-dim"} style={{ width: "4ch" }}>
                  {a.unlocked ? "[*]" : "[ ]"}
                </span>
                <span className={a.unlocked ? "retro-value" : "retro-dim"} style={{ width: "28ch", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.name}
                </span>
                <span className="retro-dim" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.description}
                </span>
                <span style={{ width: "9ch", textAlign: "right" }}>{a.points} PTS</span>
                <span className="retro-accent" style={{ width: "11ch", textAlign: "right" }}>{a.rarity}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function RetroStats({ enabled, page, onBack }: RetroStatsProps) {
  const games = useGameStore((s) => s.games);
  const lastSessionEndedAt = useGameStore((s) => s.lastSessionEndedAt);
  const [dist, setDist] = React.useState<SessionDistribution | null>(null);

  React.useEffect(() => {
    getSessionDistribution({ type: "library" })
      .then(setDist)
      .catch(() => setDist(null));
  }, [lastSessionEndedAt]);

  React.useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled, onBack]);

  const live = React.useMemo(
    () => games.filter((g) => g.status !== "removed" && !g.isHidden),
    [games],
  );

  const totals = React.useMemo(() => {
    const totalS = live.reduce((acc, g) => acc + g.totalPlayTimeS, 0);
    const plays = live.reduce((acc, g) => acc + g.playCount, 0);
    return {
      titles: live.length,
      hours: fmtHours(totalS),
      plays,
      completed: live.filter((g) => g.status === "completed" || g.completed).length,
      played: live.filter((g) => g.totalPlayTimeS > 0).length,
    };
  }, [live]);

  const byStatus = React.useMemo(() => {
    const counts = new Map<GameStatus, number>();
    for (const g of live) counts.set(g.status, (counts.get(g.status) ?? 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] ?? 0;
    return { entries, max };
  }, [live]);

  const bySource = React.useMemo(() => {
    const hours = new Map<GameSource, number>();
    for (const g of live) hours.set(g.source, (hours.get(g.source) ?? 0) + g.totalPlayTimeS);
    const entries = [...hours.entries()].sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] ?? 0;
    return { entries, max };
  }, [live]);

  const topGames = React.useMemo(() => {
    const top = [...live]
      .filter((g) => g.totalPlayTimeS > 0)
      .sort((a, b) => b.totalPlayTimeS - a.totalPlayTimeS)
      .slice(0, 10);
    return { top, max: top[0]?.totalPlayTimeS ?? 0 };
  }, [live]);

  const bucketMax = dist ? Math.max(...dist.buckets.map((b) => b.count), 0) : 0;

  if (page === "progress") {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }} data-testid="retro-stats">
        <div className="retro-panel">
          <div className="retro-panel-title">PLAYER PROGRESS - F6 FOR LIBRARY STATS</div>
        </div>
        <ProgressPage />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }} data-testid="retro-stats">
      <div className="retro-panel">
        <div className="retro-panel-title">LIBRARY STATISTICS - F6 FOR PLAYER PROGRESS</div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div className="retro-panel" style={{ flex: 1 }} data-testid="retro-stats-totals">
          <div className="retro-panel-header"><span>TOTALS</span></div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "12ch" }}>TITLES</span>
            <span className="retro-value">{totals.titles}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "12ch" }}>HOURS</span>
            <span className="retro-value">{totals.hours}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "12ch" }}>SESSIONS</span>
            <span className="retro-value">{totals.plays}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "12ch" }}>PLAYED</span>
            <span className="retro-value">{totals.played}/{totals.titles}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span className="retro-label" style={{ width: "12ch" }}>COMPLETED</span>
            <span className="retro-value">{totals.completed}</span>
          </div>
          {dist && dist.totalSessions > 0 && (
            <>
              <div className="retro-row" style={{ padding: 0 }}>
                <span className="retro-label" style={{ width: "12ch" }}>AVG SESSN</span>
                <span className="retro-value">{fmtDur(dist.meanDurationS)}</span>
              </div>
              <div className="retro-row" style={{ padding: 0 }}>
                <span className="retro-label" style={{ width: "12ch" }}>LONGEST</span>
                <span className="retro-value">{fmtDur(dist.longestSessionS)}</span>
              </div>
            </>
          )}
        </div>

        <div className="retro-panel" style={{ flex: 1 }}>
          <div className="retro-panel-header"><span>BY STATUS</span></div>
          {byStatus.entries.map(([status, count]) => (
            <div key={status} className="retro-row" style={{ padding: 0 }}>
              <span className="retro-label" style={{ width: "7ch" }}>{STATUS_CODE[status]}</span>
              <span className="retro-dim">{fmtBar(count, byStatus.max, 14)}</span>
              <span className="retro-value" style={{ width: "5ch", textAlign: "right" }}>{count}</span>
            </div>
          ))}
        </div>

        <div className="retro-panel" style={{ flex: 1 }}>
          <div className="retro-panel-header"><span>HOURS BY SOURCE</span></div>
          {bySource.entries.map(([source, totalS]) => (
            <div key={source} className="retro-row" style={{ padding: 0 }}>
              <span className="retro-label" style={{ width: "7ch" }}>{SOURCE_CODE[source]}</span>
              <span className="retro-dim">{fmtBar(totalS, bySource.max, 14)}</span>
              <span className="retro-value" style={{ width: "8ch", textAlign: "right" }}>{fmtHours(totalS)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="retro-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="retro-panel-header"><span>TOP 10 BY HOURS</span></div>
        <div className="retro-scroll" style={{ flex: 1, minHeight: 0 }}>
          {topGames.top.length === 0 ? (
            <div className="retro-row retro-dim">NO PLAY TIME RECORDED</div>
          ) : (
            topGames.top.map((g, i) => (
              <div key={g.id} className="retro-row" style={{ padding: 0 }} data-testid={`retro-stats-top-${i}`}>
                <span style={{ width: "4ch" }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="retro-value" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                <span className="retro-dim">{fmtBar(g.totalPlayTimeS, topGames.max, BAR_W)}</span>
                <span className="retro-value" style={{ width: "8ch", textAlign: "right" }}>{fmtHours(g.totalPlayTimeS)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="retro-panel" style={{ flexShrink: 0 }} data-testid="retro-stats-histogram">
        <div className="retro-panel-header"><span>SESSION LENGTHS{dist ? ` (${dist.totalSessions})` : ""}</span></div>
        {!dist || dist.totalSessions === 0 ? (
          <div className="retro-row retro-dim">NO SESSIONS ON FILE</div>
        ) : (
          dist.buckets.map((b) => (
            <div key={b.label} className="retro-row" style={{ padding: 0 }}>
              <span className="retro-label" style={{ width: "10ch" }}>{b.label}</span>
              <span className="retro-dim">{fmtBar(b.count, bucketMax, BAR_W)}</span>
              <span className="retro-value" style={{ width: "6ch", textAlign: "right" }}>{b.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
