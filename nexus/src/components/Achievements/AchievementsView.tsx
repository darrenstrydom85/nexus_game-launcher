import * as React from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAchievementStore } from "@/stores/achievementStore";
import { AchievementCard } from "./AchievementCard";
import { AchievementProgressBar } from "./AchievementProgressBar";
import type { AchievementCategory, AchievementRarity, AchievementStatus } from "@/lib/tauri";

const CATEGORIES: { value: AchievementCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "library", label: "Library" },
  { value: "play", label: "Play" },
  { value: "completion", label: "Completion" },
  { value: "streak", label: "Streak" },
  { value: "exploration", label: "Exploration" },
  { value: "session", label: "Session" },
];

const RARITY_ORDER: Record<AchievementRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

const RARITY_FILTERS: { value: AchievementRarity | "all"; label: string }[] = [
  { value: "all", label: "All Rarities" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
];

function sortAchievements(statuses: AchievementStatus[]): AchievementStatus[] {
  return [...statuses].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    if (a.unlocked && b.unlocked) {
      return (
        new Date(b.unlockedAt!).getTime() - new Date(a.unlockedAt!).getTime()
      );
    }
    return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  });
}

export function AchievementsView() {
  const { statuses, loading, fetchStatuses, highlightId, setHighlightId, clearBadge } =
    useAchievementStore();
  const [activeCategory, setActiveCategory] = React.useState<
    AchievementCategory | "all"
  >("all");
  const [rarityFilter, setRarityFilter] = React.useState<
    AchievementRarity | "all"
  >("all");

  React.useEffect(() => {
    fetchStatuses();
    clearBadge();
  }, [fetchStatuses, clearBadge]);

  React.useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => setHighlightId(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [highlightId, setHighlightId]);

  const filtered = React.useMemo(() => {
    let items = statuses;
    if (activeCategory !== "all") {
      items = items.filter((s) => s.category === activeCategory);
    }
    if (rarityFilter !== "all") {
      items = items.filter((s) => s.rarity === rarityFilter);
    }
    return sortAchievements(items);
  }, [statuses, activeCategory, rarityFilter]);

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, { unlocked: number; total: number }> = {};
    for (const s of statuses) {
      const key = s.category;
      if (!counts[key]) counts[key] = { unlocked: 0, total: 0 };
      counts[key].total++;
      if (s.unlocked) counts[key].unlocked++;
    }
    return counts;
  }, [statuses]);

  if (loading && statuses.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Trophy className="size-8 animate-pulse" />
          <span className="text-sm">Loading achievements…</span>
        </div>
      </div>
    );
  }

  const totalUnlocked = statuses.filter((s) => s.unlocked).length;

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-6"
      data-testid="achievements-view"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Achievements</h2>
        <p className="text-sm text-muted-foreground">
          Track your gaming milestones and unlock rewards
        </p>
      </div>

      <AchievementProgressBar statuses={statuses} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-lg bg-[hsla(0,0%,100%,0.03)] p-1" role="tablist">
          {CATEGORIES.map((cat) => {
            const count = cat.value === "all"
              ? undefined
              : categoryCounts[cat.value];
            return (
              <button
                key={cat.value}
                role="tab"
                aria-selected={activeCategory === cat.value}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeCategory === cat.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.label}
                {count && (
                  <span className="ml-1 tabular-nums opacity-70">
                    {count.unlocked}/{count.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1 rounded-lg bg-[hsla(0,0%,100%,0.03)] p-1" role="radiogroup" aria-label="Filter by rarity">
          {RARITY_FILTERS.map((r) => (
            <button
              key={r.value}
              role="radio"
              aria-checked={rarityFilter === r.value}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                rarityFilter === r.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setRarityFilter(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Trophy className="size-12 opacity-30" />
          <span className="text-sm">
            {totalUnlocked === 0
              ? "Start playing to unlock your first achievement!"
              : "No achievements match the current filters."}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {filtered.map((achievement) => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              highlighted={highlightId === achievement.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
