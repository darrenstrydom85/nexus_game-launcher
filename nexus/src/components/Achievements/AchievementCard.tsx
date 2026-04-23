import * as React from "react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import type { AchievementStatus, AchievementRarity } from "@/lib/tauri";

const RARITY_COLORS: Record<AchievementRarity, string> = {
  common: "var(--rarity-common)",
  uncommon: "var(--rarity-uncommon)",
  rare: "var(--rarity-rare)",
  epic: "var(--rarity-epic)",
  legendary: "var(--rarity-legendary)",
};

const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

function getIcon(iconName: string) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] ?? LucideIcons.Trophy;
}

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffS = Math.floor(diffMs / 1000);
  const diffM = Math.floor(diffS / 60);
  const diffH = Math.floor(diffM / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffD > 30) {
    const months = Math.floor(diffD / 30);
    return `${months}mo ago`;
  }
  if (diffD > 0) return `${diffD}d ago`;
  if (diffH > 0) return `${diffH}h ago`;
  if (diffM > 0) return `${diffM}m ago`;
  return "Just now";
}

interface AchievementCardProps {
  achievement: AchievementStatus;
  highlighted?: boolean;
}

export function AchievementCard({ achievement, highlighted }: AchievementCardProps) {
  const Icon = getIcon(achievement.icon);
  const rarityColor = RARITY_COLORS[achievement.rarity];
  const isUnlocked = achievement.unlocked;

  let context: string | null = null;
  if (achievement.contextJson) {
    try {
      const parsed = JSON.parse(achievement.contextJson);
      if (parsed.gameName) context = `While playing ${parsed.gameName}`;
      else if (parsed.streakDays) context = `${parsed.streakDays}-day streak`;
      else if (parsed.totalHours) context = `${parsed.totalHours} hours played`;
      else if (parsed.gameCount) context = `${parsed.gameCount} games`;
      else if (parsed.completedCount) context = `${parsed.completedCount} games completed`;
      else if (parsed.sessionCount) context = `${parsed.sessionCount} sessions`;
    } catch {
      // ignore malformed context
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-lg border px-4 py-4 backdrop-blur-sm transition-all duration-200",
        isUnlocked
          ? "border-border bg-card text-card-foreground shadow-sm ring-1 ring-border/60 dark:ring-white/10"
          : "border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground",
        isUnlocked && "hover:animate-achievement-glow",
        highlighted && "animate-achievement-highlight",
      )}
      style={
        {
          "--glow-color": isUnlocked ? rarityColor : undefined,
        } as React.CSSProperties
      }
      data-unlocked={isUnlocked ? "true" : "false"}
      data-testid={`achievement-card-${achievement.id}`}
      aria-label={isUnlocked ? `${achievement.name}, unlocked` : `${achievement.name}, locked`}
    >
      {isUnlocked && (
        <div
          className="pointer-events-none absolute bottom-3 left-0 top-3 w-1 rounded-full"
          style={{ backgroundColor: rarityColor }}
          aria-hidden
        />
      )}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-lg",
            isUnlocked ? "bg-primary/10" : "bg-muted/80",
          )}
          style={isUnlocked ? { color: rarityColor } : { color: "var(--muted-foreground)" }}
        >
          <Icon className="size-5" />
          {!isUnlocked && (
            <LucideIcons.Lock
              className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-muted p-0.5 text-muted-foreground ring-1 ring-border"
              aria-hidden
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {isUnlocked && (
              <LucideIcons.Check
                className="size-4 shrink-0 text-primary"
                aria-hidden
              />
            )}
            <span
              className={cn(
                "min-w-0 truncate leading-tight",
                isUnlocked ? "text-sm font-semibold text-foreground" : "text-sm font-medium text-muted-foreground",
              )}
            >
              {achievement.name}
            </span>
          </span>
          <span
            className={cn(
              "text-xs leading-relaxed",
              isUnlocked ? "text-muted-foreground" : "text-muted-foreground/90",
            )}
          >
            {achievement.description}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              !isUnlocked && "bg-muted text-muted-foreground",
            )}
            style={
              isUnlocked
                ? {
                    color: rarityColor,
                    backgroundColor: `color-mix(in srgb, ${rarityColor} 12%, transparent)`,
                  }
                : undefined
            }
          >
            {RARITY_LABELS[achievement.rarity]}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {achievement.points} XP
          </span>
        </div>

        {isUnlocked && achievement.unlockedAt && (
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(achievement.unlockedAt)}
          </span>
        )}
      </div>

      {isUnlocked && context && (
        <span className="text-[10px] italic text-muted-foreground">{context}</span>
      )}
    </div>
  );
}
