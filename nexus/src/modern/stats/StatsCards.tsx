import * as React from "react";
import { Shield, Tv } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { getTwitchWatchForRange, type MasteryTierValue, type WatchAggregate } from "@/lib/tauri";
import {
  SESSION_LENGTHS,
  activityBuckets,
  activityUnit,
  heatmapWeeks,
  sessionLengthCounts,
  type SessionRecord,
  type TopGame,
} from "@/lib/statsData";
import { useStreakStore } from "@/stores/streakStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { useXpStore } from "@/stores/xpStore";
import { useMilestoneStore } from "@/stores/milestoneStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { MilestoneIcon } from "@/components/Milestones/MilestoneIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DayRange = { start: string; end: string };

const openGame = (id: string) => useUiStore.getState().setDetailOverlayGameId(id);

/** Hours with one decimal under ten, whole above: "6.2", "84". */
function hours(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
}

export function StatCard({
  title,
  aside,
  className,
  children,
  ...rest
}: { title: string; aside?: React.ReactNode } & React.ComponentPropsWithoutRef<"section">) {
  return (
    <section
      aria-label={title}
      {...rest}
      className={cn("flex min-w-0 scroll-mt-16 flex-col gap-4 rounded-2xl border border-border bg-card p-5", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {aside && <span className="text-[13px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Cover({ name, src, className }: { name: string; src: string | null | undefined; className?: string }) {
  return (
    <span className={cn("img-outline block shrink-0 overflow-hidden rounded bg-secondary", className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="block size-full" style={{ background: placeholderGradient(name) }} />
      )}
    </span>
  );
}

/* ── Play activity ───────────────────────────────────────────────── */

const CHART_H = 160;

export function ActivityCard({ sessions, span, rangeLabel }: { sessions: SessionRecord[]; span: DayRange; rangeLabel: string }) {
  const buckets = React.useMemo(() => activityBuckets(sessions, span), [sessions, span]);
  const unit = activityUnit(span);
  const max = Math.max(0, ...buckets.map((b) => b.seconds));
  const total = buckets.reduce((sum, b) => sum + b.seconds, 0);
  const peak = buckets.reduce((best, b) => (b.seconds > best.seconds ? b : best), buckets[0]);
  const showValues = buckets.length <= 16;
  const labelEvery = Math.ceil(buckets.length / 16);
  const gap = buckets.length > 16 ? "gap-1.5" : "gap-3";

  return (
    <StatCard title="Play activity" aside={`Hours per ${unit} · ${rangeLabel}`} data-testid="stats-activity-chart">
      <div className="relative">
        <div
          role="img"
          aria-label={
            total > 0
              ? `${formatPlayTime(total)} played, ${rangeLabel}. Busiest: ${peak.title}, ${formatPlayTime(peak.seconds)}.`
              : `No play, ${rangeLabel}.`
          }
          className={cn("flex items-end border-b border-border", gap)}
          style={{ height: CHART_H + 22 }}
        >
          {buckets.map((b) => (
            <Tooltip key={b.key}>
              <TooltipTrigger asChild>
                <div className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  {showValues && b.seconds > 0 && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{hours(b.seconds)}</span>
                  )}
                  <span
                    className={cn(
                      "block w-full max-w-12 rounded-b-[2px] rounded-t-[5px] transition-colors duration-150",
                      b.current ? "bg-primary" : "bg-primary/30 group-hover:bg-primary/60",
                    )}
                    style={{ height: b.seconds > 0 ? Math.max(3, Math.round((b.seconds / max) * CHART_H)) : 0 }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {b.title} · {b.seconds > 0 ? formatPlayTime(b.seconds) : "no play"}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {total === 0 && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">No play in this period</p>
        )}
        {/* The bars as text, for screen readers: the tooltips are hover-only. */}
        <ul className="sr-only">
          {buckets
            .filter((b) => b.seconds > 0)
            .map((b) => (
              <li key={b.key}>
                {b.title}: {formatPlayTime(b.seconds)}
              </li>
            ))}
        </ul>
      </div>
      <div aria-hidden className={cn("-mt-2 flex", gap)}>
        {buckets.map((b, i) => (
          <span key={b.key} className={cn("min-w-0 flex-1 truncate text-center text-[11px]", b.current ? "font-medium text-foreground" : "text-muted-foreground")}>
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </StatCard>
  );
}

/* ── Streaks ─────────────────────────────────────────────────────── */

const HEAT = ["bg-secondary", "bg-orange-500/25", "bg-orange-500/45", "bg-orange-500/70", "bg-orange-500"];

export function StreakCard({ allSessions, className }: { allSessions: SessionRecord[]; className?: string }) {
  const streak = useStreakStore((s) => s.streak);
  const weeks = React.useMemo(() => heatmapWeeks(allSessions, 26), [allSessions]);
  const daysPlayed = weeks.flat().filter((c) => c.seconds > 0).length;
  const started = streak?.currentStreak && streak.streakStartedAt
    ? new Date(streak.streakStartedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <StatCard id="stats-streaks" title="Streaks" className={className}>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <p className="flex flex-col">
          <span className="text-[30px] font-bold leading-tight tabular-nums text-orange-600 dark:text-orange-400">{streak?.currentStreak ?? 0}</span>
          <span className="text-[12.5px] text-muted-foreground">Current streak (days)</span>
        </p>
        <p className="flex flex-col">
          <span className="text-[30px] font-bold leading-tight tabular-nums text-foreground">{streak?.longestStreak ?? 0}</span>
          <span className="text-[12.5px] text-muted-foreground">Longest streak</span>
        </p>
        <p className="flex flex-col">
          <span className="flex h-[37.5px] items-end pb-1 text-[17px] font-semibold text-foreground">{started}</span>
          <span className="text-[12.5px] text-muted-foreground">Streak started</span>
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div role="img" aria-label={`Played on ${daysPlayed} of the last 182 days`} className="flex gap-[3px]">
          {weeks.map((week) => (
            <div key={week[0].date} className="flex min-w-0 max-w-[15px] flex-1 flex-col gap-[3px]">
              {week.map((c) => (
                <span
                  key={c.date}
                  title={c.future ? undefined : `${c.date}: ${c.seconds > 0 ? formatPlayTime(c.seconds) : "no play"}`}
                  className={cn("block aspect-square w-full rounded-[3px]", c.future ? "bg-transparent" : HEAT[c.level])}
                />
              ))}
            </div>
          ))}
        </div>
        <div aria-hidden className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          Less
          {HEAT.map((cls) => (
            <span key={cls} className={cn("size-2.5 rounded-[2px]", cls)} />
          ))}
          More
        </div>
      </div>
    </StatCard>
  );
}

/* ── Mastery ─────────────────────────────────────────────────────── */

type Tier = Exclude<MasteryTierValue, "none">;
const TIERS: { tier: Tier; label: string; range: string }[] = [
  { tier: "diamond", label: "Diamond", range: "100h+" },
  { tier: "platinum", label: "Platinum", range: "50–100h" },
  { tier: "gold", label: "Gold", range: "25–50h" },
  { tier: "silver", label: "Silver", range: "10–25h" },
  { tier: "bronze", label: "Bronze", range: "1–10h" },
];
/** Tier hue pulled toward the text colour so gold and diamond stay legible on light. */
const tierText = (t: Tier) => `color-mix(in oklab, var(--tier-${t}) 70%, var(--foreground))`;

export function MasteryCard({ className }: { className?: string }) {
  const tiers = useMasteryStore((s) => s.tiers);
  const games = useGameStore((s) => s.games);
  const byTier = React.useMemo(() => {
    const out = Object.fromEntries(TIERS.map((t) => [t.tier, [] as { id: string; name: string; cover: string | null; seconds: number }[]]));
    for (const entry of tiers.values()) {
      // Skips "none" and any tier this card doesn't know.
      const list = out[entry.tier];
      const game = list && games.find((g) => g.id === entry.gameId);
      if (!game) continue;
      list.push({ id: game.id, name: game.name, cover: game.coverUrl, seconds: entry.totalPlayTimeS });
    }
    for (const list of Object.values(out)) list.sort((a, b) => b.seconds - a.seconds);
    return out;
  }, [tiers, games]);
  const ranked = Object.values(byTier).reduce((n, list) => n + list.length, 0);

  return (
    <StatCard id="stats-mastery" title="Mastery tiers" aside={`${ranked} ${ranked === 1 ? "game" : "games"} ranked`} className={className}>
      <div className="grid grid-cols-5 gap-2">
        {TIERS.map(({ tier, label, range }) => {
          const list = byTier[tier];
          const body = (
            <>
              <Shield className="size-[22px]" strokeWidth={2} style={{ color: `var(--tier-${tier})` }} />
              <span className={cn("text-[22px] font-bold leading-none tabular-nums", list.length ? "text-foreground" : "text-muted-foreground/60")}>
                {list.length}
              </span>
              <span className="text-xs font-semibold" style={{ color: tierText(tier) }}>
                {label}
              </span>
              <span className="text-[11px] text-muted-foreground">{range}</span>
            </>
          );
          const tile = "flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-3.5";
          if (list.length === 0) {
            return (
              <div key={tier} className={cn(tile, "border-border/60 bg-background/30")}>
                {body}
              </div>
            );
          }
          return (
            <Popover key={tier}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid={`mastery-tier-${tier}`}
                  aria-label={`${label}: ${list.length} ${list.length === 1 ? "game" : "games"}`}
                  className={cn(tile, "pressable border-border bg-background/50 outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  {body}
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="flex max-h-80 w-72 flex-col gap-0.5 overflow-y-auto p-1.5">
                <p className="px-2 pb-1 pt-1.5 text-xs font-semibold" style={{ color: tierText(tier) }}>
                  {label} · {range}
                </p>
                {list.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => openGame(g.id)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <Cover name={g.name} src={g.cover} className="h-8 w-6" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{g.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatPlayTime(g.seconds)}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </StatCard>
  );
}

/* ── Level & XP ──────────────────────────────────────────────────── */

const XP_SOURCES: Record<string, string> = {
  session_complete: "Sessions",
  session_bonus_1h: "Session bonus",
  achievement_unlock: "Achievements",
  game_complete: "Completions",
  streak_day: "Streaks",
  game_launch: "Launches",
  goal_complete: "Goals",
};
const RING = 104;
const STROKE = 9;
const R = (RING - STROKE) / 2;
const C = 2 * Math.PI * R;

export function LevelCard({ className }: { className?: string }) {
  const summary = useXpStore((s) => s.summary);
  const breakdown = useXpStore((s) => s.breakdown);
  const level = summary?.currentLevel ?? 0;
  const progress = summary?.progressToNextLevel ?? 0;
  const toNext = summary ? Math.max(0, summary.nextLevelXp - summary.currentLevelXp) : 0;
  const sources = [...breakdown].sort((a, b) => b.totalXp - a.totalXp).slice(0, 4);

  return (
    <StatCard id="stats-level" title="Level & XP" data-testid="stats-xp-section" className={className}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0" style={{ width: RING, height: RING }}>
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="-rotate-90" aria-hidden>
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-secondary" />
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              className="stroke-primary"
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[32px] font-bold leading-none tabular-nums text-foreground">{level}</span>
            <span className="text-[11px] text-muted-foreground">Level</span>
          </span>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-xl font-bold tabular-nums text-foreground">{(summary?.totalXp ?? 0).toLocaleString()} XP</span>
            <span className="text-[12.5px] tabular-nums text-muted-foreground">
              {toNext.toLocaleString()} to level {level + 1}
            </span>
          </div>
          <span
            role="progressbar"
            aria-label={`Progress to level ${level + 1}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="block h-1.5 overflow-hidden rounded-full bg-secondary"
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
          {sources.length > 0 && (
            <dl className="mt-1 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[13px]">
              {sources.map((s) => (
                <div key={s.sourceType} className="flex justify-between gap-2">
                  <dt className="truncate text-muted-foreground">{XP_SOURCES[s.sourceType] ?? s.sourceType}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{s.totalXp.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </StatCard>
  );
}

/* ── Top games ───────────────────────────────────────────────────── */

export function TopGamesCard({
  top,
  totalSeconds,
  gamesPlayed,
  className,
}: {
  top: TopGame[];
  totalSeconds: number;
  gamesPlayed: number;
  className?: string;
}) {
  const games = useGameStore((s) => s.games);
  const shown = top.slice(0, 4);
  const max = shown[0]?.totalPlayTimeS ?? 0;
  const rest = Math.max(0, totalSeconds - shown.reduce((sum, g) => sum + g.totalPlayTimeS, 0));
  const restCount = Math.max(0, gamesPlayed - shown.length);

  return (
    <StatCard title="Top games" className={className}>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing played in this period.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((g) => {
            const cover = games.find((x) => x.id === g.id)?.coverUrl ?? g.coverUrl;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => openGame(g.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Cover name={g.name} src={cover} className="h-[38px] w-7" />
                  <TopRow name={g.name} seconds={g.totalPlayTimeS} pct={max ? g.totalPlayTimeS / max : 0} />
                </button>
              </li>
            );
          })}
          {restCount > 0 && rest > 0 && (
            <li className="flex items-center gap-3 py-1.5">
              <span aria-hidden className="h-[38px] w-7 shrink-0 rounded bg-secondary" />
              <TopRow name={`${restCount} other ${restCount === 1 ? "game" : "games"}`} seconds={rest} pct={max ? Math.min(1, rest / max) : 0} muted />
            </li>
          )}
        </ul>
      )}
    </StatCard>
  );
}

function TopRow({ name, seconds, pct, muted }: { name: string; seconds: number; pct: number; muted?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="flex justify-between gap-2 text-[13px]">
        <span className={cn("truncate font-semibold", muted ? "text-muted-foreground" : "text-foreground")}>{name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{formatPlayTime(seconds)}</span>
      </span>
      <span className="block h-[5px] overflow-hidden rounded-full bg-secondary">
        <span className={cn("block h-full rounded-full", muted ? "bg-muted-foreground/40" : "bg-primary")} style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
    </span>
  );
}

/* ── Session length ──────────────────────────────────────────────── */

const LENGTH_H = 96;

export function SessionLengthCard({
  sessions,
  onShowHistory,
  className,
}: {
  sessions: SessionRecord[];
  onShowHistory: () => void;
  className?: string;
}) {
  const counts = sessionLengthCounts(sessions);
  const max = Math.max(0, ...counts);
  const avg = sessions.length ? sessions.reduce((sum, s) => sum + s.durationS, 0) / sessions.length : 0;

  return (
    <StatCard
      id="stats-sessions"
      title="Session length"
      aside={sessions.length ? `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} · avg ${formatPlayTime(avg)}` : undefined}
      className={className}
    >
      <div
        role="img"
        aria-label={SESSION_LENGTHS.map((b, i) => `${b.label}: ${counts[i]}`).join(", ")}
        className="flex items-end gap-2.5"
        style={{ height: LENGTH_H + 20 }}
      >
        {counts.map((n, i) => (
          <div key={SESSION_LENGTHS[i].label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>
            <span
              className="block w-full rounded-b-[2px] rounded-t-[5px] bg-primary/40"
              style={{ height: n > 0 ? Math.max(3, Math.round((n / max) * LENGTH_H)) : 0 }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="-mt-2 flex gap-2.5">
        {SESSION_LENGTHS.map((b) => (
          <span key={b.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {b.label}
          </span>
        ))}
      </div>
      {sessions.length > 0 && (
        <button
          type="button"
          data-testid="stats-show-history"
          onClick={onShowHistory}
          className="self-start rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Full session history
        </button>
      )}
    </StatCard>
  );
}

/* ── Twitch watch time ───────────────────────────────────────────── */

const TWITCH_SHADES = ["#9146ff", "#6d3fc0", "#4b2d85"];

export function TwitchWatchCard({ span, className }: { span: DayRange; className?: string }) {
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const [agg, setAgg] = React.useState<WatchAggregate | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getTwitchWatchForRange(span.start, span.end, 3)
      .then((data) => !cancelled && setAgg(data))
      .catch(() => !cancelled && setAgg(null));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, span.start, span.end]);

  const total = agg?.totals?.totalSecs ?? 0;
  // Nothing watched: leave the row to the other cards.
  if (total <= 0) return null;

  const parts = (agg?.topGames ?? [])
    .slice(0, 3)
    .map((g, i) => ({ name: g.twitchGameName ?? "Unknown", share: g.totalSecs / total, color: TWITCH_SHADES[i] }));
  const other = Math.max(0, 1 - parts.reduce((sum, p) => sum + p.share, 0));
  if (other > 0.005) parts.push({ name: "Other", share: other, color: "var(--muted-foreground)" });

  return (
    <StatCard title="Twitch watch time" className={className} data-testid="stats-twitch-watch">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-[26px] font-bold leading-tight tabular-nums text-foreground">
          <Tv className="size-5 text-[#9146ff]" strokeWidth={2} aria-hidden />
          {formatPlayTime(total)}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {parts[0] && parts[0].name !== "Other" ? `Mostly ${parts[0].name} streams` : `${agg?.totals.sessionCount ?? 0} watch sessions`}
        </span>
      </div>
      {parts.length > 0 && (
        <>
          <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {parts.map((p) => (
              <span key={p.name} style={{ width: `${p.share * 100}%`, background: p.color, opacity: p.name === "Other" ? 0.35 : 1 }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
            {parts.map((p) => (
              <li key={p.name} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: p.color, opacity: p.name === "Other" ? 0.35 : 1 }} />
                {p.name} {Math.round(p.share * 100)}%
              </li>
            ))}
          </ul>
        </>
      )}
    </StatCard>
  );
}

/* ── Milestones ──────────────────────────────────────────────────── */

export function MilestonesCard({ sessions, className }: { sessions: SessionRecord[]; className?: string }) {
  const history = useMilestoneStore((s) => s.history);
  const loading = useMilestoneStore((s) => s.historyLoading);
  const ids = React.useMemo(() => sessions.map((s) => s.id), [sessions]);

  React.useEffect(() => {
    if (ids.length > 0) useMilestoneStore.getState().loadHistory(ids);
  }, [ids]);

  const recent = React.useMemo(() => {
    if (ids.length === 0 || !history) return [];
    const when = new Map(sessions.map((s) => [s.id, s.startedAt]));
    return history
      .filter((h) => when.has(h.sessionId))
      .flatMap((h) => h.milestones.map((m) => ({ ...m, key: `${h.sessionId}:${m.id}`, at: when.get(h.sessionId)! })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5);
  }, [history, sessions, ids.length]);

  return (
    <StatCard id="stats-milestones" title="Recent milestones" data-testid="stats-milestones-section" className={className}>
      {loading && recent.length === 0 ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 rounded-lg bg-secondary motion-safe:animate-pulse" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No milestones in this period.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {recent.map((m) => (
            <li key={m.key} className="flex items-center gap-3 text-[13px]">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-green-500/12 text-green-700 dark:text-green-400">
                <MilestoneIcon name={m.icon} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-foreground">{m.title}</span>
                {m.gameName && <span className="text-muted-foreground"> · {m.gameName}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </StatCard>
  );
}
