import { Shield, Sparkles } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import { TIER_COLORS, TIER_LABELS } from "@/components/Library/MasteryBadge";
import type { GameCeremonyData, MasteryTierValue } from "@/lib/tauri";

interface CeremonyMasteryCardProps {
  data: GameCeremonyData;
}

type ActiveTier = Exclude<MasteryTierValue, "none">;

export function CeremonyMasteryCard({ data }: CeremonyMasteryCardProps) {
  const tier = data.masteryTier;
  if (tier === "none") {
    return (
      <div
        data-testid="ceremony-mastery-card"
        className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8 text-center"
      >
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
          <Shield className="size-4" />
          Mastery
        </div>
        <h2 className="max-w-2xl text-3xl font-bold text-foreground">
          A quick visit
        </h2>
        <p className="max-w-lg text-base text-muted-foreground">
          You didn't unlock a mastery tier with this one — but every game in
          your library has its own story to tell.
        </p>
      </div>
    );
  }

  const activeTier = tier as ActiveTier;
  const color = TIER_COLORS[activeTier];
  const label = TIER_LABELS[activeTier];
  const isDiamond = activeTier === "diamond";

  return (
    <div
      data-testid="ceremony-mastery-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8 text-center"
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
        <Shield className="size-4" />
        Mastery Achieved
      </div>

      <div
        className="relative flex items-center justify-center overflow-hidden rounded-2xl"
        style={{
          width: 144,
          height: 144,
          border: `2px solid ${color}`,
          background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
          boxShadow: `0 0 48px ${color}55`,
        }}
      >
        <Shield
          style={{
            width: 84,
            height: 84,
            color,
          }}
          fill={color}
          fillOpacity={0.3}
        />
        {isDiamond && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(120deg, transparent 30%, rgba(185, 242, 255, 0.5) 50%, transparent 70%)`,
            }}
          />
        )}
      </div>

      <div>
        <h2
          className="text-4xl font-bold"
          style={{ color }}
        >
          {label}
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          {formatPlayTime(data.totalPlayTimeS)} of dedication
        </p>
      </div>

      {isDiamond && (
        <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-2 text-sm font-semibold text-yellow-300">
          <Sparkles className="size-4" />
          Maximum tier achieved
        </div>
      )}
    </div>
  );
}
