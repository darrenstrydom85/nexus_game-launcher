import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ListMinus, ListPlus, Play, Square } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import { EASE_OUT } from "@/lib/motion";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQueueStore } from "@/stores/queueStore";
import { useUiStore } from "@/stores/uiStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SpotlightProps {
  onPlay: (game: Game) => void;
  onStop: () => void;
  onResync: () => void;
  onOpenSettings: () => void;
}

const MAX = 5;

/** Running game first, then most recently played; recently added for a fresh library. */
export function pickSpotlight(games: Game[], runningId: string | null): { list: Game[]; mode: "played" | "added" } {
  const played = games
    .filter((g) => g.lastPlayedAt)
    .sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime());
  const running = runningId ? games.find((g) => g.id === runningId) : undefined;
  if (played.length === 0 && !running) {
    const added = [...games].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    return { list: added.slice(0, MAX), mode: "added" };
  }
  const list = running ? [running, ...played.filter((g) => g.id !== running.id)] : played;
  return { list: list.slice(0, MAX), mode: "played" };
}

export function Spotlight({ onPlay, onStop, onResync, onOpenSettings }: SpotlightProps) {
  const games = useGameStore((s) => s.games);
  const session = useGameStore((s) => s.activeSession);
  const hiddenIds = useSettingsStore((s) => s.hiddenGameIds);
  const runningId = session?.gameId ?? null;

  const { list, mode } = React.useMemo(
    () => pickSpotlight(games.filter((g) => g.status !== "removed" && !hiddenIds.includes(g.id)), runningId),
    [games, hiddenIds, runningId],
  );
  const [index, setIndex] = React.useState(0);
  // A newly launched game takes the spotlight.
  React.useEffect(() => setIndex(0), [runningId]);

  const game = list[Math.min(index, list.length - 1)] ?? null;
  if (!game) return <Welcome onResync={onResync} onOpenSettings={onOpenSettings} />;

  const running = session?.gameId === game.id;
  const art = game.heroUrl ?? game.coverUrl;
  const progress =
    game.progress != null && game.progress > 0
      ? `${game.progress}% complete`
      : game.hltbMainH && game.totalPlayTimeS > 0
        ? `${Math.min(100, Math.round((game.totalPlayTimeS / 3600 / game.hltbMainH) * 100))}% of main story`
        : null;
  const eyebrow = running
    ? session?.processDetected
      ? "Now playing"
      : "Launching"
    : mode === "added"
      ? "Recently added"
      : `Continue · last played ${formatRelativeTime(game.lastPlayedAt)}`;

  return (
    <section aria-label="Spotlight" data-testid="home-spotlight" className="relative flex h-[clamp(320px,50vh,500px)] flex-col justify-end overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={game.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
        >
          {art ? (
            <img src={art} alt="" draggable={false} className={cn("size-full object-cover", !game.heroUrl && "scale-110 blur-lg")} />
          ) : (
            <div className="size-full" style={{ background: placeholderGradient(game.name) }} />
          )}
        </motion.div>
      </AnimatePresence>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/55 to-transparent" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />

      <div className="relative flex flex-wrap items-end justify-between gap-8 px-10 pb-9">
        <div className="flex min-w-0 max-w-[600px] flex-col gap-4">
          <span
            data-testid="spotlight-eyebrow"
            className={cn(
              "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]",
              running ? "text-green-700 dark:text-success" : "text-primary",
            )}
          >
            {running && <span aria-hidden className={cn("size-2 rounded-full", session?.processDetected ? "bg-success" : "bg-warning")} />}
            {eyebrow}
          </span>
          {game.logoUrl ? (
            <>
              <h1 className="sr-only">{game.name}</h1>
              <img src={game.logoUrl} alt="" className="max-h-28 max-w-[min(480px,80%)] object-contain object-left drop-shadow-xl" />
            </>
          ) : (
            <h1 className="text-[52px] font-bold leading-[0.98] tracking-[-0.02em] text-foreground drop-shadow-lg">{game.name}</h1>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-foreground/80">
            {game.totalPlayTimeS > 0 && (
              <span>
                <b className="font-semibold text-foreground">{formatPlayTime(game.totalPlayTimeS)}</b> played
              </span>
            )}
            {game.playCount > 0 && (
              <span>
                <b className="font-semibold text-foreground">{game.playCount}</b> {game.playCount === 1 ? "session" : "sessions"}
              </span>
            )}
            {progress && <span>{progress}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="spotlight-play"
              onClick={() => (running ? onStop() : onPlay(game))}
              className={cn(
                "pressable flex h-12 items-center gap-2.5 rounded-xl pl-6 pr-7 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                running ? "bg-destructive/90 text-white hover:bg-destructive" : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {running ? <Square className="size-4 fill-current" strokeWidth={2} /> : <Play className="size-[18px] fill-current" strokeWidth={2} />}
              {running ? "Stop" : "Play"}
            </button>
            <button
              type="button"
              data-testid="spotlight-quick-view"
              onClick={() => {
                const ui = useUiStore.getState();
                ui.setQuickViewIds(list.map((g) => g.id));
                ui.setQuickViewGameId(game.id);
              }}
              className="pressable h-12 rounded-xl border border-border bg-background/60 px-5 text-[15px] font-semibold text-foreground outline-none hover:bg-background/85 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Quick view
            </button>
            <QueueToggle game={game} />
          </div>
        </div>

        {list.length > 1 && (
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-foreground/70">{mode === "added" ? "Recently added" : "Recently played"}</span>
            <div role="radiogroup" aria-label="Spotlight game" className="flex gap-2.5">
              {list.map((g, i) => {
                const thumb = g.heroUrl ?? g.coverUrl;
                const selected = g.id === game.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={g.name}
                    data-testid={`spotlight-thumb-${g.id}`}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "pressable img-outline aspect-video w-[112px] overflow-hidden rounded-lg bg-secondary outline-none transition-[opacity,scale] duration-150",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "outline-2 outline-offset-2 outline-foreground" : "opacity-65 hover:opacity-100",
                    )}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" draggable={false} className="size-full object-cover" />
                    ) : (
                      <span className="block size-full" style={{ background: placeholderGradient(g.name) }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function QueueToggle({ game }: { game: Game }) {
  const queued = useQueueStore((s) => s.entries.some((e) => e.gameId === game.id));
  const label = queued ? "Remove from play queue" : "Add to play queue";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={queued}
          data-testid="spotlight-queue"
          onClick={() => {
            const q = useQueueStore.getState();
            if (queued) q.remove(game.id, game.name);
            else q.add(game.id, game.name);
          }}
          className="pressable flex size-12 items-center justify-center rounded-xl border border-border bg-background/60 text-foreground outline-none hover:bg-background/85 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {queued ? <ListMinus className="size-5" strokeWidth={1.75} /> : <ListPlus className="size-5" strokeWidth={1.75} />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function Welcome({ onResync, onOpenSettings }: { onResync: () => void; onOpenSettings: () => void }) {
  return (
    <section aria-label="Welcome" className="flex flex-col items-start gap-4 px-10 pb-6 pt-14">
      <h1 className="text-[40px] font-bold leading-tight tracking-[-0.02em] text-foreground">Welcome to Nexus</h1>
      <p className="max-w-md text-[15px] text-muted-foreground">
        Your games from every launcher, in one place. Sync to pull in your library, or add folders in Settings.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onResync} className="pressable h-11 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
          Sync library
        </button>
        <button type="button" onClick={onOpenSettings} className="pressable h-11 rounded-xl px-5 text-[15px] font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          Open settings
        </button>
      </div>
    </section>
  );
}
