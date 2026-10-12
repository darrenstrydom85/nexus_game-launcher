import * as React from "react";
import { useReducedMotionConfig } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Clock, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore, type SettingsCategory } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQueueStore } from "@/stores/queueStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { LibraryCard } from "../library/LibraryCard";
import type { GameMenuHandlers } from "../library/GameMenuItems";
import { Tile } from "./Tiles";
import { libraryShape } from "./homePicks";

/* ── Poster shelf ────────────────────────────────────────────────── */

const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : `${Math.round(h * 2) / 2}h`);

/** Meta lines under a shelf poster, by shelf. */
export const SHELF_META = {
  weekend: (g: Game) => (
    <>
      <Clock className="size-3 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate">{hours(g.hltbMainH ?? 0)} to beat</span>
    </>
  ),
  critics: (g: Game) => (
    <>
      <Star className="size-3 shrink-0 fill-current text-amber-500" strokeWidth={2} aria-hidden />
      <span className="truncate">Critics {Math.round(g.criticScore ?? 0)}%</span>
    </>
  ),
  jumpBack: (g: Game) => <span className="truncate">Last played {formatRelativeTime(g.lastPlayedAt)}</span>,
  added: (g: Game) => <span className="truncate">Added {formatRelativeTime(g.addedAt)}</span>,
};

export function Shelf({
  id,
  title,
  subtitle,
  games,
  meta,
  menu,
}: {
  id: string;
  title: string;
  subtitle: string;
  games: Game[];
  meta: (g: Game) => React.ReactNode;
  menu: GameMenuHandlers;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();
  const [edge, setEdge] = React.useState({ start: true, end: false });

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);

  React.useEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !ref.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure, games.length]);

  // A shelf of one or two looks like a mistake.
  if (games.length < 3) return null;

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    el?.scrollBy?.({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };
  const open = (gameId: string) => {
    const ui = useUiStore.getState();
    ui.setQuickViewIds(games.map((g) => g.id));
    ui.setQuickViewGameId(gameId);
  };

  return (
    <section aria-labelledby={`shelf-${id}`} data-testid={`shelf-${id}`} className="flex min-w-0 flex-col gap-3.5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`shelf-${id}`} className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <ArrowButton label={`Scroll ${title} back`} disabled={edge.start} onClick={() => page(-1)}>
            <ChevronLeft className="size-4" strokeWidth={2} />
          </ArrowButton>
          <ArrowButton label={`Scroll ${title} forward`} disabled={edge.end} onClick={() => page(1)}>
            <ChevronRight className="size-4" strokeWidth={2} />
          </ArrowButton>
        </div>
      </div>
      <div
        ref={ref}
        onScroll={measure}
        className="-mx-1.5 -mt-1.5 grid auto-cols-[150px] grid-flow-col gap-4 overflow-x-auto px-1.5 pb-2 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {games.map((g) => (
          <LibraryCard
            key={g.id}
            game={g}
            selected={false}
            onOpen={open}
            onOpenFull={(gameId) => useUiStore.getState().setDetailOverlayGameId(gameId)}
            meta={meta(g)}
            {...menu}
          />
        ))}
      </div>
    </section>
  );
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="pressable flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/* ── Get started ─────────────────────────────────────────────────── */

export function GetStartedCard({
  onOpenRandom,
  onOpenSettings,
}: {
  onOpenRandom: () => void;
  onOpenSettings: (category?: SettingsCategory) => void;
}) {
  const dismissed = useSettingsStore((s) => s.homeChecklistDismissed);
  const artworkKey = useSettingsStore((s) => s.apiKeys.steamGridDbKey.trim() !== "");
  const themed = useSettingsStore((s) => s.customTheme !== null);
  const played = useGameStore((s) => s.games.some((g) => g.lastPlayedAt));
  const sessions = useGameStore((s) => s.games.reduce((n, g) => n + g.playCount, 0));
  const queued = useQueueStore((s) => s.entries.length > 0);
  const twitch = useTwitchStore((s) => s.isAuthenticated);

  const steps = [
    { id: "play", title: "Play your first game", desc: "Sessions, streaks and achievements start counting", done: played, action: "Pick for me", run: onOpenRandom },
    {
      id: "queue",
      title: "Line up what’s next",
      desc: "Add a few games to your play queue",
      done: queued,
      action: "Browse library",
      run: () => useUiStore.getState().setActiveNav("library"),
    },
    { id: "artwork", title: "Add your artwork key", desc: "Covers and heroes from SteamGridDB", done: artworkKey, action: "Add key", run: () => onOpenSettings("integrations") },
    { id: "twitch", title: "Connect Twitch", desc: "See who’s streaming the games you own", done: twitch, action: "Connect", run: () => onOpenSettings("integrations") },
    { id: "theme", title: "Make it yours", desc: "Pick a theme, accent and fonts", done: themed, action: "Theme Studio", run: () => onOpenSettings("theme") },
  ];
  const done = steps.filter((s) => s.done).length;
  // Gone once it's finished, dismissed, or the library is clearly lived in.
  if (dismissed || done === steps.length || sessions >= 10) return null;

  return (
    <Tile
      id="get-started"
      title="Get started"
      action={
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {done} of {steps.length}
          </span>
          <button
            type="button"
            aria-label="Hide the get started checklist"
            onClick={() => useSettingsStore.getState().setHomeChecklistDismissed(true)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </span>
      }
    >
      <span
        role="progressbar"
        aria-label="Get started progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        className="block h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} />
      </span>
      <ol className="flex flex-col gap-1">
        {steps.map((s) => (
          <li key={s.id} data-testid={`get-started-${s.id}`} data-done={s.done} className="flex min-h-11 items-center gap-3">
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                s.done ? "bg-primary text-primary-foreground" : "border border-border",
              )}
            >
              {s.done && <Check className="size-3.5" strokeWidth={2.5} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm font-medium", s.done ? "text-muted-foreground" : "text-foreground")}>
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </span>
              {!s.done && <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>}
            </span>
            {!s.done && (
              <button
                type="button"
                onClick={s.run}
                className="pressable h-8 shrink-0 rounded-lg border border-input px-3 text-[13px] font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ol>
    </Tile>
  );
}

/* ── Your library at a glance ────────────────────────────────────── */

export const SOURCE_STYLE: Record<string, { label: string; colour: string }> = {
  steam: { label: "Steam", colour: "#3b82f6" },
  epic: { label: "Epic Games", colour: "#a1a1aa" },
  gog: { label: "GOG", colour: "#a855f7" },
  ubisoft: { label: "Ubisoft", colour: "#06b6d4" },
  battlenet: { label: "Battle.net", colour: "#6366f1" },
  xbox: { label: "Xbox", colour: "#22c55e" },
  standalone: { label: "Standalone", colour: "#f59e0b" },
};

export function LibraryGlanceTile({ games }: { games: Game[] }) {
  const shape = React.useMemo(() => libraryShape(games), [games]);
  if (shape.total === 0) return null;

  const browse = (patch: { source?: string; genre?: string }) => {
    const ui = useUiStore.getState();
    if (patch.source) ui.setSourceFilter(patch.source);
    if (patch.genre) ui.setGenreFilter(patch.genre);
    ui.setActiveNav("library");
  };

  return (
    <Tile id="library-glance" title="Your library">
      <p className="text-sm text-muted-foreground">
        <span className="mr-1.5 text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">{shape.total}</span>
        games from {shape.sources.length} {shape.sources.length === 1 ? "launcher" : "launchers"}
      </p>
      <div aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {shape.sources.map((s) => (
          <span key={s.id} style={{ width: `${(s.count / shape.total) * 100}%`, background: SOURCE_STYLE[s.id]?.colour ?? "var(--muted-foreground)" }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5">
        {shape.sources.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => browse({ source: s.id })}
              className="flex items-center gap-1.5 rounded text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: SOURCE_STYLE[s.id]?.colour ?? "var(--muted-foreground)" }} />
              {SOURCE_STYLE[s.id]?.label ?? s.id}
              <span className="tabular-nums text-foreground/80">{s.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {shape.genres.length > 0 && (
        <div className="mt-auto flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Most common genres</span>
          <ul className="flex flex-wrap gap-1.5">
            {shape.genres.map((g) => (
              <li key={g.name}>
                <button
                  type="button"
                  onClick={() => browse({ genre: g.name })}
                  className="pressable flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {g.name}
                  <span className="tabular-nums text-muted-foreground">{g.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}
