import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSyncStore } from "@/stores/syncStore";
import { cn } from "@/lib/utils";

const FADE_FAST_MS = 200;

export interface SyncActivityDotProps {
  dismissed: boolean;
  onRestore: () => void;
}

export function SyncActivityDot({ dismissed, onRestore }: SyncActivityDotProps) {
  const isActive = useSyncStore((s) => s.isActive);
  const overallCompleted = useSyncStore((s) => s.overallCompleted);
  const overallTotal = useSyncStore((s) => s.overallTotal);

  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const show = isActive && dismissed;
  const duration = prefersReducedMotion ? 0 : FADE_FAST_MS / 1000;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
          data-testid="sync-activity-dot-wrapper"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Syncing library in the background"
                className={cn(
                  "size-2 rounded-full bg-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
                  !prefersReducedMotion && "animate-play-pulse",
                )}
                onClick={onRestore}
                data-testid="sync-activity-dot"
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>Syncing library in the background</p>
              <p className="text-muted-foreground text-xs">
                Fetching metadata… {overallCompleted}/{overallTotal}
              </p>
            </TooltipContent>
          </Tooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
