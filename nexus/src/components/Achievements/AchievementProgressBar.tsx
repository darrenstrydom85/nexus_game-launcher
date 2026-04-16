import type { AchievementStatus, AchievementCategory } from "@/lib/tauri";

const CATEGORY_COLORS: Record<AchievementCategory, string> = {
  library: "#3B82F6",
  play: "#22C55E",
  completion: "#A855F7",
  streak: "#EAB308",
  exploration: "#F97316",
  session: "#EC4899",
};

interface AchievementProgressBarProps {
  statuses: AchievementStatus[];
}

export function AchievementProgressBar({ statuses }: AchievementProgressBarProps) {
  const total = statuses.length;
  const unlocked = statuses.filter((s) => s.unlocked).length;

  const segments = (
    ["library", "play", "completion", "streak", "exploration", "session"] as AchievementCategory[]
  ).map((cat) => {
    const catStatuses = statuses.filter((s) => s.category === cat);
    const catUnlocked = catStatuses.filter((s) => s.unlocked).length;
    return {
      category: cat,
      total: catStatuses.length,
      unlocked: catUnlocked,
      color: CATEGORY_COLORS[cat],
    };
  });

  return (
    <div className="flex flex-col gap-2" data-testid="achievement-progress-bar">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {unlocked} / {total}
        </span>
        <span className="text-xs text-muted-foreground">Achievements Unlocked</span>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[hsla(0,0%,100%,0.05)]">
        {segments.map((seg) =>
          seg.unlocked > 0 ? (
            <div
              key={seg.category}
              className="h-full transition-all duration-300"
              style={{
                width: `${(seg.unlocked / total) * 100}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.category}: ${seg.unlocked}/${seg.total}`}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.category} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-[10px] capitalize text-muted-foreground">
              {seg.category}{" "}
              <span className="tabular-nums">
                {seg.unlocked}/{seg.total}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
