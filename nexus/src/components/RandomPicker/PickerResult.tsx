import { motion } from "motion/react";
import type { Game } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw, Eye, ThumbsDown, ListPlus } from "lucide-react";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { formatPlayTime } from "@/components/Library/HeroSection";
import { useQueueStore } from "@/stores/queueStore";

interface PickerResultProps {
  game: Game;
  onPlay: () => void;
  onSpinAgain: () => void;
  onViewDetails: () => void;
  onReject: () => void;
}

export function PickerResult({
  game,
  onPlay,
  onSpinAgain,
  onViewDetails,
  onReject,
}: PickerResultProps) {
  const isQueued = useQueueStore((s) => s.isQueued(game.id));
  const queueAdd = useQueueStore((s) => s.add);
  return (
    <motion.div
      data-testid="picker-result"
      className="flex w-full flex-col items-center gap-4"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", duration: 0.4 }}
    >
      {/* Large cover */}
      <div
        data-testid="result-cover"
        className="h-64 w-44 overflow-hidden rounded-xl shadow-[0_0_30px_var(--glow)]"
      >
        {game.coverUrl ? (
          <img src={game.coverUrl} alt={game.name} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/60"
            style={{ background: placeholderGradient(game.name) }}
          >
            {game.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Name + metadata */}
      <h3 data-testid="result-name" className="text-xl font-bold text-foreground">
        {game.name}
      </h3>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span data-testid="result-source" className="capitalize">{game.source}</span>
        {game.totalPlayTimeS > 0 && (
          <span data-testid="result-playtime">{formatPlayTime(game.totalPlayTimeS)}</span>
        )}
        {game.genres.length > 0 && (
          <span>{game.genres.slice(0, 2).join(", ")}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button data-testid="result-play" className="gap-2" onClick={onPlay}>
          <Play className="size-4" /> Play Now
        </Button>
        <Button data-testid="result-spin-again" variant="secondary" className="gap-2" onClick={onSpinAgain}>
          <RefreshCw className="size-4" /> Spin Again
        </Button>
        <Button data-testid="result-details" variant="secondary" className="gap-2" onClick={onViewDetails}>
          <Eye className="size-4" /> View Details
        </Button>
        {!isQueued && (
          <Button
            data-testid="result-queue"
            variant="secondary"
            className="gap-2"
            onClick={() => queueAdd(game.id, game.name)}
          >
            <ListPlus className="size-4" /> Queue It
          </Button>
        )}
        <button
          data-testid="result-reject"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={onReject}
        >
          <ThumbsDown className="mr-1 inline size-3" />
          Nah, not feeling it
        </button>
      </div>
    </motion.div>
  );
}
