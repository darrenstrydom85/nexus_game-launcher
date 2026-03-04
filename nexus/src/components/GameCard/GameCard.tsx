import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import type { Game, GameSource, GameStatus } from "@/stores/gameStore";
import { formatPlayTime } from "@/components/Library/HeroSection";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { TwitchLiveBadge } from "@/components/Library/TwitchLiveBadge";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function placeholderGradient(name: string): string {
  const h = hashString(name);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 50%, 25%) 0%, hsl(${hue2}, 60%, 15%) 100%)`;
}

const SOURCE_SHORT: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubi",
  battlenet: "B.net",
  xbox: "Xbox",
  standalone: "Local",
};

const STATUS_COLORS: Record<GameStatus, string> = {
  playing: "bg-success",
  completed: "bg-primary",
  backlog: "bg-warning",
  dropped: "bg-destructive",
  wishlist: "bg-info",
  removed: "bg-muted-foreground",
  unset: "bg-muted-foreground",
};

export function SourceBadge({ source }: { source: GameSource }) {
  return (
    <span
      data-testid="source-badge"
      className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
    >
      {SOURCE_SHORT[source]}
    </span>
  );
}

export function PlayTimeBadge({ seconds }: { seconds: number }) {
  if (!seconds || seconds <= 0) return null;
  return (
    <span
      data-testid="playtime-badge"
      className="text-xs text-muted-foreground"
    >
      {formatPlayTime(seconds)}
    </span>
  );
}

export function StatusBadge({ status }: { status: GameStatus }) {
  if (status === "unset") return null;
  return (
    <span
      data-testid="status-badge"
      className={cn("inline-block size-2 rounded-full", STATUS_COLORS[status])}
      title={status}
    />
  );
}


interface GameCardProps {
  game: Game;
  onHover?: (gameId: string) => void;
  onHoverEnd?: () => void;
  onClick?: (gameId: string) => void;
}

export function GameCard({ game, onHover, onHoverEnd, onClick }: GameCardProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const [isHovered, setIsHovered] = React.useState(false);

  const handleClick = React.useCallback(() => {
    onClick?.(game.id);
    setDetailOverlayGameId(game.id);
  }, [game.id, onClick, setDetailOverlayGameId]);

  return (
    <div
      data-testid={`game-card-${game.id}`}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg",
        "transition-all duration-200 ease-out",
        "hover:scale-105 hover:-translate-y-1",
        "hover:shadow-[0_0_20px_var(--glow)]",
      )}
      style={{ aspectRatio: "2 / 3" }}
      onMouseEnter={() => {
        setIsHovered(true);
        onHover?.(game.id);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHoverEnd?.();
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={game.name}
    >
      {/* Cover art or placeholder */}
      {game.coverUrl ? (
        <img
          src={game.coverUrl}
          alt={game.name}
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <div
          data-testid={`game-card-placeholder-${game.id}`}
          className="flex h-full w-full items-center justify-center p-4"
          style={{ background: placeholderGradient(game.name) }}
        >
          <span className="text-center text-sm font-semibold text-white/80">
            {game.name}
          </span>
          <div className="absolute inset-0 opacity-10 mix-blend-overlay bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_20px)]" />
        </div>
      )}

      {/* Source badge */}
      <SourceBadge source={game.source} />

      {/* Twitch live badge (Story 19.8) */}
      <TwitchLiveBadge gameName={game.name} />

      {/* Top-left: critic score badge (on hover) */}
      {game.criticScore != null && game.criticScore > 0 && (
        <div
          data-testid={`score-badge-card-${game.id}`}
          className={cn(
            "absolute left-2 top-2 z-10 transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0",
          )}
        >
          <ScoreBadge score={game.criticScore} size="sm" label="Critic score" />
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Bottom info */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
        <span
          data-testid={`game-card-name-${game.id}`}
          className="line-clamp-2 text-sm font-semibold leading-tight text-white"
        >
          {game.name}
        </span>
        <div className="flex items-center gap-2">
          <PlayTimeBadge seconds={game.totalPlayTimeS} />
          <StatusBadge status={game.status} />
        </div>
      </div>
    </div>
  );
}

export { placeholderGradient };
