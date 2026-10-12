import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Archive, Check, Crosshair, ImagePlus, ListMinus, ListPlus, MoreHorizontal, Play, Square, Star } from "lucide-react";
import { cn, formatRunningTimer } from "@/lib/utils";
import type { Game, GameStatus } from "@/stores/gameStore";
import { useGameStore } from "@/stores/gameStore";
import { useQueueStore } from "@/stores/queueStore";
import { setGameCompleted, setGameRating, setGameStatus } from "@/lib/gameActions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, dropdownMenuParts } from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GameMenuItems, STATUS_OPTIONS, type GameMenuHandlers } from "@/modern/library/GameMenuItems";
import { STATUS_META } from "@/modern/library/LibraryCard";

interface GameActionBarProps extends GameMenuHandlers {
  game: Game;
  onStop: () => void;
  onForceIdentify: () => void;
}

const INTERACTIVE =
  'input,textarea,select,[contenteditable="true"],button,a,[role="button"],[role="option"],[role="menuitem"],' +
  '[role="menuitemradio"],[role="menuitemcheckbox"],[role="tab"],[role="radio"],[role="switch"],[role="slider"],[role="combobox"]';

/** True when a page-level shortcut should stand aside for whatever has focus or is open. */
export function shortcutBlocked(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target;
  if (t instanceof Element && t.closest(INTERACTIVE)) return true;
  return !!document.querySelector('[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"]');
}

const CYCLE: GameStatus[] = ["playing", "completed", "backlog", "dropped", "wishlist", "unset"];

export function GameActionBar({ game, onStop, onForceIdentify, ...menu }: GameActionBarProps) {
  const session = useGameStore((s) => s.activeSession);
  const isQueued = useQueueStore((s) => s.entries.some((e) => e.gameId === game.id));
  const running = session?.gameId === game.id ? session : null;
  const archived = game.status === "removed";

  // Enter plays, 1-5 rates, S cycles status. Only from the page itself, never from a control.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutBlocked(e)) return;
      if (e.key === "Enter") {
        if (!archived && !running) {
          e.preventDefault();
          menu.onPlay(game);
        }
      } else if (/^[1-5]$/.test(e.key)) {
        const r = Number(e.key);
        setGameRating(game.id, game.rating === r ? null : r);
      } else if (e.key === "s" || e.key === "S") {
        if (archived) setGameCompleted(game, !game.completed);
        else setGameStatus(game.id, CYCLE[(CYCLE.indexOf(game.status) + 1) % CYCLE.length]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [game, archived, running, menu]);

  return (
    <div data-testid="game-action-bar" className="flex flex-wrap items-center gap-2.5">
      {archived ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <button
                type="button"
                disabled
                data-testid="game-play"
                className="flex h-11 items-center gap-2 rounded-xl bg-secondary px-5 text-[15px] font-semibold text-muted-foreground"
              >
                <Archive className="size-4" strokeWidth={2} />
                Uninstalled
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reinstall and sync to play again</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          data-testid="game-play"
          onClick={() => (running ? onStop() : menu.onPlay(game))}
          className={cn(
            "pressable flex h-11 items-center gap-2.5 rounded-xl pl-5 pr-6 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
            running
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)] hover:bg-primary/90",
          )}
        >
          <span className="relative flex size-4 items-center justify-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={running ? "stop" : "play"}
                initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                className="flex"
              >
                {running ? <Square className="size-3.5 fill-current" strokeWidth={2} /> : <Play className="size-4 fill-current" strokeWidth={2} />}
              </motion.span>
            </AnimatePresence>
          </span>
          {running ? "Stop" : "Play"}
        </button>
      )}

      {running && <RunningPill startedAt={running.startedAt} detected={running.processDetected} />}
      {running && !running.processDetected && (
        <button
          type="button"
          data-testid="game-identify"
          onClick={onForceIdentify}
          className="pressable flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Crosshair className="size-4" strokeWidth={1.5} />
          Can&apos;t find game?
        </button>
      )}

      {archived ? (
        <button
          type="button"
          data-testid="game-completed-toggle"
          aria-pressed={game.completed}
          onClick={() => setGameCompleted(game, !game.completed)}
          className={cn(
            "pressable flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            game.completed ? "bg-primary/15 text-foreground hover:bg-primary/25" : "border border-input bg-background/60 hover:bg-accent",
          )}
        >
          {game.completed && <Check className="size-4" strokeWidth={2} />}
          {game.completed ? "Completed" : "Mark completed"}
        </button>
      ) : (
        <Select value={game.status} onValueChange={(v) => setGameStatus(game.id, v as GameStatus)}>
          <SelectTrigger aria-label="Status" data-testid="game-status" className="h-11 w-40 rounded-xl">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_META[game.status].dot)} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <span className="flex-1" />

      {!archived && (
        <button
          type="button"
          data-testid={isQueued ? "game-queue-remove" : "game-queue-add"}
          onClick={() => {
            const q = useQueueStore.getState();
            if (isQueued) q.remove(game.id, game.name);
            else q.add(game.id, game.name);
          }}
          className="pressable flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isQueued ? <ListMinus className="size-4" strokeWidth={1.5} /> : <ListPlus className="size-4" strokeWidth={1.5} />}
          {isQueued ? "Queued" : "Queue"}
        </button>
      )}
      <button
        type="button"
        data-testid="game-artwork"
        onClick={() => menu.onSearchMetadata(game)}
        className="pressable flex h-10 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ImagePlus className="size-4" strokeWidth={1.5} />
        Update artwork
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            data-testid="game-more"
            className="pressable flex size-10 items-center justify-center rounded-lg border border-input bg-background/60 text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <GameMenuItems game={game} parts={dropdownMenuParts} {...menu} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RunningPill({ startedAt, detected }: { startedAt: string; detected: boolean }) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <span
      data-testid="game-running"
      className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 text-sm"
    >
      <span aria-hidden className={cn("size-2 rounded-full", detected ? "bg-success" : "bg-warning")} />
      <span className="font-medium text-muted-foreground">{detected ? "Now playing" : "Launching"}</span>
      <span className="font-mono tabular-nums text-foreground">{formatRunningTimer(elapsed)}</span>
    </span>
  );
}

/** Your 1–5 rating as a radio group; clicking the current star clears it. */
export function StarRating({ gameId, rating, size = "md" }: { gameId: string; rating: number | null; size?: "md" | "lg" }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || rating || 0;
  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      data-testid="game-rating"
      className="flex items-center"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          data-testid={`game-star-${n}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => setGameRating(gameId, rating === n ? null : n)}
          className={cn(
            "pressable flex items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "lg" ? "size-11" : "size-9",
          )}
        >
          <Star
            className={cn(
              size === "lg" ? "size-7" : "size-5",
              n <= shown ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40",
            )}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
