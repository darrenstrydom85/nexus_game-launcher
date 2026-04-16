import * as React from "react";
import { motion } from "motion/react";
import * as LucideIcons from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NewlyUnlocked, AchievementRarity } from "@/lib/tauri";

const AUTO_DISMISS_MS = 6000;

const RARITY_COLORS: Record<AchievementRarity, string> = {
  common: "var(--rarity-common)",
  uncommon: "var(--rarity-uncommon)",
  rare: "var(--rarity-rare)",
  epic: "var(--rarity-epic)",
  legendary: "var(--rarity-legendary)",
};

function getIcon(iconName: string) {
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string }>
  >;
  return icons[iconName] ?? LucideIcons.Trophy;
}

interface AchievementUnlockNotificationProps {
  achievement: NewlyUnlocked;
  onDismiss: () => void;
  onClick: () => void;
}

export function AchievementUnlockNotification({
  achievement,
  onDismiss,
  onClick,
}: AchievementUnlockNotificationProps) {
  const [progress, setProgress] = React.useState(100);

  React.useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100));
    }, 50);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [onDismiss]);

  const prefersReduced = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const Icon = getIcon(achievement.icon);
  const rarityColor = RARITY_COLORS[achievement.rarity];

  return (
    <motion.div
      data-testid={`achievement-notification-${achievement.id}`}
      className={cn(
        "glass-toast relative flex w-80 cursor-pointer flex-col gap-2 overflow-hidden rounded-lg p-4 shadow-lg",
      )}
      style={{ borderLeft: `3px solid ${rarityColor}` }}
      initial={
        prefersReduced ? { opacity: 0 } : { opacity: 0, x: 60, scale: 0.9 }
      }
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={
        prefersReduced ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.95 }
      }
      transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
      onClick={onClick}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-[hsla(0,0%,100%,0.08)]"
          style={{ color: rarityColor }}
        >
          <Icon className="size-5" />
        </div>

        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Achievement Unlocked!
          </span>
          <span className="text-sm font-bold text-foreground">
            {achievement.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {achievement.description}
          </span>
        </div>

        <button
          className={cn(
            "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss achievement notification"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: rarityColor,
            backgroundColor: `color-mix(in srgb, ${rarityColor} 12%, transparent)`,
          }}
        >
          +{achievement.points} XP
        </span>
      </div>

      <div className="absolute bottom-0 left-0 h-0.5 w-full bg-[hsla(0,0%,100%,0.05)]">
        <div
          className="h-full transition-[width] duration-100"
          style={{
            width: `${progress}%`,
            backgroundColor: rarityColor,
          }}
        />
      </div>
    </motion.div>
  );
}
