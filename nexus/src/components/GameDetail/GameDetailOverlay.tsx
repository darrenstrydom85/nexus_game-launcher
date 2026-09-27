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

              {/* Scrims (Backdrop voice) */}
              <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/10 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />

              {/* Hero overlay info */}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-8 px-10 pb-7">
                <div className="flex min-w-0 flex-col gap-2">
                  <p
                    data-testid="detail-overlay-source"
                    className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
                  >
                    {[
                      SOURCE_LABELS[game.source],
                      game.genres.slice(0, 3).join(", ") || null,
                      game.releaseDate ? new Date(game.releaseDate).getFullYear() : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <h1
                    data-testid="detail-overlay-title"
                    className="font-display truncate text-[68px] font-bold uppercase leading-[0.95] tracking-tight text-foreground drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
                  >
                    {game.name}
                  </h1>
                </div>
                <div className="flex shrink-0 gap-9 pb-2 text-right">
                  <div>
                    <p className="font-display text-3xl font-bold leading-none text-foreground">
                      {game.totalPlayTimeS > 0
                        ? `${Math.floor(game.totalPlayTimeS / 3600)}:${String(Math.floor((game.totalPlayTimeS % 3600) / 60)).padStart(2, "0")}`
                        : "0:00"}
                    </p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Hours</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl font-bold leading-none text-foreground">
                      {game.playCount}
                    </p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Sessions</p>
                  </div>
                  {game.criticScore != null && game.criticScore > 0 && (
                    <div>
                      <p className="font-display text-3xl font-bold leading-none text-foreground">
                        {Math.round(game.criticScore)}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Critic</p>
                    </div>
                  )}
                  {game.progress != null && game.progress > 0 && (
                    <div>
                      <p
                        className="font-display text-3xl font-bold leading-none"
                        style={{ color: "var(--primary)" }}
                      >
                        {game.progress}%
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Complete</p>
                    </div>
                  )}
                </div>
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
