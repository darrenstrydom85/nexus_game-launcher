import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronLeft, ChevronRight, Maximize2, MoreHorizontal, Play, Square, X } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import { EASE_DRAWER } from "@/lib/motion";
import { useGameStore, type Game, type GameStatus } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { setGameCompleted, setGameStatus } from "@/lib/gameActions";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { GameTagsSection } from "@/components/Tags/GameTagsSection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, dropdownMenuParts } from "@/components/ui/menu";
import { GameMenuItems, STATUS_OPTIONS, type GameMenuHandlers } from "./GameMenuItems";
import { STATUS_META } from "./LibraryCard";

interface QuickViewDrawerProps extends GameMenuHandlers {
  onStop: () => void;
}

const WIDTH = 420;
const TIER_ORDER = ["none", "bronze", "silver", "gold", "platinum", "diamond"] as const;
const TIER_COLOR: Record<string, string> = {
  bronze: "var(--tier-bronze)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
  platinum: "var(--tier-platinum)",
  diamond: "var(--tier-diamond)",
};

function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** Push-style quick view: the page reflows instantly beside it, only the drawer slides. */
export function QuickViewDrawer(props: QuickViewDrawerProps) {
  const gameId = useUiStore((s) => s.quickViewGameId);
  const game = useGameStore((s) => (gameId ? s.games.find((g) => g.id === gameId) ?? null : null));

  // A hidden or deleted game closes the drawer.
  React.useEffect(() => {
    if (gameId && !game) useUiStore.getState().setQuickViewGameId(null);
  }, [gameId, game]);

  return (
    <AnimatePresence initial={false}>
      {game && (
        <motion.aside
          key="quick-view"
          aria-label={`Quick view: ${game.name}`}
          data-testid="quick-view"
          initial={{ transform: "translateX(100%)" }}
          animate={{ transform: "translateX(0%)", transition: { duration: 0.24, ease: EASE_DRAWER } }}
          exit={{ transform: "translateX(100%)", transition: { duration: 0.18, ease: EASE_DRAWER } }}
          style={{ width: WIDTH }}
          className="relative flex h-full shrink-0 flex-col border-l border-border bg-sidebar shadow-[-24px_0_48px_rgba(0,0,0,0.35)] max-[900px]:w-[360px]!"
        >
          <DrawerBody game={game} {...props} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ game, onStop, ...menu }: QuickViewDrawerProps & { game: Game }) {
  const ids = useUiStore((s) => s.quickViewIds);
  const session = useGameStore((s) => s.activeSession);
  const mastery = useMasteryStore((s) => s.tiers.get(game.id));
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const openedFor = React.useRef<string | null>(null);

  const index = ids.indexOf(game.id);
  const step = React.useCallback(
    (delta: number) => {
      if (index < 0 || ids.length < 2) return;
      useUiStore.getState().setQuickViewGameId(ids[(index + delta + ids.length) % ids.length]);
    },
    [ids, index],
  );

  const close = React.useCallback(() => {
    const id = game.id;
    useUiStore.getState().setQuickViewGameId(null);
    // Return focus to the card that opened it.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-game-card="${CSS.escape(id)}"] button`)?.focus();
    });
  }, [game.id]);

  // Move focus in on open (not on prev/next, which keeps focus where it is).
  React.useEffect(() => {
    if (openedFor.current === null) headingRef.current?.focus({ preventScroll: true });
    openedFor.current = game.id;
  }, [game.id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      // Leave keys to any open menu, popover, dialog or the game page on top.
      if (useUiStore.getState().detailOverlayGameId) return;
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]')) return;
      if (e.key === "Escape") {
        close();
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        // Composite widgets use arrows themselves.
        const t = e.target;
        if (t instanceof Element && t.closest('[role="radiogroup"],[role="tablist"],[role="slider"],[role="menu"],[role="listbox"]')) return;
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, step]);

  const isRunning = session?.gameId === game.id;
  const archived = game.status === "removed";
  const art = game.heroUrl ?? game.coverUrl;
  const genres = (Array.isArray(game.genres) ? game.genres : []).slice(0, 2);
  const year = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-secondary">
        {art ? (
          <img src={art} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          <div className="size-full" style={{ background: placeholderGradient(game.name) }} />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/30 to-transparent" />
        <div className="absolute inset-x-3 top-3 flex items-center gap-1.5">
          <ArtButton label="Previous game" onClick={() => step(-1)} disabled={ids.length < 2 || index < 0} testId="qv-prev">
            <ChevronLeft className="size-4" strokeWidth={2} />
          </ArtButton>
          <ArtButton label="Next game" onClick={() => step(1)} disabled={ids.length < 2 || index < 0} testId="qv-next">
            <ChevronRight className="size-4" strokeWidth={2} />
          </ArtButton>
          {index >= 0 && (
            <span data-testid="qv-position" className="ml-1 rounded-md bg-black/55 px-2 py-0.5 text-xs tabular-nums text-white/90">
              {index + 1} of {ids.length}
            </span>
          )}
          <span className="flex-1" />
          <ArtButton label="Open full page" onClick={() => useUiStore.getState().setDetailOverlayGameId(game.id)} testId="qv-full">
            <Maximize2 className="size-3.5" strokeWidth={2} />
          </ArtButton>
          <ArtButton label="Close quick view" onClick={close} testId="qv-close">
            <X className="size-4" strokeWidth={2} />
          </ArtButton>
        </div>
        <div className="absolute inset-x-5 bottom-3">
          {game.logoUrl ? (
            <img src={game.logoUrl} alt="" className="max-h-14 max-w-[70%] object-contain object-left drop-shadow-lg" />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 pb-6 pt-3">
        <div className="flex flex-col gap-1.5">
          <h2
            ref={headingRef}
            tabIndex={-1}
            data-testid="qv-title"
            className="text-xl font-semibold leading-tight tracking-tight text-foreground outline-none"
          >
            {game.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="rounded-md bg-secondary px-2 py-0.5 font-medium capitalize text-foreground/85">{game.source}</span>
            {genres.map((g) => (
              <span key={g}>{g}</span>
            ))}
            {year && <span className="tabular-nums">{year}</span>}
          </div>
        </div>

        <div className="flex gap-2">
          {archived ? (
            <button
              type="button"
              data-testid="qv-completed"
              aria-pressed={game.completed}
              onClick={() => setGameCompleted(game, !game.completed)}
              className="pressable h-11 flex-1 rounded-xl bg-secondary text-[15px] font-semibold text-foreground outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {game.completed ? "Completed ✓" : "Mark completed"}
            </button>
          ) : (
            <button
              type="button"
              data-testid="qv-play"
              onClick={() => (isRunning ? onStop() : menu.onPlay(game))}
              className={cn(
                "pressable flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isRunning
                  ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <span className="relative flex size-4 items-center justify-center">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={isRunning ? "stop" : "play"}
                    initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    className="flex"
                  >
                    {isRunning ? (
                      <Square className="size-3.5 fill-current" strokeWidth={2} />
                    ) : (
                      <Play className="size-4 fill-current" strokeWidth={2} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              {isRunning ? "Stop" : "Play"}
            </button>
          )}

          {!archived && (
            <Select value={game.status} onValueChange={(v) => setGameStatus(game.id, v as GameStatus)}>
              <SelectTrigger aria-label="Status" data-testid="qv-status" className="h-11 w-36 rounded-xl">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_META[game.status].dot)} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                data-testid="qv-more"
                className="pressable flex size-11 items-center justify-center rounded-xl border border-input bg-background/60 text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="size-4" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <GameMenuItems game={game} parts={dropdownMenuParts} showQuickView={false} {...menu} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <StatCell label="Played" value={game.totalPlayTimeS > 0 ? formatPlayTime(game.totalPlayTimeS) : "—"} />
          <StatCell label="Sessions" value={game.playCount > 0 ? String(game.playCount) : "—"} />
          <StatCell label="Last played" value={game.lastPlayedAt ? formatRelativeTime(game.lastPlayedAt) : "Never"} />
          <StatCell label="Progress" value={game.progress ? `${game.progress}%` : "—"} />
        </dl>

        <Hltb game={game} />

        {mastery && mastery.tier !== "none" ? (
          <MasteryRow
            tier={mastery.tier}
            nextThresholdS={mastery.nextTierThresholdS}
            progress={mastery.progressToNextTier}
            playedS={game.totalPlayTimeS}
          />
        ) : null}

        <GameTagsSection gameId={game.id} />

        <button
          type="button"
          onClick={() => useUiStore.getState().setDetailOverlayGameId(game.id)}
          className="flex items-center gap-1.5 self-start rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sessions, screenshots and notes
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function ArtButton({
  label,
  onClick,
  disabled,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="pressable flex size-8 items-center justify-center rounded-lg bg-black/55 text-white outline-none hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Hltb({ game }: { game: Game }) {
  const main = game.hltbMainH;
  const extra = game.hltbMainExtraH;
  const full = game.hltbCompletionistH;
  const max = full ?? extra ?? main;
  if (!max) return null;
  const you = game.totalPlayTimeS / 3600;
  const pct = (h: number) => `${Math.min(100, (h / max) * 100)}%`;
  return (
    <section aria-label="How long to beat" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">How long to beat</h3>
        {you > 0 && <span className="text-xs tabular-nums text-muted-foreground">You: {you.toFixed(1)}h</span>}
      </div>
      <div className="relative h-2 rounded-full bg-secondary">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(you) }} />
        {main && extra && <span aria-hidden className="absolute -top-[3px] h-3.5 w-0.5 rounded-full bg-foreground/80" style={{ left: pct(main) }} />}
        {extra && full && <span aria-hidden className="absolute -top-[3px] h-3.5 w-0.5 rounded-full bg-foreground/45" style={{ left: pct(extra) }} />}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {main && <span>Main <b className="font-semibold tabular-nums text-foreground">{Math.round(main)}h</b></span>}
        {extra && <span>+ Extras <b className="font-semibold tabular-nums text-foreground">{Math.round(extra)}h</b></span>}
        {full && <span>100% <b className="font-semibold tabular-nums text-foreground">{Math.round(full)}h</b></span>}
      </div>
    </section>
  );
}

function MasteryRow({
  tier,
  nextThresholdS,
  progress,
  playedS,
}: {
  tier: string;
  nextThresholdS: number | null;
  progress: number;
  playedS: number;
}) {
  const next = TIER_ORDER[TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]) + 1];
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  const toGo = nextThresholdS ? Math.max(0, nextThresholdS - playedS) : 0;
  return (
    <section aria-label="Mastery" className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-secondary"
          style={{ color: TIER_COLOR[tier] }}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{name} mastery</div>
          <div className="text-xs text-muted-foreground">
            {next && nextThresholdS
              ? `${next.charAt(0).toUpperCase() + next.slice(1)} at ${Math.round(nextThresholdS / 3600)}h · ${formatPlayTime(toGo)} to go`
              : "Top tier reached"}
          </div>
        </div>
      </div>
      {next && nextThresholdS ? (
        <div className="h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: TIER_COLOR[tier] }} />
        </div>
      ) : null}
    </section>
  );
}
