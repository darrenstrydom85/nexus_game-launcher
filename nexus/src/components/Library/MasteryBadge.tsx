import { cn } from "@/lib/utils";
import { formatPlayTime } from "@/lib/utils";
import { Shield } from "lucide-react";
import { useMasteryStore } from "@/stores/masteryStore";
import type { MasteryTierValue } from "@/lib/tauri";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TIER_COLORS: Record<Exclude<MasteryTierValue, "none">, string> = {
  bronze: "var(--tier-bronze)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
  platinum: "var(--tier-platinum)",
  diamond: "var(--tier-diamond)",
};

const TIER_LABELS: Record<Exclude<MasteryTierValue, "none">, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
};

interface MasteryBadgeProps {
  gameId: string;
  size?: "card" | "detail";
}

export function MasteryBadge({ gameId, size = "card" }: MasteryBadgeProps) {
  const mastery = useMasteryStore((s) => s.tiers.get(gameId));

  if (!mastery || mastery.tier === "none") return null;

  const color = TIER_COLORS[mastery.tier];
  const label = TIER_LABELS[mastery.tier];
  const px = size === "card" ? 20 : 32;
  const iconPx = size === "card" ? 12 : 20;

  const progressPct = Math.round(mastery.progressToNextTier * 100);
  const playTimeStr = formatPlayTime(mastery.totalPlayTimeS);

  const nextTierLabel =
    mastery.tier !== "diamond"
      ? TIER_LABELS[
          (
            {
              bronze: "silver",
              silver: "gold",
              gold: "platinum",
              platinum: "diamond",
            } as const
          )[mastery.tier as Exclude<MasteryTierValue, "none" | "diamond">]
        ]
      : null;

  const tooltipText = nextTierLabel
    ? `${label} — ${playTimeStr} played — ${progressPct}% to ${nextTierLabel}`
    : `${label} — ${playTimeStr} played`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-testid={`mastery-badge-${gameId}`}
            className={cn(
              "relative flex items-center justify-center overflow-hidden rounded-md",
              "bg-black/50 backdrop-blur-[4px]",
            )}
            style={{
              width: px,
              height: px,
              border: `1px solid ${color}`,
            }}
            aria-label={`${label} mastery tier`}
          >
            <Shield
              className="relative z-10"
              style={{ width: iconPx, height: iconPx, color }}
              fill={color}
              fillOpacity={0.3}
            />
            {mastery.tier === "diamond" && (
              <div
                className="animate-diamond-shimmer pointer-events-none absolute inset-0 z-20"
                style={{
                  background: `linear-gradient(120deg, transparent 30%, rgba(185, 242, 255, 0.4) 50%, transparent 70%)`,
                }}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { TIER_COLORS, TIER_LABELS };
