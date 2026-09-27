import { formatPlayTime } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { useStreakStore } from "@/stores/streakStore";
import { useXpStore } from "@/stores/xpStore";
import { LibraryStats } from "@/components/Library/LibraryStats";
import { Flame } from "lucide-react";

interface ChannelStatsProps {
  onOpenWrapped?: () => void;
}

/**
 * Channel stats: console profile header (level ring, streak, headline
 * figures) above the shared LibraryStats view.
 */
export function ChannelStats({ onOpenWrapped }: ChannelStatsProps) {
  const summary = useXpStore((s) => s.summary);
  const streak = useStreakStore((s) => s.streak);
  const games = useGameStore((s) => s.games);

  const visible = games.filter((g) => g.status !== "removed");
  const totalPlayTimeS = visible.reduce((acc, g) => acc + (g.totalPlayTimeS || 0), 0);
  const completedCount = games.filter((g) => g.completed).length;
  const level = summary?.currentLevel ?? 0;
  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;

  return (
    <div data-testid="channel-stats" className="flex flex-col">
      <header className="flex items-center gap-7 px-10 pb-2 pt-6" data-testid="channel-stats-header">
        <div
          className="flex size-20 shrink-0 flex-col items-center justify-center rounded-full border-[3px]"
          style={{ borderColor: "var(--game-accent, var(--primary))" }}
          aria-label={`Level ${level}`}
        >
          <span className="text-2xl font-bold leading-none">{level}</span>
          <span className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-muted-foreground">Level</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold" data-testid="channel-stats-hours">
            {formatPlayTime(totalPlayTimeS)} played
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {visible.length} games · {completedCount} completed
            {summary ? ` · ${summary.totalXp.toLocaleString()} XP` : ""}
          </p>
        </div>
        <div className="flex-1" />
        {currentStreak > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3">
            <Flame className="size-5 text-warning" aria-hidden />
            <div>
              <p className="text-xl font-bold leading-none text-warning">{currentStreak} days</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                Current streak{longestStreak > 0 ? ` · best ${longestStreak}` : ""}
              </p>
            </div>
          </div>
        )}
      </header>
      <LibraryStats onOpenWrapped={onOpenWrapped} />
    </div>
  );
}
