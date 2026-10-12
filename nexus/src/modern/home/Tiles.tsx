import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Award, Cpu, Flame, Gpu, GripVertical, Play, Shuffle, X } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { resolveUrl } from "@/lib/url";
import { navigateToStatsSection } from "@/lib/navigation";
import { getHardwareCached, trimCpuName, trimGpuName } from "@/lib/hardware";
import type { HardwareInfo, PlayQueueEntry } from "@/lib/tauri";
import { dayKey, lastDays, useDailyActivity } from "@/hooks/useDailyActivity";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useQueueStore } from "@/stores/queueStore";
import { useStreakStore } from "@/stores/streakStore";
import { useXpStore } from "@/stores/xpStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";

/* ── Shared tile frame ───────────────────────────────────────────── */

export function Tile({
  id,
  title,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`tile-${id}`}
      data-testid={`tile-${id}`}
      className={cn("flex h-full min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-card p-5", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`tile-${id}`} className="text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TileLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function Cover({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return (
    <span className={cn("img-outline block shrink-0 overflow-hidden rounded-md bg-secondary", className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      ) : (
        <span className="block size-full" style={{ background: placeholderGradient(name) }} />
      )}
    </span>
  );
}

/* ── Up next (play queue) ────────────────────────────────────────── */

const QUEUE_PREVIEW = 4;

export function UpNextTile({ onPlay }: { onPlay: (game: Game) => void }) {
  const entries = useQueueStore((s) => s.entries);
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? entries : entries.slice(0, QUEUE_PREVIEW);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = entries.map((x) => x.gameId);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    useQueueStore.getState().reorder(ids);
  };

  const play = (gameId: string) => {
    const game = useGameStore.getState().games.find((g) => g.id === gameId);
    if (game) onPlay(game);
  };

  return (
    <Tile
      id="up-next"
      title="Up next"
      action={
        entries.length > QUEUE_PREVIEW ? (
          <TileLink onClick={() => setExpanded((v) => !v)}>{expanded ? "Show less" : `Show all ${entries.length}`}</TileLink>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing queued. Add games from their menu or quick view.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((e) => e.gameId)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1">
              {shown.map((entry, i) => (
                <QueueRow key={entry.gameId} entry={entry} position={i + 1} onPlay={play} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </Tile>
  );
}

function QueueRow({ entry, position, onPlay }: { entry: PlayQueueEntry; position: number; onPlay: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.gameId });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid={`up-next-${entry.gameId}`}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg py-1 pr-1 transition-[background-color] duration-150 hover:bg-accent/50",
        isDragging && "relative z-10 bg-accent shadow-lg",
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${entry.name}`}
        className="flex h-8 w-5 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" strokeWidth={1.5} />
      </button>
      <span className="w-3 text-xs font-semibold tabular-nums text-muted-foreground">{position}</span>
      <Cover src={resolveUrl(entry.customCover ?? entry.coverUrl)} name={entry.name} className="h-11 w-8" />
      <button
        type="button"
        onClick={() => useUiStore.getState().setQuickViewGameId(entry.gameId)}
        className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="block truncate text-sm font-semibold text-foreground">{entry.name}</span>
        <span className="block truncate text-xs capitalize text-muted-foreground">
          {entry.status === "unset" ? entry.source : `${entry.status} · ${entry.source}`}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${entry.name} from queue`}
        onClick={() => useQueueStore.getState().remove(entry.gameId, entry.name)}
        className="pressable flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label={`Play ${entry.name}`}
        data-testid={`up-next-play-${entry.gameId}`}
        onClick={() => onPlay(entry.gameId)}
        className="pressable flex size-8 items-center justify-center rounded-md bg-secondary text-foreground outline-none hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Play className="size-3.5 fill-current" strokeWidth={2} />
      </button>
    </li>
  );
}

/* ── This week ───────────────────────────────────────────────────── */

export function WeekTile() {
  const { days, failed } = useDailyActivity();
  const fortnight = lastDays(14);
  const secondsOn = (d: Date) => days?.get(dayKey(d))?.seconds ?? 0;
  const week = fortnight.slice(7);
  const values = week.map(secondsOn);
  const total = values.reduce((a, b) => a + b, 0);
  const previous = fortnight.slice(0, 7).reduce((a, d) => a + secondsOn(d), 0);
  const delta = total - previous;
  const max = Math.max(...values, 1);

  return (
    <Tile id="week" title="This week" action={<TileLink onClick={() => useUiStore.getState().setActiveNav("stats")}>All stats</TileLink>}>
      {failed && !days ? (
        <p className="text-sm text-muted-foreground">Couldn’t load your play time. It’ll try again after your next session.</p>
      ) : (
        <>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[28px] font-bold leading-none tabular-nums text-foreground">{total > 0 ? formatPlayTime(total) : "0h"}</span>
        {days && (previous > 0 || total > 0) && (
          <span className={cn("text-xs font-medium", delta >= 0 ? "text-green-700 dark:text-success" : "text-muted-foreground")}>
            {delta >= 0 ? "+" : "−"}
            {formatPlayTime(Math.abs(delta))} vs last week
          </span>
        )}
      </div>
      <div role="img" aria-label={`Hours played each day this week, ${formatPlayTime(total)} in total`} className="flex h-28 items-end gap-2">
        {week.map((d, i) => {
          const isToday = i === week.length - 1;
          const s = values[i];
          return (
            <div key={dayKey(d)} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${s > 0 ? formatPlayTime(s) : "no play"}`}>
              <span
                className={cn("w-full max-w-[34px] rounded-t-[5px] rounded-b-[2px]", isToday ? "bg-primary" : "bg-foreground/15")}
                style={{ height: `${Math.max(s > 0 ? 6 : 2, (s / max) * 88)}px` }}
              />
              <span className={cn("text-[11px]", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {d.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
            </div>
          );
        })}
      </div>
        </>
      )}
    </Tile>
  );
}

/* ── Can't decide? ───────────────────────────────────────────────── */

export function RandomTile({ onPlay, onOpenPack }: { onPlay: (game: Game) => void; onOpenPack: () => void }) {
  const games = useGameStore((s) => s.games);
  const hiddenIds = useSettingsStore((s) => s.hiddenGameIds);
  const pool = React.useMemo(() => {
    const ok = games.filter((g) => !hiddenIds.includes(g.id) && g.status !== "removed" && g.status !== "dropped" && !g.completed);
    const backlog = ok.filter((g) => g.status === "backlog");
    return backlog.length > 0 ? backlog : ok.filter((g) => g.totalPlayTimeS === 0);
  }, [games, hiddenIds]);
  const [pickId, setPickId] = React.useState<string | null>(null);

  const reroll = React.useCallback(() => {
    if (pool.length === 0) return setPickId(null);
    const options = pool.length > 1 ? pool.filter((g) => g.id !== pickId) : pool;
    setPickId(options[Math.floor(Math.random() * options.length)].id);
  }, [pool, pickId]);

  React.useEffect(() => {
    if (!pickId || !pool.some((g) => g.id === pickId)) reroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  const pick = pool.find((g) => g.id === pickId) ?? null;

  return (
    <Tile id="random" title="Can’t decide?" action={<TileLink onClick={onOpenPack}>Open a pack</TileLink>}>
      {!pick ? (
        <p className="text-sm text-muted-foreground">Your backlog is clear. Nice.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => useUiStore.getState().setQuickViewGameId(pick.id)}
            className="flex items-center gap-3.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Cover src={pick.coverUrl} name={pick.name} className="h-[100px] w-[67px] rounded-lg" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span data-testid="random-pick" className="line-clamp-2 text-sm font-semibold text-foreground">
                {pick.name}
              </span>
              <span className="text-xs capitalize text-muted-foreground">
                {pick.status === "backlog" ? "Backlog" : "Not played"} · {pick.source}
              </span>
              {pick.hltbMainH ? <span className="text-xs text-muted-foreground">~{Math.round(pick.hltbMainH)}h to beat</span> : null}
            </span>
          </button>
          <div className="mt-auto flex gap-2">
            <button
              type="button"
              onClick={() => onPlay(pick)}
              className="pressable h-9 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Play
            </button>
            <button
              type="button"
              data-testid="random-reroll"
              onClick={reroll}
              disabled={pool.length < 2}
              className="pressable flex h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Shuffle className="size-3.5" strokeWidth={1.75} />
              Reroll
            </button>
          </div>
        </>
      )}
    </Tile>
  );
}

/* ── Streak ──────────────────────────────────────────────────────── */

const HEAT_WEEKS = 18;

function heatClass(seconds: number) {
  if (seconds <= 0) return "bg-secondary";
  if (seconds < 1800) return "bg-orange-500/30";
  if (seconds < 3600) return "bg-orange-500/50";
  if (seconds < 7200) return "bg-orange-500/75";
  return "bg-orange-400";
}

export function StreakTile() {
  const streak = useStreakStore((s) => s.streak);
  const { days, failed } = useDailyActivity();
  const cells = lastDays(HEAT_WEEKS * 7);
  const playedDays = days ? cells.filter((d) => (days.get(dayKey(d))?.seconds ?? 0) > 0).length : 0;
  const current = streak?.currentStreak ?? 0;

  return (
    <Tile id="streak" title="Streak">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex min-w-[100px] flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
            <Flame className="size-5" strokeWidth={2} />
            <span className="text-[34px] font-bold leading-none tabular-nums">{current}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {current === 1 ? "day" : "days"} · best {streak?.longestStreak ?? 0}
          </span>
        </div>
        {failed && !days ? (
          <p className="text-xs text-muted-foreground">Couldn’t load your recent days.</p>
        ) : (
        <div
          role="img"
          aria-label={`Played on ${playedDays} of the last ${HEAT_WEEKS * 7} days`}
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridAutoColumns: "10px" }}
        >
          {cells.map((d) => {
            const s = days?.get(dayKey(d))?.seconds ?? 0;
            return <span key={dayKey(d)} className={cn("size-[10px] rounded-[2px]", heatClass(s))} />;
          })}
        </div>
        )}
      </div>
    </Tile>
  );
}

/* ── Level ───────────────────────────────────────────────────────── */

const LR = 32;
const LSTROKE = 6;
const LSIZE = (LR + LSTROKE) * 2;
const LCIRC = 2 * Math.PI * LR;

export function LevelTile() {
  const xp = useXpStore((s) => s.summary);
  if (!xp) return null;
  const toNext = Math.max(0, xp.nextLevelXp - xp.currentLevelXp);
  return (
    <Tile id="level" title="Level">
      <button
        type="button"
        onClick={() => navigateToStatsSection("xp")}
        className="flex items-center gap-4 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Level ${xp.currentLevel}, ${toNext.toLocaleString()} XP to level ${xp.currentLevel + 1}. Open XP in Stats`}
      >
        <span className="relative shrink-0" style={{ width: LSIZE, height: LSIZE }}>
          <svg width={LSIZE} height={LSIZE} viewBox={`0 0 ${LSIZE} ${LSIZE}`} className="-rotate-90" aria-hidden>
            <circle cx={LSIZE / 2} cy={LSIZE / 2} r={LR} fill="none" stroke="var(--secondary)" strokeWidth={LSTROKE} />
            <circle
              cx={LSIZE / 2}
              cy={LSIZE / 2}
              r={LR}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={LSTROKE}
              strokeLinecap="round"
              strokeDasharray={LCIRC}
              strokeDashoffset={LCIRC * (1 - Math.min(Math.max(xp.progressToNextLevel, 0), 1))}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums text-foreground">
            {xp.currentLevel}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">Level {xp.currentLevel}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{xp.totalXp.toLocaleString()} XP total</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {toNext.toLocaleString()} XP to level {xp.currentLevel + 1}
          </span>
        </span>
      </button>
    </Tile>
  );
}

/* ── Achievements ────────────────────────────────────────────────── */

const RARITY: Record<string, string> = {
  common: "var(--rarity-common)",
  uncommon: "var(--rarity-uncommon)",
  rare: "var(--rarity-rare)",
  epic: "var(--rarity-epic)",
  legendary: "var(--rarity-legendary)",
};

export function AchievementsTile() {
  const statuses = useAchievementStore((s) => s.statuses);
  if (statuses.length === 0) return null;

  const unlocked = statuses.filter((a) => a.unlocked);
  const latest = [...unlocked].sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))[0];
  const closest = statuses
    .filter((a) => !a.unlocked && a.progressTarget && a.progressCurrent != null)
    .sort((a, b) => b.progressCurrent! / b.progressTarget! - a.progressCurrent! / a.progressTarget!)[0];

  const open = (id?: string) => {
    if (id) useAchievementStore.getState().setHighlightId(id);
    useUiStore.getState().setActiveNav("achievements");
  };

  return (
    <Tile
      id="achievements"
      title="Achievements"
      action={<span className="text-xs tabular-nums text-muted-foreground">{unlocked.length} of {statuses.length} unlocked</span>}
    >
      {latest && (
        <button type="button" onClick={() => open(latest.id)} className="flex items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `color-mix(in oklab, ${RARITY[latest.rarity]} 18%, transparent)`, color: RARITY[latest.rarity] }}
          >
            <Award className="size-5" strokeWidth={2} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {latest.name}
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: RARITY[latest.rarity] }}>
                {latest.rarity}
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">{latest.description}</span>
          </span>
        </button>
      )}
      {closest && (
        <button type="button" onClick={() => open(closest.id)} className="flex flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex justify-between gap-3 text-xs">
            <span className="truncate text-foreground/85">Next: {closest.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {closest.progressCurrent} / {closest.progressTarget}
            </span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.round((closest.progressCurrent! / closest.progressTarget!) * 100)}%` }}
            />
          </span>
        </button>
      )}
      {!latest && !closest && (
        <TileLink onClick={() => open()}>See all achievements</TileLink>
      )}
    </Tile>
  );
}

/* ── Live for your games ─────────────────────────────────────────── */

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

export function TwitchTile() {
  const enabled = useSettingsStore((s) => s.twitchEnabled);
  const authed = useTwitchStore((s) => s.isAuthenticated);
  const trending = useTwitchStore((s) => s.trendingGames);
  const games = useGameStore((s) => s.games);
  if (!enabled || !authed || trending.length === 0) return null;

  const top = [...trending].sort((a, b) => b.twitchViewerCount - a.twitchViewerCount).slice(0, 3);
  const openTwitch = (name: string) => {
    const ui = useUiStore.getState();
    ui.setTwitchPanelScrollToGameName(name);
    ui.setActiveNav("twitch");
  };

  return (
    <Tile id="twitch" title="Live for your games" action={<TileLink onClick={() => useUiStore.getState().setActiveNav("twitch")}>Open Twitch</TileLink>}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {top.map((t) => {
          const game = games.find((g) => g.id === t.gameId);
          return (
            <button
              key={t.gameId}
              type="button"
              onClick={() => openTwitch(t.gameName)}
              className="flex items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="relative">
                <Cover src={game?.heroUrl ?? game?.coverUrl ?? null} name={t.gameName} className="aspect-video w-24 rounded-md" />
                <span className="absolute left-1 top-1 rounded-[3px] bg-red-600 px-1 text-[9px] font-bold tracking-wide text-white">LIVE</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">{t.gameName}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t.twitchStreamCount} {t.twitchStreamCount === 1 ? "channel" : "channels"} · {compact(t.twitchViewerCount)} watching
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Tile>
  );
}

/* ── This PC ─────────────────────────────────────────────────────── */

export function ThisPcTile() {
  const show = useSettingsStore((s) => s.showHardwareOnHome);
  const [hw, setHw] = React.useState<HardwareInfo | null>(null);

  React.useEffect(() => {
    if (!show) return;
    let cancelled = false;
    getHardwareCached()
      .then((info) => !cancelled && setHw(info))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!show || !hw) return null;
  const rows = [
    hw.cpuBrand !== "unknown" ? { label: "CPU", name: trimCpuName(hw.cpuBrand, hw.cpuName), icon: <Cpu className="size-[18px]" strokeWidth={1.5} /> } : null,
    hw.gpuBrand !== "unknown" ? { label: "Graphics", name: trimGpuName(hw.gpuBrand, hw.gpuName), icon: <Gpu className="size-[18px]" strokeWidth={1.5} /> } : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return null;

  return (
    <Tile id="this-pc" title="This PC">
      <dl className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground/80">
              {r.icon}
            </span>
            <span className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="truncate text-sm font-semibold text-foreground" title={r.name}>
                {r.name}
              </dd>
            </span>
          </div>
        ))}
      </dl>
    </Tile>
  );
}
