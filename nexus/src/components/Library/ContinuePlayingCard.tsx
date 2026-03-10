import * as React from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import type { Game, GameStatus } from "@/stores/gameStore";
import { Play } from "lucide-react";
import { placeholderGradient } from "@/components/GameCard";

const STATUS_ACCENT: Record<GameStatus, string> = {
  playing: "bg-success text-success-foreground hover:bg-success/90",
  completed: "bg-primary text-primary-foreground hover:bg-primary/90",
  backlog: "bg-warning text-warning-foreground hover:bg-warning/90",
  dropped: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  wishlist: "bg-info text-info-foreground hover:bg-info/90",
  removed: "bg-muted text-muted-foreground hover:bg-muted/80",
  unset: "bg-primary text-primary-foreground hover:bg-primary/90",
};

interface ContinuePlayingCardProps {
  game: Game;
  onPlay?: (game: Game) => void;
  onClick?: (gameId: string) => void;
}

export function ContinuePlayingCard({ game, onPlay, onClick }: ContinuePlayingCardProps) {
  const [timeAgo, setTimeAgo] = React.useState(() =>
    formatRelativeTime(game.lastPlayedAt),
  );

  React.useEffect(() => {
    setTimeAgo(formatRelativeTime(game.lastPlayedAt));
    const id = setInterval(() => {
      setTimeAgo(formatRelativeTime(game.lastPlayedAt));
    }, 60_000);
    return () => clearInterval(id);
  }, [game.lastPlayedAt]);

  return (
    <div
      data-testid={`continue-playing-card-${game.id}`}
      className={cn(
        "group relative flex w-[120px] shrink-0 flex-col gap-2",
        "cursor-pointer select-none",
      )}
      onClick={() => onClick?.(game.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(game.id);
        }
      }}
      aria-label={`${game.name} — ${timeAgo}`}
    >
      {/* Cover art with 2:3 aspect ratio */}
      <div className="relative overflow-hidden rounded-lg" style={{ aspectRatio: "2 / 3" }}>
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt={game.name}
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-2"
            style={{ background: placeholderGradient(game.name) }}
          >
            <span className="text-center text-xs font-semibold text-white/80">
              {game.name}
            </span>
          </div>
        )}

        {/* Hover overlay with play button */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-black/40 opacity-0 transition-opacity duration-200 ease-out",
            "group-hover:opacity-100",
          )}
        >
          <button
            data-testid={`continue-playing-play-${game.id}`}
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              "shadow-lg transition-transform duration-200 ease-out",
              "group-hover:scale-100 scale-90",
              STATUS_ACCENT[game.status],
            )}
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.(game);
            }}
            aria-label={`Play ${game.name}`}
          >
            <Play className="size-4 fill-current" />
          </button>
        </div>
      </div>

      {/* Info below cover */}
      <div className="flex flex-col gap-0.5 px-0.5">
        <span
          data-testid={`continue-playing-name-${game.id}`}
          className="line-clamp-2 text-xs font-medium leading-tight text-foreground"
        >
          {game.name}
        </span>
        {timeAgo && (
          <span
            data-testid={`continue-playing-time-${game.id}`}
            className="text-[10px] text-muted-foreground"
          >
            {timeAgo}
          </span>
        )}
      </div>
    </div>
  );
}
