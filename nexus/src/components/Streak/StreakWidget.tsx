import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
import { useStreakStore } from "@/stores/streakStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type StreakIntensity = "none" | "ember" | "blaze" | "inferno";

function getIntensity(days: number): StreakIntensity {
  if (days <= 0) return "none";
  if (days < 7) return "ember";
  if (days < 30) return "blaze";
  return "inferno";
}

interface StreakWidgetProps {
  sidebarOpen: boolean;
  onNavigateToStats?: () => void;
}

export function StreakWidget({ sidebarOpen, onNavigateToStats }: StreakWidgetProps) {
  const streak = useStreakStore((s) => s.streak);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const currentStreak = streak?.currentStreak ?? 0;
  const intensity = getIntensity(currentStreak);

  const tooltipText =
    currentStreak > 0
      ? "Play any game to continue your streak"
      : "Play a game to start a streak";

  const label =
    currentStreak === 0
      ? "Start a streak!"
      : currentStreak === 1
        ? "1 day streak"
        : `${currentStreak} days`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-testid="streak-widget"
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "mx-2",
            )}
            onClick={onNavigateToStats}
            aria-label={`Current streak: ${label}`}
          >
            <Flame
              className={cn(
                "size-4 shrink-0 transition-colors duration-200",
                intensity === "none" && "text-muted-foreground/50",
                intensity === "ember" && "text-yellow-500",
                intensity === "blaze" && "text-orange-400",
                intensity === "inferno" && "text-primary",
                !reducedMotion && intensity === "blaze" && "animate-streak-flicker",
                !reducedMotion && intensity === "inferno" && "animate-streak-inferno",
              )}
              aria-hidden
            />
            {sidebarOpen && (
              <span
                className={cn(
                  "flex-1 text-left tabular-nums",
                  currentStreak === 0 && "text-muted-foreground/60",
                )}
              >
                {label}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
