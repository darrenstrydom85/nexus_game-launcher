import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGameStore, type Game, type GameSource, type GameStatus } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { X, Dices } from "lucide-react";
import { RouletteSpinner } from "./RouletteSpinner";
import { PickerResult } from "./PickerResult";

export interface PickerFilters {
  genres: string[];
  statuses: GameStatus[];
  sources: GameSource[];
  minRating: number | null;
}

type PickerPhase = "filters" | "spinning" | "result";

interface RandomPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPlay?: (game: Game) => void;
  onViewDetails?: (game: Game) => void;
}

export function RandomPickerModal({
  open,
  onClose,
  onPlay,
  onViewDetails,
}: RandomPickerModalProps) {
  const games = useGameStore((s) => s.games);
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const [phase, setPhase] = React.useState<PickerPhase>("filters");
  const [filters] = React.useState<PickerFilters>({
    genres: [], statuses: [], sources: [], minRating: null,
  });
  const [excludedIds, setExcludedIds] = React.useState<Set<string>>(new Set());
  const [pickedGame, setPickedGame] = React.useState<Game | null>(null);

  React.useEffect(() => {
    if (open) {
      setPhase("filters");
      setExcludedIds(new Set());
      setPickedGame(null);
    }
  }, [open]);

  const pool = React.useMemo(() => {
    return games.filter((g) => {
      if (hiddenGameIds.includes(g.id)) return false;
      if (g.status === "dropped") return false;
      if (excludedIds.has(g.id)) return false;
      if (filters.genres.length > 0 && !g.genres.some((genre) => filters.genres.includes(genre))) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(g.status)) return false;
      if (filters.sources.length > 0 && !filters.sources.includes(g.source)) return false;
      if (filters.minRating !== null && (g.rating ?? 0) < filters.minRating) return false;
      return true;
    });
  }, [games, filters, excludedIds, hiddenGameIds]);

  const handleSpin = React.useCallback(() => {
    if (pool.length === 0) return;
    if (pool.length === 1) {
      setPickedGame(pool[0]);
      setPhase("result");
      return;
    }
    setPhase("spinning");
  }, [pool]);

  const handleSpinComplete = React.useCallback((game: Game) => {
    setPickedGame(game);
    setPhase("result");
  }, []);

  const handleReject = React.useCallback(() => {
    if (pickedGame) {
      setExcludedIds((prev) => new Set([...prev, pickedGame.id]));
    }
    setPhase("filters");
  }, [pickedGame]);

  const handleSpinAgain = React.useCallback(() => {
    if (pool.length === 0) return;
    if (pool.length === 1) {
      setPickedGame(pool[0]);
      setPhase("result");
      return;
    }
    setPhase("spinning");
  }, [pool]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="random-picker-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            data-testid="picker-panel"
            className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
          >
            <button
              data-testid="picker-close"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="size-5" />
            </button>

            <Dices className="size-10 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">What should I play?</h2>

            {phase === "filters" && (
              <div data-testid="picker-filters" className="flex w-full flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {pool.length} game{pool.length !== 1 ? "s" : ""} in pool
                </p>

                {pool.length === 0 ? (
                  <p data-testid="picker-empty" className="text-sm text-warning">
                    No games match your filters. Try broadening your criteria.
                  </p>
                ) : (
                  <Button
                    data-testid="picker-spin"
                    size="lg"
                    className="gap-2 text-lg"
                    onClick={handleSpin}
                  >
                    <Dices className="size-5" />
                    Spin!
                  </Button>
                )}
              </div>
            )}

            {phase === "spinning" && (
              <RouletteSpinner
                pool={pool}
                onComplete={handleSpinComplete}
              />
            )}

            {phase === "result" && pickedGame && (
              <PickerResult
                game={pickedGame}
                onPlay={() => onPlay?.(pickedGame)}
                onSpinAgain={handleSpinAgain}
                onViewDetails={() => onViewDetails?.(pickedGame)}
                onReject={handleReject}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
