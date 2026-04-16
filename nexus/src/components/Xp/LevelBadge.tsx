import { cn } from "@/lib/utils";
import { useXpStore } from "@/stores/xpStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RING_SIZE = 40;
const STROKE_WIDTH = 3;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface LevelBadgeProps {
  sidebarOpen: boolean;
  onClick?: () => void;
}

export function LevelBadge({ sidebarOpen, onClick }: LevelBadgeProps) {
  const summary = useXpStore((s) => s.summary);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const level = summary?.currentLevel ?? 0;
  const progress = summary?.progressToNextLevel ?? 0;
  const currentLevelXp = summary?.currentLevelXp ?? 0;
  const nextLevelXp = summary?.nextLevelXp ?? 100;
  const totalXp = summary?.totalXp ?? 0;

  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const tooltipText = `Level ${level} — ${currentLevelXp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP to next level`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-testid="level-badge"
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={onClick}
            aria-label={`Level ${level}, ${totalXp.toLocaleString()} total XP`}
          >
            <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
              <svg
                width={RING_SIZE}
                height={RING_SIZE}
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                className="-rotate-90"
              >
                {/* Background ring */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE_WIDTH}
                  className="text-muted-foreground/20"
                />
                {/* Progress ring */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  className={cn(
                    "text-primary",
                    !reducedMotion && "transition-[stroke-dashoffset] duration-500 ease-out",
                  )}
                />
              </svg>
              <span
                className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-foreground"
                aria-hidden
              >
                {level}
              </span>
            </div>
            {sidebarOpen && (
              <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-tight">
                <span className="text-sm font-medium tabular-nums text-foreground">
                  Level {level}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {totalXp.toLocaleString()} XP
                </span>
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
