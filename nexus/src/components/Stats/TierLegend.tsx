import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import { Shield, X } from "lucide-react";
import { useMasteryStore } from "@/stores/masteryStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { TIER_COLORS, TIER_LABELS } from "@/components/Library/MasteryBadge";
import type { MasteryTierValue, GameMasteryTier } from "@/lib/tauri";

const TIER_ORDER: Exclude<MasteryTierValue, "none">[] = [
  "diamond",
  "platinum",
  "gold",
  "silver",
  "bronze",
];

const TIER_THRESHOLDS: Record<Exclude<MasteryTierValue, "none">, string> = {
  bronze: "1h – 10h",
  silver: "10h – 25h",
  gold: "25h – 50h",
  platinum: "50h – 100h",
  diamond: "100h+",
};

interface TierGameEntry {
  id: string;
  name: string;
  coverUrl: string | null;
  totalPlayTimeS: number;
}

function TierCard({
  tier,
  count,
  onClick,
}: {
  tier: Exclude<MasteryTierValue, "none">;
  count: number;
  onClick: () => void;
}) {
  const color = TIER_COLORS[tier];

  return (
    <button
      data-testid={`tier-card-${tier}`}
      className={cn(
        "group flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4",
        "transition-all duration-200 ease-out",
        "hover:border-transparent hover:shadow-[0_0_16px_var(--glow)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        count === 0 && "pointer-events-none opacity-40",
      )}
      style={
        count > 0
          ? { "--glow": color + "30" } as React.CSSProperties
          : undefined
      }
      onClick={onClick}
      disabled={count === 0}
    >
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-md",
          "bg-black/40 backdrop-blur-[4px]",
        )}
        style={{ width: 40, height: 40, border: `1px solid ${color}` }}
      >
        <Shield
          style={{ width: 24, height: 24, color }}
          fill={color}
          fillOpacity={0.3}
        />
        {tier === "diamond" && count > 0 && (
          <div
            className="animate-diamond-shimmer pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(120deg, transparent 30%, rgba(185, 242, 255, 0.4) 50%, transparent 70%)`,
            }}
          />
        )}
      </div>
      <span className="text-sm font-semibold" style={{ color }}>
        {TIER_LABELS[tier]}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {TIER_THRESHOLDS[tier]}
      </span>
      <span className="text-lg font-bold tabular-nums text-foreground">
        {count}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {count === 1 ? "game" : "games"}
      </span>
    </button>
  );
}

function TierModal({
  tier,
  games,
  onClose,
  onGameClick,
}: {
  tier: Exclude<MasteryTierValue, "none">;
  games: TierGameEntry[];
  onClose: () => void;
  onGameClick: (gameId: string) => void;
}) {
  const color = TIER_COLORS[tier];
  const backdropRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const sorted = React.useMemo(
    () => [...games].sort((a, b) => b.totalPlayTimeS - a.totalPlayTimeS),
    [games],
  );

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-40 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="glass-overlay absolute inset-0" />

      <div
        data-testid={`tier-modal-${tier}`}
        className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Shield
            style={{ width: 24, height: 24, color }}
            fill={color}
            fillOpacity={0.3}
          />
          <div className="flex-1">
            <h2 className="text-base font-bold" style={{ color }}>
              {TIER_LABELS[tier]}
            </h2>
            <p className="text-xs text-muted-foreground">
              {TIER_THRESHOLDS[tier]} — {games.length}{" "}
              {games.length === 1 ? "game" : "games"}
            </p>
          </div>
          <button
            className={cn(
              "flex size-8 items-center justify-center rounded-full",
              "bg-secondary text-muted-foreground",
              "transition-colors hover:bg-secondary/80 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Game list */}
        <div className="flex-1 overflow-y-auto p-2">
          {sorted.map((game) => (
            <button
              key={game.id}
              data-testid={`tier-modal-game-${game.id}`}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
                "text-left transition-colors",
                "hover:bg-secondary/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={() => onGameClick(game.id)}
            >
              {game.coverUrl ? (
                <img
                  src={game.coverUrl}
                  alt={game.name}
                  className="size-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Shield
                    style={{ width: 16, height: 16, color }}
                    fill={color}
                    fillOpacity={0.3}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {game.name}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular-nums font-medium text-muted-foreground">
                {formatPlayTime(game.totalPlayTimeS)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TierLegend() {
  const tiers = useMasteryStore((s) => s.tiers);
  const games = useGameStore((s) => s.games);
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const [selectedTier, setSelectedTier] = React.useState<
    Exclude<MasteryTierValue, "none"> | null
  >(null);

  const tierMap = React.useMemo(() => {
    const map: Record<string, GameMasteryTier[]> = {
      bronze: [],
      silver: [],
      gold: [],
      platinum: [],
      diamond: [],
    };
    for (const entry of tiers.values()) {
      if (entry.tier !== "none" && map[entry.tier]) {
        map[entry.tier].push(entry);
      }
    }
    return map;
  }, [tiers]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const tier of TIER_ORDER) {
      c[tier] = tierMap[tier].length;
    }
    return c;
  }, [tierMap]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const modalGames: TierGameEntry[] = React.useMemo(() => {
    if (!selectedTier) return [];
    const entries = tierMap[selectedTier] ?? [];
    return entries.map((entry) => {
      const game = games.find((g) => g.id === entry.gameId);
      return {
        id: entry.gameId,
        name: game?.name ?? "Unknown",
        coverUrl: game?.coverUrl ?? null,
        totalPlayTimeS: entry.totalPlayTimeS,
      };
    });
  }, [selectedTier, tierMap, games]);

  return (
    <>
      <div data-testid="tier-legend" className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Mastery Tiers
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {TIER_ORDER.map((tier) => (
            <TierCard
              key={tier}
              tier={tier}
              count={counts[tier] ?? 0}
              onClick={() => setSelectedTier(tier)}
            />
          ))}
        </div>
      </div>

      {selectedTier && (
        <TierModal
          tier={selectedTier}
          games={modalGames}
          onClose={() => setSelectedTier(null)}
          onGameClick={(gameId) => {
            setSelectedTier(null);
            setDetailOverlayGameId(gameId);
          }}
        />
      )}
    </>
  );
}
