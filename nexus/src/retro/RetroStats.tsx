import * as React from "react";
import { useGameStore } from "@/stores/gameStore";
import { getSessionDistribution } from "@/lib/tauri";
import type { SessionDistribution } from "@/types/analytics";
import { SOURCE_CODE, STATUS_CODE, fmtHours, fmtBar, fmtDur } from "./format";
import type { GameSource, GameStatus } from "@/stores/gameStore";

export interface RetroStatsProps {
  enabled: boolean;
  onBack: () => void;
}

const BAR_W = 24;

export function RetroStats({ enabled, onBack }: RetroStatsProps) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }} data-testid="retro-stats">
      <div className="retro-panel">
        <div className="retro-panel-title">LIBRARY STATISTICS</div>
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
