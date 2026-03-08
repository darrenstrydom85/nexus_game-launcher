import { motion } from "motion/react";
import { formatPlayTime } from "@/lib/utils";
import { resolveUrl } from "@/lib/url";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { WrappedGame } from "@/types/wrapped";

interface PodiumVisualProps {
  topGames: WrappedGame[];
  isVisible: boolean;
}

const RANK_CONFIG = [
  { rank: 1, label: "1st", color: "#EAB308", coverW: 120, pedestalH: 64 },
  { rank: 2, label: "2nd", color: "#94A3B8", coverW: 88, pedestalH: 48 },
  { rank: 3, label: "3rd", color: "#CD7F32", coverW: 88, pedestalH: 36 },
] as const;

const DISPLAY_ORDER = [1, 0, 2] as const;

export function PodiumVisual({ topGames, isVisible }: PodiumVisualProps) {
  const shouldReduceMotion = useReducedMotion();
  const games = topGames.slice(0, 3);

  if (games.length === 0) return null;

  const animationOrder = games.length === 3 ? [1, 0, 2] : [0, 1, 2];

  const items = (games.length >= 3 ? DISPLAY_ORDER : [0, 1, 2])
    .slice(0, games.length)
    .map((gameIdx) => {
      const game = games[gameIdx];
      if (!game) return null;
      const config = RANK_CONFIG[gameIdx];
      const staggerIdx = animationOrder.indexOf(gameIdx);
      return { game, config, staggerIdx };
    })
    .filter(Boolean) as { game: WrappedGame; config: typeof RANK_CONFIG[number]; staggerIdx: number }[];

  return (
    <div
      data-testid="podium-visual"
      className="flex items-end justify-center gap-4"
    >
      {items.map(({ game, config, staggerIdx }) => {
        const coverUrl = resolveUrl(game.coverUrl);
        const coverH = Math.round(config.coverW * 1.5);

        return (
          <motion.div
            key={game.id}
            data-testid={`podium-position-${config.rank}`}
            className="flex flex-col items-center"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.15 }
                : { duration: 0.2, delay: staggerIdx * 0.1, ease: "easeOut" }
            }
          >
            {/* Cover art */}
            <div
              className="overflow-hidden rounded-lg bg-card"
              style={{ width: config.coverW, height: coverH }}
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={`${config.label} place: ${game.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted px-2">
                  <span className="truncate text-center text-xs text-muted-foreground">
                    {game.name}
                  </span>
                </div>
              )}
            </div>

            {/* Play time */}
            <span className="mt-1.5 text-xs font-medium tabular-nums text-muted-foreground">
              {formatPlayTime(game.playTimeS)}
            </span>

            {/* Pedestal */}
            <div
              className="mt-1 flex w-full items-center justify-center rounded-md border-t-2 bg-card/60 backdrop-blur-sm"
              style={{
                height: config.pedestalH,
                borderTopColor: config.color,
                width: config.coverW,
              }}
            >
              <span
                className="text-sm font-bold"
                style={{ color: config.color }}
              >
                {config.label}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
