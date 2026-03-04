import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TrendingUp } from "lucide-react";
import type { TrendingLibraryGame } from "@/lib/tauri";
import { formatViewerCount } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

const TWITCH_DIRECTORY_BASE = "https://twitch.tv/directory/game/";

export interface TrendingGameCardProps {
  game: TrendingLibraryGame;
  className?: string;
}

export function TrendingGameCard({ game, className }: TrendingGameCardProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const games = useGameStore((s) => s.games);
  const libraryGame = React.useMemo(
    () => games.find((g) => g.id === game.gameId),
    [games, game.gameId],
  );
  const coverUrl = libraryGame?.coverUrl ?? null;

  const handleCardClick = React.useCallback(() => {
    setDetailOverlayGameId(game.gameId);
  }, [game.gameId, setDetailOverlayGameId]);

  const handleTwitchClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = `${TWITCH_DIRECTORY_BASE}${encodeURIComponent(game.twitchGameName)}`;
      openUrl(url).catch(() => {});
    },
    [game.twitchGameName],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if ((e.target as HTMLElement).closest("[data-twitch-dir-link]")) return;
      setDetailOverlayGameId(game.gameId);
    },
    [game.gameId, setDetailOverlayGameId],
  );

  return (
    <article
      role="listitem"
      className={cn(
        "flex w-[80px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card transition-[transform,box-shadow] duration-200 hover:ring-1 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
        className,
      )}
      style={{ scrollSnapAlign: "start" }}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="relative w-full shrink-0 overflow-hidden rounded-t-md bg-muted">
        <div
          className="relative w-full bg-muted"
          style={{ aspectRatio: "2/3", width: 80 }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <TrendingUp className="size-6" aria-hidden />
            </div>
          )}
          <span
            className="absolute left-1 top-1 rounded-sm bg-black/70 px-1 text-[10px] font-medium text-white tabular-nums"
            aria-hidden
          >
            #{game.twitchRank}
          </span>
          <button
            type="button"
            data-twitch-dir-link
            onClick={handleTwitchClick}
            className="absolute bottom-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-background/80 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${game.twitchGameName} on Twitch`}
          >
            <svg
              className="size-3"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-1.5">
        <p
          className="truncate text-[11px] font-medium leading-tight text-foreground"
          title={game.gameName}
        >
          {game.gameName}
        </p>
        <p
          className="text-[11px] tabular-nums text-muted-foreground"
          aria-label={`${formatViewerCount(game.twitchViewerCount)} viewers`}
        >
          {formatViewerCount(game.twitchViewerCount)} viewers
        </p>
      </div>
    </article>
  );
}
