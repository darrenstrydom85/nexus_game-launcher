import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { MilestoneIcon } from "./MilestoneIcon";
import type { SessionMilestone } from "@/lib/tauri";

const AUTO_DISMISS_MS = 5000;

interface MilestoneToastProps {
  milestone: SessionMilestone;
  onDismiss: () => void;
  index: number;
}

export function MilestoneToast({
  milestone,
  onDismiss,
  index,
}: MilestoneToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
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
      data-testid={`milestone-toast-${milestone.id}`}
      className={cn(
        "glass-toast flex w-80 items-start gap-3 rounded-lg border-l-2 border-l-primary p-3 shadow-lg",
      )}
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      transition={{
        duration: 0.3,
        ease: [0, 0, 0.2, 1],
        delay: index * 0.2,
      }}
      layout
    >
      <div className="mt-0.5 shrink-0 text-primary">
        <MilestoneIcon name={milestone.icon} />
      </div>

      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-sm font-semibold text-foreground">
          {milestone.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {milestone.description}
        </p>
        {milestone.gameName && (
          <p className="text-xs text-muted-foreground/70">
            {milestone.gameName}
          </p>
        )}
      </div>

      <button
        className={cn(
          "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={onDismiss}
        aria-label="Dismiss milestone notification"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}
