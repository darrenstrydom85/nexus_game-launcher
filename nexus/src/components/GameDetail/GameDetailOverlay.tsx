import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore, type Game, type GameSource } from "@/stores/gameStore";
import { X } from "lucide-react";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

interface GameDetailOverlayProps {
  children?: (game: Game) => React.ReactNode;
}

export function GameDetailOverlay({ children }: GameDetailOverlayProps) {
  const detailOverlayGameId = useUiStore((s) => s.detailOverlayGameId);
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const games = useGameStore((s) => s.games);

  const game = React.useMemo(
    () => games.find((g) => g.id === detailOverlayGameId) ?? null,
    [games, detailOverlayGameId],
  );

  const close = React.useCallback(() => {
    setDetailOverlayGameId(null);
  }, [setDetailOverlayGameId]);

  React.useEffect(() => {
    if (!game) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [game, close]);

  React.useEffect(() => {
    if (game) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [game]);

  return (
    <AnimatePresence>
      {game && (
        <motion.div
          data-testid="detail-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Backdrop */}
          <motion.div
            data-testid="detail-overlay-backdrop"
            className="glass-overlay absolute inset-0"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Content panel */}
          <motion.div
            data-testid="detail-overlay-panel"
            className={cn(
              "relative z-10 flex h-full w-full flex-col overflow-hidden",
              "bg-background",
            )}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{
              type: "spring",
              duration: 0.4,
              bounce: 0.1,
            }}
          >
            {/* Close button */}
            <button
              data-testid="detail-overlay-close"
              className={cn(
                "absolute right-4 top-4 z-20 flex size-9 items-center justify-center rounded-full",
                "bg-black/40 text-white/80 backdrop-blur-sm",
                "transition-colors hover:bg-black/60 hover:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={close}
              aria-label="Close detail overlay"
            >
              <X className="size-4" />
            </button>

            {/* Hero banner — top 40% */}
            <div
              data-testid="detail-overlay-hero"
              className="relative h-[40%] shrink-0 overflow-hidden"
            >
              {game.heroUrl ? (
                <img
                  src={game.heroUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/20 to-background" />
              )}

              {/* Gradient fade */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

              {/* Hero overlay info */}
              <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-6">
                {game.logoUrl ? (
                  <img
                    src={game.logoUrl}
                    alt={game.name}
                    className="max-h-20 object-contain drop-shadow-lg"
                  />
                ) : (
                  <h1
                    data-testid="detail-overlay-title"
                    className="text-4xl font-bold tracking-tight text-white drop-shadow-lg"
                  >
                    {game.name}
                  </h1>
                )}
                <span
                  data-testid="detail-overlay-source"
                  className="mb-1 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                >
                  {SOURCE_LABELS[game.source]}
                </span>
              </div>
            </div>

            {/* Scrollable content area */}
            <div
              data-testid="detail-overlay-content"
              className="flex-1 overflow-y-auto"
            >
              {children?.(game)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
