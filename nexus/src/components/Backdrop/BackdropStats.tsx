import { useGameStore } from "@/stores/gameStore";
import { useStreakStore } from "@/stores/streakStore";
import { useXpStore } from "@/stores/xpStore";
import { LibraryStats } from "@/components/Library/LibraryStats";

interface BackdropStatsProps {
  onOpenWrapped?: () => void;
}

/**
 * Backdrop stats: cinematic header (giant hours figure, streak / level /
 * library minis, Wrapped entry) above the shared LibraryStats content.
 */
export function BackdropStats({ onOpenWrapped }: BackdropStatsProps) {
  const games = useGameStore((s) => s.games);
  const streak = useStreakStore((s) => s.streak);
  const summary = useXpStore((s) => s.summary);

  const visible = games.filter((g) => g.status !== "removed");
  const totalHours = Math.round(
    visible.reduce((acc, g) => acc + (g.totalPlayTimeS || 0), 0) / 3600,
  );
  const completedCount = games.filter((g) => g.completed).length;
  const currentStreak = streak?.currentStreak ?? 0;
  const longestStreak = streak?.longestStreak ?? 0;

  return (
    <div data-testid="backdrop-stats" className="flex flex-col">
      <header
        data-testid="backdrop-stats-header"
        className="flex items-end justify-between gap-6 px-10 pb-2 pt-10"
        style={{
          background:
            "radial-gradient(800px 320px at 85% -20%, color-mix(in srgb, var(--game-accent, var(--primary)) 14%, transparent), transparent 65%)",
        }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Your play record
          </p>
          <h1 className="font-display text-[76px] font-bold uppercase leading-[0.95] text-foreground">
            {totalHours.toLocaleString()}{" "}
            <span className="text-[36px] text-muted-foreground">hrs</span>
          </h1>
        </div>
        <div className="flex items-end gap-9 pb-2 text-right">
          {currentStreak > 0 && (
            <div>
              <p className="font-display text-3xl font-bold leading-none text-warning">{currentStreak}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Day streak{longestStreak > 0 ? ` · best ${longestStreak}` : ""}
              </p>
            </div>
          )}
          {summary && (
            <div>
              <p className="font-display text-3xl font-bold leading-none text-foreground">
                LVL {summary.currentLevel}
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                {summary.totalXp.toLocaleString()} XP
              </p>
            </div>
          )}
          <div>
            <p className="font-display text-3xl font-bold leading-none text-foreground">
              {completedCount}<span className="text-muted-foreground">/{visible.length}</span>
            </p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Completed
            </p>
          </div>
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
      <LibraryStats hideTitle />
    </div>
  );
}
