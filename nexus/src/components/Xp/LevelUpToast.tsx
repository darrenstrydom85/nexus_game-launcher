import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { X, Star } from "lucide-react";
import { useXpStore } from "@/stores/xpStore";

const AUTO_DISMISS_MS = 6000;

export function LevelUpToast() {
  const pendingLevelUp = useXpStore((s) => s.pendingLevelUp);
  const dismissLevelUp = useXpStore((s) => s.dismissLevelUp);

  React.useEffect(() => {
    if (!pendingLevelUp) return;
    const timer = setTimeout(dismissLevelUp, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [pendingLevelUp, dismissLevelUp]);

  const prefersReduced = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  return (
    <AnimatePresence>
      {pendingLevelUp && (
        <motion.div
          data-testid="level-up-toast"
          className={cn(
            "glass-toast flex w-80 items-start gap-3 rounded-lg border-l-2 border-l-primary p-3 shadow-lg",
          )}
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
        >
          <div className="mt-0.5 shrink-0">
            <Star className="size-5 text-primary" aria-hidden />
          </div>

          <div className="flex flex-1 flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">
              Level Up!
            </p>
            <p className="text-xs text-muted-foreground">
              You&apos;re now Level {pendingLevelUp.level}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground/70">
              {pendingLevelUp.totalXp.toLocaleString()} total XP
            </p>
          </div>

          <button
            className={cn(
              "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={dismissLevelUp}
            aria-label="Dismiss level up notification"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
