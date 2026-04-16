import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPlayTime } from "@/lib/utils";
import { useMasteryStore } from "@/stores/masteryStore";
import { TIER_COLORS, TIER_LABELS } from "@/components/Library/MasteryBadge";
import type { MasteryTierValue } from "@/lib/tauri";

type ActiveTier = Exclude<MasteryTierValue, "none">;

const NEXT_TIER: Partial<Record<ActiveTier, ActiveTier>> = {
  bronze: "silver",
  silver: "gold",
  gold: "platinum",
  platinum: "diamond",
};

interface MasteryTierDetailProps {
  gameId: string;
}

export function MasteryTierDetail({ gameId }: MasteryTierDetailProps) {
  const mastery = useMasteryStore((s) => s.tiers.get(gameId));

  if (!mastery || mastery.tier === "none") return null;

  const tier = mastery.tier as ActiveTier;
  const color = TIER_COLORS[tier];
  const label = TIER_LABELS[tier];
  const playTimeStr = formatPlayTime(mastery.totalPlayTimeS);
  const progressPct = Math.round(mastery.progressToNextTier * 100);
  const nextTier = NEXT_TIER[tier];
  const nextColor = nextTier ? TIER_COLORS[nextTier] : color;

  return (
    <div
      data-testid={`mastery-detail-${gameId}`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-md",
            "bg-black/50 backdrop-blur-[4px]",
          )}
          style={{
            width: 32,
            height: 32,
            border: `1px solid ${color}`,
          }}
        >
          <Shield
            className="relative z-10"
            style={{ width: 20, height: 20, color }}
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

        <div className="flex flex-col">
          <span className="text-sm font-semibold" style={{ color }}>
            {label}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {playTimeStr} played
          </span>
        </div>
      </div>

      {nextTier && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress to {TIER_LABELS[nextTier]}</span>
            <span className="tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${progressPct}%`,
                background: `linear-gradient(to right, ${color}, ${nextColor})`,
              }}
            />
          </div>
        </div>
      )}

      {mastery.tier === "diamond" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Maximum tier achieved
        </p>
      )}
    </div>
  );
}
