import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import type { Game, GameStatus } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { TwitchLiveBadge } from "@/components/Library/TwitchLiveBadge";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, contextMenuParts } from "@/components/ui/menu";
import { GameMenuItems, type GameMenuHandlers } from "./GameMenuItems";

export const STATUS_META: Record<GameStatus, { label: string; dot: string }> = {
  playing: { label: "Playing", dot: "bg-success" },
  completed: { label: "Completed", dot: "bg-primary" },
  backlog: { label: "Backlog", dot: "bg-warning" },
  dropped: { label: "Dropped", dot: "bg-destructive" },
  wishlist: { label: "Wishlist", dot: "bg-info" },
  removed: { label: "Archived", dot: "bg-muted-foreground" },
  unset: { label: "", dot: "bg-muted-foreground/50" },
};

const SOURCE_SHORT: Record<string, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Local",
};

export function gameMeta(game: Game): string {
  if (game.totalPlayTimeS > 0) return formatPlayTime(game.totalPlayTimeS);
  return STATUS_META[game.status].label || "Not played";
}

interface LibraryCardProps extends GameMenuHandlers {
  game: Game;
  selected: boolean;
  onOpen: (gameId: string) => void;
  onOpenFull: (gameId: string) => void;
  /** Replaces the status/play-time line (e.g. ratings on the Completed tab). */
  meta?: React.ReactNode;
}

/** Cover with title and meta below it, so the art stays clean. */
export const LibraryCard = React.memo(function LibraryCard({
  game,
  selected,
  onOpen,
  onOpenFull,
  meta,
  ...menu
}: LibraryCardProps) {
  const showProgress = useSettingsStore((s) => s.showCardProgress);
  const [imgFailed, setImgFailed] = React.useState(false);
  const cover = !imgFailed ? game.coverUrl : null;
  const progress = showProgress && game.progress ? game.progress : 0;

  return (
    <div className="group relative min-w-0" data-game-card={game.id}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            data-testid={`lib-card-${game.id}`}
            aria-pressed={selected}
            aria-label={`${game.name}. Open quick view`}
            onClick={() => onOpen(game.id)}
            onDoubleClick={() => onOpenFull(game.id)}
            className="pressable flex w-full flex-col gap-2.5 text-left outline-none"
          >
            <span
              className={cn(
                "img-outline relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-secondary",
                "transition-[outline-color,outline-offset] duration-150 ease-out",
                selected && "outline-2 outline-offset-[3px] outline-primary",
                "group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-ring",
              )}
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  onError={() => setImgFailed(true)}
                  className="size-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
                />
              ) : (
                <span
                  className="flex size-full items-center justify-center p-4 text-center text-sm font-semibold text-white/85"
                  style={{ background: placeholderGradient(game.name) }}
                >
                  {game.name}
                </span>
              )}
              <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {SOURCE_SHORT[game.source] ?? game.source}
              </span>
              {progress > 0 && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50" aria-hidden>
                  <span className="block h-full bg-primary" style={{ width: `${Math.min(progress, 100)}%` }} />
                </span>
              )}
            </span>
            <span className="block min-w-0">
              <span className="block truncate text-[13px] font-semibold text-foreground" title={game.name}>
                {game.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {meta ?? (
                  <>
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", STATUS_META[game.status].dot)} />
                    <span className="truncate">{gameMeta(game)}</span>
                  </>
                )}
              </span>
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid={`lib-card-menu-${game.id}`}>
          <GameMenuItems game={game} parts={contextMenuParts} {...menu} />
        </ContextMenuContent>
      </ContextMenu>
      <TwitchLiveBadge gameName={game.name} className="absolute right-2 top-2 z-10" />
    </div>
  );
});
