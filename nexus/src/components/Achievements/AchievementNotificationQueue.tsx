import * as React from "react";
import { AnimatePresence } from "motion/react";
import { Trophy } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useAchievementStore } from "@/stores/achievementStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { AchievementUnlockNotification } from "./AchievementUnlockNotification";

const BULK_THRESHOLD = 5;

let audioCache: HTMLAudioElement | null = null;

function playAchievementSound() {
  try {
    if (!audioCache) {
      // Falls back to milestone sound if achievement.mp3 is not shipped yet
      audioCache = new Audio("/sounds/achievement.mp3");
      audioCache.volume = 0.45;
      audioCache.onerror = () => {
        audioCache = new Audio("/sounds/milestone.mp3");
        audioCache.volume = 0.45;
      };
    }
    audioCache.currentTime = 0;
    audioCache.play().catch(() => {});
  } catch {
    // autoplay restriction — silent fail
  }
}

export function AchievementNotificationQueue() {
  const pendingNotifications = useAchievementStore(
    (s) => s.pendingNotifications,
  );
  const dismissNotification = useAchievementStore(
    (s) => s.dismissNotification,
  );
  const setHighlightId = useAchievementStore((s) => s.setHighlightId);
  const setActiveNav = useUiStore((s) => s.setActiveNav);
  const notificationsEnabled = useSettingsStore(
    (s) => s.achievementNotificationsEnabled,
  );
  const soundsEnabled = useSettingsStore((s) => s.achievementSoundsEnabled);

  const [showBulkSummary, setShowBulkSummary] = React.useState(false);
  const [bulkCount, setBulkCount] = React.useState(0);

  const isBulk = pendingNotifications.length > BULK_THRESHOLD;
  const current = !isBulk ? pendingNotifications[0] : null;

  React.useEffect(() => {
    if (isBulk && !showBulkSummary) {
      setBulkCount(pendingNotifications.length);
      setShowBulkSummary(true);
      // Clear all individual notifications for bulk
      for (let i = 0; i < pendingNotifications.length; i++) {
        dismissNotification();
      }
    }
  }, [isBulk, showBulkSummary, pendingNotifications.length, dismissNotification]);

  React.useEffect(() => {
    if (current && soundsEnabled) {
      playAchievementSound();
    }
  }, [current?.id, soundsEnabled]);

  if (!notificationsEnabled) return null;

  const navigateToGallery = (achievementId?: string) => {
    if (achievementId) {
      setHighlightId(achievementId);
    }
    setActiveNav("achievements");
    if (current) dismissNotification();
    if (showBulkSummary) setShowBulkSummary(false);
  };

  return (
    <div
      data-testid="achievement-notification-queue"
      className="fixed right-4 top-14 z-30 flex flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence mode="wait">
        {showBulkSummary && (
          <BulkSummaryNotification
            key="bulk"
            count={bulkCount}
            onDismiss={() => setShowBulkSummary(false)}
            onClick={() => navigateToGallery()}
          />
        )}
        {current && !showBulkSummary && (
          <AchievementUnlockNotification
            key={current.id}
            achievement={current}
            onDismiss={dismissNotification}
            onClick={() => navigateToGallery(current.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BulkSummaryNotification({
  count,
  onDismiss,
  onClick,
}: {
  count: number;
  onDismiss: () => void;
  onClick: () => void;
}) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const prefersReduced = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  return (
    <motion.div
      data-testid="achievement-bulk-notification"
      className={cn(
        "glass-toast flex w-80 cursor-pointer items-start gap-3 rounded-lg border-l-[3px] border-l-[var(--rarity-legendary)] p-4 shadow-lg",
      )}
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
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[hsla(0,0%,100%,0.08)] text-[var(--rarity-legendary)]">
        <Trophy className="size-5" />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-foreground">
          Welcome! You've unlocked {count} achievements
        </span>
        <span className="text-xs text-muted-foreground">
          Based on your gaming history. View your collection.
        </span>
      </div>
    </motion.div>
  );
}
