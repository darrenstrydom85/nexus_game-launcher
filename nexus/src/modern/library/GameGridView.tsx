import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import type { Game } from "@/stores/gameStore";
import type { ViewMode } from "@/stores/uiStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, contextMenuParts } from "@/components/ui/menu";
import { GameMenuItems, type GameMenuHandlers } from "./GameMenuItems";
import { LibraryCard, STATUS_META } from "./LibraryCard";

interface GameGridViewProps extends GameMenuHandlers {
  games: Game[];
  viewMode: ViewMode;
  selectedId: string | null;
  onOpen: (gameId: string) => void;
  onOpenFull: (gameId: string) => void;
  metaFor?: (game: Game) => React.ReactNode;
}

export function GameGridView({ games, viewMode, selectedId, onOpen, onOpenFull, metaFor, ...menu }: GameGridViewProps) {
  if (viewMode === "list") {
    return (
      <div data-testid="lib-list" role="list" className="flex flex-col">
        <div
          aria-hidden
          className="grid grid-cols-[48px_minmax(0,1fr)_110px_100px_110px_110px] items-center gap-4 border-b border-border px-3 pb-2 text-xs font-medium text-muted-foreground max-[900px]:grid-cols-[48px_minmax(0,1fr)_100px]"
        >
          <span />
          <span>Name</span>
          <span className="max-[900px]:hidden">Source</span>
          <span className="text-right">Play time</span>
          <span className="max-[900px]:hidden">Last played</span>
          <span className="max-[900px]:hidden">Status</span>
        </div>
        {games.map((g) => (
          <ListRow key={g.id} game={g} selected={selectedId === g.id} onOpen={onOpen} onOpenFull={onOpenFull} {...menu} />
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="lib-grid"
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-6"
    >
      {games.map((g) => (
        <LibraryCard
          key={g.id}
          game={g}
          selected={selectedId === g.id}
          onOpen={onOpen}
          onOpenFull={onOpenFull}
          meta={metaFor?.(g)}
          {...menu}
        />
      ))}
    </div>
  );
}

const ListRow = React.memo(function ListRow({
  game,
  selected,
  onOpen,
  onOpenFull,
  ...menu
}: GameMenuHandlers & {
  game: Game;
  selected: boolean;
  onOpen: (id: string) => void;
  onOpenFull: (id: string) => void;
}) {
  const status = STATUS_META[game.status];
  return (
    <div role="listitem" data-game-card={game.id}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            data-testid={`lib-row-${game.id}`}
            aria-pressed={selected}
            onClick={() => onOpen(game.id)}
            onDoubleClick={() => onOpenFull(game.id)}
            className={cn(
              "grid w-full grid-cols-[48px_minmax(0,1fr)_110px_100px_110px_110px] items-center gap-4 rounded-lg px-3 py-2 text-left text-sm outline-none",
              "transition-[background-color] duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
              "max-[900px]:grid-cols-[48px_minmax(0,1fr)_100px]",
              selected && "bg-accent",
            )}
          >
            <span className="img-outline block h-12 w-9 overflow-hidden rounded-md bg-secondary">
              {game.coverUrl ? (
                <img src={game.coverUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
              ) : (
                <span className="block size-full" style={{ background: placeholderGradient(game.name) }} />
              )}
            </span>
            <span className="truncate font-medium text-foreground">{game.name}</span>
            <span className="truncate capitalize text-muted-foreground max-[900px]:hidden">{game.source}</span>
            <span className="text-right tabular-nums text-muted-foreground">
              {game.totalPlayTimeS > 0 ? formatPlayTime(game.totalPlayTimeS) : "—"}
            </span>
            <span className="truncate text-muted-foreground max-[900px]:hidden">
              {game.lastPlayedAt ? formatRelativeTime(game.lastPlayedAt) : "Never"}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground max-[900px]:hidden">
              <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
              {status.label || "—"}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <GameMenuItems game={game} parts={contextMenuParts} {...menu} />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
});
