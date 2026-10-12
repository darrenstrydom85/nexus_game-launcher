import * as React from "react";
import { useReducedMotionConfig } from "motion/react";
import { CalendarRange, Gift } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { PRESETS, toDateStr } from "@/lib/statsRange";
import { filterSessionsByRange, formatDayRange, newGamesInRange, previousRange } from "@/lib/statsData";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { SessionHistory } from "@/components/Library/stats/SessionHistory";
import { useLibraryStatsData, useStatsRange, type RangeChoice } from "./useStatsData";
import {
  ActivityCard,
  LevelCard,
  MasteryCard,
  MilestonesCard,
  SessionLengthCard,
  StreakCard,
  TopGamesCard,
  TwitchWatchCard,
} from "./StatsCards";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "streaks", label: "Streaks" },
  { id: "level", label: "Level & XP" },
  { id: "mastery", label: "Mastery" },
  { id: "milestones", label: "Milestones" },
  { id: "sessions", label: "Sessions" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"] | "history";

const PERIOD_NOUN: Record<RangeChoice, string> = {
  this_week: "this week",
  this_month: "this month",
  last_30_days: "in 30 days",
  this_year: "this year",
  all: "",
  custom: "in this range",
};

/** Content column: wide enough for three cards abreast, never a full ultrawide line. */
const COLUMN = "mx-auto w-full max-w-[1280px] px-10";

export function StatsPage({ onOpenWrapped }: { onOpenWrapped: () => void }) {
  const { choice, range, choosePreset, applyCustom } = useStatsRange();
  const data = useLibraryStatsData(range);
  const games = useGameStore((s) => s.games);
  const scrollTarget = useUiStore((s) => s.statsScrollTarget);
  // Config-aware: also true when the app's Animations setting is off.
  const reduce = useReducedMotionConfig();
  const [active, setActive] = React.useState<SectionId>("overview");

  const jump = React.useCallback(
    (id: SectionId) => {
      document.getElementById(`stats-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      setActive(id);
    },
    [reduce],
  );

  // Tray menu / notification "open XP" or "open milestones".
  React.useEffect(() => {
    if (!scrollTarget || data.loading) return;
    jump(scrollTarget === "xp" ? "level" : "milestones");
    useUiStore.getState().setStatsScrollTarget(null);
  }, [scrollTarget, data.loading, jump]);

  // Highlight the section in view.
  React.useEffect(() => {
    if (data.loading || typeof IntersectionObserver === "undefined") return;
    const root = document.querySelector('[data-testid="modern-main"]');
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace("stats-", "") as SectionId);
      },
      { root, rootMargin: "-72px 0px -65% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`stats-${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [data.loading]);

  const s = data.displayStats;
  const sessions = data.filteredSessions;
  const avgSession = sessions.length > 0 ? s.totalPlayTimeS / sessions.length : 0;
  const mostPlayed = data.displayTopGames[0] ?? null;
  const mostPlayedCover = mostPlayed ? (games.find((g) => g.id === mostPlayed.id)?.coverUrl ?? mostPlayed.coverUrl) : null;
  const share = mostPlayed && s.totalPlayTimeS > 0 ? Math.round((mostPlayed.totalPlayTimeS / s.totalPlayTimeS) * 100) : null;
  const rangeLabel = formatDayRange(data.span);

  // Period over period: "+8h 12m vs 1–12 Sep".
  const prev = choice === "all" ? null : previousRange(choice, data.span);
  const prevSeconds = prev ? filterSessionsByRange(data.allSessions, prev).reduce((sum, x) => sum + x.durationS, 0) : 0;
  const delta = s.totalPlayTimeS - prevSeconds;
  const playSub = !prev
    ? sessions.length
      ? `since ${new Date(`${data.span.start}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
      : "—"
    : delta === 0
      ? `same as ${formatDayRange(prev)}`
      : `${delta > 0 ? "+" : "−"}${formatPlayTime(Math.abs(delta))} vs ${formatDayRange(prev)}`;
  const newGames = choice === "all" ? 0 : newGamesInRange(data.allSessions, data.span);

  return (
    <div data-testid="stats-page" className="flex flex-col">
      <div className={cn(COLUMN, "flex flex-wrap items-center justify-between gap-4 pb-4 pt-7")}>
        <div className="flex items-center gap-3.5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Stats</h1>
          <button
            type="button"
            data-testid="open-wrapped-button"
            onClick={onOpenWrapped}
            className="pressable flex h-8 items-center gap-1.5 rounded-lg border border-primary/50 px-3 text-[13px] font-semibold text-foreground outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Gift className="size-3.5" strokeWidth={2} />
            My Wrapped
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Period"
            value={choice === "custom" ? null : choice}
            onValueChange={choosePreset}
            options={PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          />
          <CustomRange active={choice === "custom"} range={range} onApply={applyCustom} />
        </div>
      </div>

      <nav aria-label="Stats sections" className="sticky top-0 z-10 border-b border-border bg-background/95">
        <div className={cn(COLUMN, "flex flex-wrap gap-x-6")}>
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              data-testid={`stats-jump-${sec.id}`}
              aria-current={active === sec.id ? "true" : undefined}
              onClick={() => jump(sec.id)}
              className={cn(
                "-mb-px border-b-2 py-3 text-sm outline-none transition-[color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                active === sec.id ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </nav>

      {data.loading ? (
        <div data-testid="stats-loading" className={cn(COLUMN, "flex flex-col gap-5 pb-12 pt-6")}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-secondary motion-safe:animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-secondary motion-safe:animate-pulse" />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="h-56 rounded-2xl bg-secondary motion-safe:animate-pulse" />
            <div className="h-56 rounded-2xl bg-secondary motion-safe:animate-pulse" />
          </div>
        </div>
      ) : data.failed ? (
        <div data-testid="stats-error" className={cn(COLUMN, "flex flex-col items-center gap-3 py-24 text-center")}>
          <p className="text-sm text-muted-foreground">Couldn’t load your stats.</p>
          <button
            type="button"
            onClick={data.retry}
            className="pressable h-8 rounded-lg border border-input px-3 text-[13px] font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className={cn(COLUMN, "flex flex-col gap-5 pb-12 pt-6")}>
          <section id="stats-overview" aria-label="Overview" className="scroll-mt-16">
            <dl data-testid="stats-summary" className="flex flex-wrap gap-3.5">
              <Kpi
                label="Play time"
                value={formatPlayTime(s.totalPlayTimeS)}
                sub={playSub}
                tone={prev && delta > 0 ? "up" : undefined}
              />
              <Kpi
                label="Games played"
                value={String(s.gamesPlayed)}
                sub={choice === "all" ? `${s.gamesUnplayed} not played yet` : `${newGames} new ${PERIOD_NOUN[choice]}`}
              />
              <Kpi label="Sessions" value={String(sessions.length)} sub={sessions.length > 0 ? `avg ${formatPlayTime(avgSession)}` : "—"} />
              <div className="flex min-w-0 flex-[1.4_1_260px] items-center rounded-2xl border border-border bg-card px-5 py-3.5">
                <dt className="sr-only">Most played</dt>
                {mostPlayed ? (
                  <dd className="flex min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => useUiStore.getState().setDetailOverlayGameId(mostPlayed.id)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="img-outline h-[68px] w-[46px] shrink-0 overflow-hidden rounded-md bg-secondary">
                        {mostPlayedCover ? (
                          <img src={mostPlayedCover} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="block size-full" style={{ background: placeholderGradient(mostPlayed.name) }} />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span aria-hidden className="text-[12.5px] text-muted-foreground">Most played</span>
                        <span className="truncate text-[17px] font-semibold text-foreground">{mostPlayed.name}</span>
                        <span className="text-[12.5px] text-muted-foreground">
                          {formatPlayTime(mostPlayed.totalPlayTimeS)}
                          {share != null && ` · ${share}% of your time`}
                        </span>
                      </span>
                    </button>
                  </dd>
                ) : (
                  <dd className="flex flex-col gap-0.5">
                    <span aria-hidden className="text-[12.5px] text-muted-foreground">Most played</span>
                    <span className="text-[17px] font-semibold text-muted-foreground">—</span>
                  </dd>
                )}
              </div>
            </dl>
          </section>

          <ActivityCard sessions={sessions} span={data.span} rangeLabel={rangeLabel} />

          <div className="flex flex-wrap gap-5">
            <StreakCard allSessions={data.allSessions} className="flex-[5_1_440px]" />
            <MasteryCard className="flex-[4_1_360px]" />
          </div>

          <div className="flex flex-wrap gap-5">
            <LevelCard className="flex-[5_1_440px]" />
            <TopGamesCard
              top={data.displayTopGames}
              totalSeconds={s.totalPlayTimeS}
              gamesPlayed={s.gamesPlayed}
              className="flex-[4_1_360px]"
            />
          </div>

          <div className="flex flex-wrap gap-5">
            <MilestonesCard sessions={sessions} className="flex-[4_1_320px]" />
            <TwitchWatchCard span={data.span} className="flex-[3_1_260px]" />
            <SessionLengthCard sessions={sessions} onShowHistory={() => jump("history")} className="flex-[4_1_320px]" />
          </div>

          <div id="stats-history" className="scroll-mt-16 rounded-2xl border border-border bg-card p-5">
            <SessionHistory sessions={sessions} onNoteUpdated={data.patchSessionNote} />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "up" }) {
  return (
    <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1 rounded-2xl border border-border bg-card px-5 py-4">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[26px] font-bold leading-tight tracking-[-0.01em] tabular-nums text-foreground">{value}</dd>
      <dd className={cn("truncate text-[12.5px]", tone === "up" ? "font-medium text-green-700 dark:text-green-400" : "text-muted-foreground")}>{sub}</dd>
    </div>
  );
}

function CustomRange({
  active,
  range,
  onApply,
}: {
  active: boolean;
  range: ReturnType<typeof useStatsRange>["range"];
  onApply: (start: string, end: string) => boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const today = React.useMemo(() => toDateStr(new Date()), []);
  const valid = start.length === 10 && end.length === 10 && start <= end;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Start from whatever period is showing now, not the one at mount.
        if (next) {
          setStart(range === "all" ? "" : range.start);
          setEnd(range === "all" ? "" : range.end);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="stats-range-custom-toggle"
          className={cn(
            "pressable flex h-[36px] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active ? "border-primary/50 bg-primary/10 text-foreground" : "border-input bg-background/60 text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarRange className="size-3.5" strokeWidth={1.75} />
          {active && range !== "all" ? formatDayRange(range) : "Custom"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 flex w-auto flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <DatePicker data-testid="stats-range-start" value={start} onChange={setStart} label="Start date" maxDate={end || today} popoverClassName="z-[60]" />
          <span className="text-xs text-muted-foreground">–</span>
          <DatePicker data-testid="stats-range-end" value={end} onChange={setEnd} label="End date" minDate={start || undefined} maxDate={today} popoverClassName="z-[60]" />
        </div>
        <button
          type="button"
          data-testid="stats-range-apply"
          disabled={!valid}
          onClick={() => onApply(start, end) && setOpen(false)}
          className="pressable h-9 rounded-lg bg-primary text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Apply range
        </button>
      </PopoverContent>
    </Popover>
  );
}
