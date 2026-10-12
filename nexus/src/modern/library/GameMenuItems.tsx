import * as React from "react";
import {
  EyeOff,
  FolderOpen,
  ImagePlus,
  ListMinus,
  ListPlus,
  Maximize2,
  PanelRight,
  Pencil,
  Play,
  RefreshCw,
} from "lucide-react";
import type { MenuParts } from "@/components/ui/menu";
import type { Game, GameStatus } from "@/stores/gameStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useQueueStore } from "@/stores/queueStore";
import { useTagStore } from "@/stores/tagStore";
import { useToastStore } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import {
  addGameToCollection,
  hideGame,
  openGameFolder,
  refetchGameMetadata,
  removeGameFromCollection,
  setGameCompleted,
  setGameRating,
  setGameStatus,
  unhideGame,
} from "@/lib/gameActions";

export const STATUS_OPTIONS: { value: GameStatus; label: string }[] = [
  { value: "playing", label: "Playing" },
  { value: "completed", label: "Completed" },
  { value: "backlog", label: "Backlog" },
  { value: "dropped", label: "Dropped" },
  { value: "wishlist", label: "Wishlist" },
  { value: "unset", label: "No status" },
];

export interface GameMenuHandlers {
  onPlay: (game: Game) => void;
  onEdit: (game: Game) => void;
  onSearchMetadata: (game: Game) => void;
  /** Open the collection editor and add this game to the new collection on save. */
  onNewCollectionWithGame: (gameId: string) => void;
}

interface GameMenuItemsProps extends GameMenuHandlers {
  game: Game;
  parts: MenuParts;
  /** Omit when the menu is already inside the quick view. */
  showQuickView?: boolean;
}

const ICON = { strokeWidth: 1.5 } as const;

/** Every action on a game, shared by the card's right-click menu and the quick view's More menu. */
export function GameMenuItems({
  game,
  parts: M,
  showQuickView = true,
  onPlay,
  onEdit,
  onSearchMetadata,
  onNewCollectionWithGame,
}: GameMenuItemsProps) {
  const collections = useCollectionStore((s) => s.collections);
  const manual = React.useMemo(
    () => collections.filter((c) => !c.isSmart).sort((a, b) => a.sortOrder - b.sortOrder),
    [collections],
  );
  const isQueued = useQueueStore((s) => s.entries.some((e) => e.gameId === game.id));
  const tags = useTagStore((s) => s.tags);
  const gameTagIds = useTagStore((s) => s.gameTagMap[game.id]) ?? [];
  const addToast = useToastStore((s) => s.addToast);
  const archived = game.status === "removed";

  return (
    <>
      <M.Item data-testid="menu-play" onSelect={() => onPlay(game)} disabled={archived}>
        <Play {...ICON} /> Play
      </M.Item>
      {showQuickView && (
        <M.Item data-testid="menu-quick-view" onSelect={() => useUiStore.getState().setQuickViewGameId(game.id)}>
          <PanelRight {...ICON} /> Quick view
        </M.Item>
      )}
      <M.Item data-testid="menu-details" onSelect={() => useUiStore.getState().setDetailOverlayGameId(game.id)}>
        <Maximize2 {...ICON} /> Open full page
      </M.Item>
      <M.Separator />

      {archived ? (
        <M.CheckboxItem
          data-testid="menu-completed"
          checked={game.completed}
          onCheckedChange={(v) => setGameCompleted(game, v === true)}
        >
          Completed
        </M.CheckboxItem>
      ) : (
        <M.Sub>
          <M.SubTrigger data-testid="menu-status">Status</M.SubTrigger>
          <M.SubContent data-testid="menu-status-sub">
            <M.RadioGroup value={game.status} onValueChange={(v) => setGameStatus(game.id, v as GameStatus)}>
              {STATUS_OPTIONS.map((s) => (
                <M.RadioItem key={s.value} value={s.value} data-testid={`menu-status-${s.value}`}>
                  {s.label}
                </M.RadioItem>
              ))}
            </M.RadioGroup>
          </M.SubContent>
        </M.Sub>
      )}

      <M.Sub>
        <M.SubTrigger data-testid="menu-rate">Rate</M.SubTrigger>
        <M.SubContent>
          <M.RadioGroup
            value={game.rating ? String(game.rating) : ""}
            onValueChange={(v) => setGameRating(game.id, Number(v))}
          >
            {[5, 4, 3, 2, 1].map((r) => (
              <M.RadioItem key={r} value={String(r)} data-testid={`menu-rate-${r}`}>
                <span aria-label={`${r} star${r === 1 ? "" : "s"}`} className="tracking-[0.15em] text-yellow-500">
                  {"★".repeat(r)}
                  <span className="text-muted-foreground/40">{"★".repeat(5 - r)}</span>
                </span>
              </M.RadioItem>
            ))}
          </M.RadioGroup>
          <M.Separator />
          <M.Item data-testid="menu-rate-clear" disabled={!game.rating} onSelect={() => setGameRating(game.id, null)}>
            Clear rating
          </M.Item>
        </M.SubContent>
      </M.Sub>

      <M.Sub>
        <M.SubTrigger data-testid="menu-collections">Collections</M.SubTrigger>
        <M.SubContent>
          {manual.map((c) => {
            const inIt = c.gameIds.includes(game.id);
            return (
              <M.CheckboxItem
                key={c.id}
                data-testid={`menu-collection-${c.id}`}
                checked={inIt}
                // Keep the submenu open so several collections can be ticked in one go.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() =>
                  inIt ? removeGameFromCollection(game.id, c.id) : addGameToCollection(game.id, c.id)
                }
              >
                <span className="truncate">
                  {c.icon ? `${c.icon} ` : ""}
                  {c.name}
                </span>
              </M.CheckboxItem>
            );
          })}
          {manual.length > 0 && <M.Separator />}
          <M.Item data-testid="menu-collection-new" onSelect={() => onNewCollectionWithGame(game.id)}>
            New collection…
          </M.Item>
        </M.SubContent>
      </M.Sub>

      {tags.length > 0 && (
        <M.Sub>
          <M.SubTrigger data-testid="menu-tags">Tags</M.SubTrigger>
          <M.SubContent>
            {tags.map((tag) => {
              const on = gameTagIds.includes(tag.id);
              const store = useTagStore.getState();
              return (
                <M.CheckboxItem
                  key={tag.id}
                  data-testid={`menu-tag-${tag.id}`}
                  checked={on}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() =>
                    on ? store.removeFromGame(game.id, tag.id) : store.addToGame(game.id, tag.id)
                  }
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color || "#6B7280" }}
                  />
                  <span className="truncate">{tag.name}</span>
                </M.CheckboxItem>
              );
            })}
          </M.SubContent>
        </M.Sub>
      )}

      <M.Item
        data-testid={isQueued ? "menu-queue-remove" : "menu-queue-add"}
        disabled={archived}
        onSelect={() => {
          const q = useQueueStore.getState();
          if (isQueued) q.remove(game.id, game.name);
          else q.add(game.id, game.name);
        }}
      >
        {isQueued ? <ListMinus {...ICON} /> : <ListPlus {...ICON} />}
        {isQueued ? "Remove from queue" : "Add to queue"}
      </M.Item>
      <M.Separator />

      <M.Item data-testid="menu-artwork" onSelect={() => onSearchMetadata(game)}>
        <ImagePlus {...ICON} /> Update artwork…
      </M.Item>
      <M.Item
        data-testid="menu-refetch"
        onSelect={() => {
          addToast({ type: "info", message: `Re-fetching metadata for ${game.name}…` });
          // Failures toast from gameActions.
          void refetchGameMetadata(game);
        }}
      >
        <RefreshCw {...ICON} /> Re-fetch metadata
      </M.Item>
      <M.Item data-testid="menu-edit" onSelect={() => onEdit(game)}>
        <Pencil {...ICON} /> Edit game…
      </M.Item>
      {game.folderPath && (
        <M.Item data-testid="menu-folder" onSelect={() => openGameFolder(game)}>
          <FolderOpen {...ICON} /> Open install folder
        </M.Item>
      )}
      <M.Separator />
      <M.Item
        data-testid="menu-hide"
        onSelect={() => {
          hideGame(game).then(
            (ok) =>
              ok &&
              addToast({
                type: "info",
                message: `"${game.name}" hidden from library`,
                action: { label: "Undo", onClick: () => void unhideGame(game) },
              }),
          );
        }}
      >
        <EyeOff {...ICON} /> Hide from library
      </M.Item>
    </>
  );
}
