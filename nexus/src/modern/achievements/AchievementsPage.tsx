import * as React from "react";
import * as LucideIcons from "lucide-react";
import * as Radix from "radix-ui";
import { motion, useReducedMotionConfig } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { formatRelativeTime } from "@/lib/time";
import { useAchievementStore } from "@/stores/achievementStore";
import { TabButton } from "../library/LibraryPage";
import type { AchievementCategory, AchievementRarity, AchievementStatus } from "@/lib/tauri";

const CATEGORIES: { value: AchievementCategory; label: string }[] = [
  { value: "library", label: "Library" },
  { value: "play", label: "Play" },
  { value: "completion", label: "Completion" },
  { value: "streak", label: "Streak" },
  { value: "exploration", label: "Exploration" },
  { value: "session", label: "Session" },
];

const RARITIES: AchievementRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_ORDER: Record<AchievementRarity, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

const rarityColor = (r: AchievementRarity) => `var(--rarity-${r})`;
/** The rarity hue pulled toward the text colour, so yellow and grey labels stay legible on light and dark. */
const rarityText = (r: AchievementRarity) => `color-mix(in oklab, var(--rarity-${r}) 70%, var(--foreground))`;
const rarityLabel = (r: AchievementRarity) => r.charAt(0).toUpperCase() + r.slice(1);

/** Same content column as Stats: a readable line on ultrawide windows. */
const COLUMN = "mx-auto w-full max-w-[1280px] px-10";

type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number }>;
function achievementIcon(name: string): IconComponent {
  return (LucideIcons as unknown as Record<string, IconComponent>)[name] ?? LucideIcons.Trophy;
}

/** 0–1 toward unlocking; 0 when the achievement has no counter. */
function progressOf(a: AchievementStatus): number {
  return !a.unlocked && a.progressTarget && a.progressCurrent != null ? Math.min(1, a.progressCurrent / a.progressTarget) : 0;
}

/** Unlocked first (newest first), then locked by progress, then rarest. */
export function sortAchievements(list: AchievementStatus[]): AchievementStatus[] {
  return [...list].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
    return progressOf(b) - progressOf(a) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  });
}

function unlockedWhen(iso: string | null): string {
  if (!iso) return "";
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return days < 30 ? formatRelativeTime(iso) : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function unlockContext(json: string | null): string | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json);
    if (c.gameName) return `While playing ${c.gameName}`;
    if (c.streakDays) return `${c.streakDays}-day streak`;
    if (c.totalHours) return `${c.totalHours} hours played`;
    if (c.gameCount) return `${c.gameCount} games`;
    if (c.completedCount) return `${c.completedCount} games completed`;
    if (c.sessionCount) return `${c.sessionCount} sessions`;
  } catch {
    // malformed context: show nothing
  }
  return null;
}

export function AchievementsPage() {
  const statuses = useAchievementStore((s) => s.statuses);
  const loading = useAchievementStore((s) => s.loading);
  const highlightId = useAchievementStore((s) => s.highlightId);
  const reduce = useReducedMotionConfig();
  const [category, setCategory] = React.useState<AchievementCategory | "all">("all");
  const [rarity, setRarity] = React.useState<AchievementRarity | "all">("all");

  React.useEffect(() => {
    const store = useAchievementStore.getState();
    store.fetchStatuses();
    store.clearBadge();
  }, []);

  // A highlighted card has to be on screen to be seen (audit B24): drop the filters first.
  React.useEffect(() => {
    if (!highlightId) return;
    setCategory("all");
    setRarity("all");
  }, [highlightId]);

  const visible = React.useMemo(
    () =>
      sortAchievements(
        statuses.filter((s) => (category === "all" || s.category === category) && (rarity === "all" || s.rarity === rarity)),
      ),
    [statuses, category, rarity],
  );

  // Once the card is rendered (filters reset, late statuses arrived): scroll to it, flash, then clear.
  const highlightShown = highlightId !== null && visible.some((a) => a.id === highlightId);
  React.useEffect(() => {
    if (!highlightShown) return;
    document
      .querySelector(`[data-testid="achievement-${highlightId}"]`)
      ?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const timer = setTimeout(() => useAchievementStore.getState().setHighlightId(null), 1600);
    return () => clearTimeout(timer);
  }, [highlightShown, highlightId, reduce]);

  const counts = React.useMemo(() => {
    const out = {} as Record<AchievementCategory, { unlocked: number; total: number }>;
    for (const s of statuses) {
      const c = (out[s.category] ??= { unlocked: 0, total: 0 });
      c.total++;
      if (s.unlocked) c.unlocked++;
    }
    return out;
  }, [statuses]);

  if (loading && statuses.length === 0) {
    return (
      <div data-testid="achievements-loading" className={cn(COLUMN, "flex flex-col gap-6 pb-12 pt-7")}>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Achievements</h1>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-secondary motion-safe:animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-secondary motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const unlocked = statuses.filter((s) => s.unlocked);
  const earnedXp = unlocked.reduce((sum, s) => sum + s.points, 0);
  const overall = statuses.length ? unlocked.length / statuses.length : 0;
  const almost = statuses
    .filter((s) => progressOf(s) > 0)
    .sort((a, b) => progressOf(b) - progressOf(a))
    .slice(0, 3);
  const filtered = category !== "all" || rarity !== "all";

  return (
    <div data-testid="achievements-page" className={cn(COLUMN, "flex flex-col gap-6 pb-12 pt-7")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Achievements</h1>
          <p data-testid="achievements-summary" className="mt-1 text-sm tabular-nums text-muted-foreground">
            {unlocked.length} of {statuses.length} unlocked · {earnedXp.toLocaleString()} XP
          </p>
        </div>
        <div className="flex w-80 max-w-full flex-col gap-1.5">
          <div className="flex justify-between text-[12.5px] text-muted-foreground">
            <span>Overall</span>
            <span className="tabular-nums">{Math.round(overall * 100)}%</span>
          </div>
          <ProgressBar value={overall} label="Achievements unlocked" className="h-2" />
        </div>
      </div>

      {almost.length > 0 && (
        <section aria-labelledby="achievements-almost" data-testid="achievements-almost" className="flex flex-col gap-3">
          <h2 id="achievements-almost" className="text-[15px] font-semibold text-foreground">
            Almost there
          </h2>
          <div className="flex flex-wrap gap-4">
            {almost.map((a) => (
              <button
                key={a.id}
                type="button"
                data-testid={`almost-${a.id}`}
                onClick={() => useAchievementStore.getState().setHighlightId(a.id)}
                className="pressable flex min-w-0 flex-[1_1_280px] items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AchievementIcon achievement={a} tinted />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">{a.name}</span>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                      {a.progressCurrent} / {a.progressTarget}
                    </span>
                  </span>
                  {/* Inside a button the bar is presentational; the "n / m" text carries it. */}
                  <span aria-hidden>
                    <ProgressBar value={progressOf(a)} label={`${a.name} progress`} colour={rarityColor(a.rarity)} />
                  </span>
                  <span className="truncate text-[12.5px] text-muted-foreground">{a.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-label="All achievements" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border">
          <div role="tablist" aria-label="Achievement categories" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <TabButton active={category === "all"} onClick={() => setCategory("all")} count={statuses.length} testId="ach-tab-all">
              All
            </TabButton>
            {CATEGORIES.filter((c) => counts[c.value]).map((c) => (
              <TabButton
                key={c.value}
                active={category === c.value}
                onClick={() => setCategory(c.value)}
                count={`${counts[c.value].unlocked}/${counts[c.value].total}`}
                testId={`ach-tab-${c.value}`}
              >
                {c.label}
              </TabButton>
            ))}
          </div>
          <Radix.ToggleGroup.Root
            type="single"
            value={rarity}
            // Radix emits "" when the active chip is pressed again; keep one selected.
            onValueChange={(v) => v && setRarity(v as AchievementRarity | "all")}
            aria-label="Rarity"
            className="flex flex-wrap gap-1.5 pb-2.5"
          >
            {(["all", ...RARITIES] as const).map((r) => (
              <Radix.ToggleGroup.Item
                key={r}
                value={r}
                data-testid={`ach-rarity-${r}`}
                className={cn(
                  "pressable flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "border-border text-muted-foreground hover:text-foreground",
                  "data-[state=on]:border-transparent data-[state=on]:bg-accent data-[state=on]:text-foreground",
                )}
              >
                <span aria-hidden className="size-[7px] rounded-full" style={{ background: r === "all" ? "var(--muted-foreground)" : rarityColor(r) }} />
                {r === "all" ? "All" : rarityLabel(r)}
              </Radix.ToggleGroup.Item>
            ))}
          </Radix.ToggleGroup.Root>
        </div>

        {visible.length === 0 ? (
          <div data-testid="achievements-empty" className="flex flex-col items-center gap-3 py-16 text-center">
            <LucideIcons.Trophy className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
            {filtered ? (
              <>
                <p className="text-sm text-muted-foreground">No achievements match these filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setRarity("all");
                  }}
                  className="pressable h-8 rounded-lg border border-input px-3 text-[13px] font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No achievements yet. Play a game to start unlocking them.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
            {visible.map((a) => (
              <AchievementTile key={a.id} achievement={a} highlighted={highlightId === a.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AchievementIcon({ achievement: a, tinted }: { achievement: AchievementStatus; tinted?: boolean }) {
  const Icon = achievementIcon(a.icon);
  const colour = a.unlocked || tinted;
  return (
    <span
      className={cn("relative flex size-12 shrink-0 items-center justify-center rounded-xl", !colour && "bg-secondary text-muted-foreground/70")}
      style={
        colour
          ? {
              background: `color-mix(in oklab, ${rarityColor(a.rarity)} 15%, transparent)`,
              color: rarityText(a.rarity),
              boxShadow: a.unlocked ? `inset 0 0 0 1px color-mix(in oklab, ${rarityColor(a.rarity)} 35%, transparent)` : undefined,
            }
          : undefined
      }
    >
      <Icon className="size-[22px]" strokeWidth={2} />
      {!a.unlocked && (
        <LucideIcons.Lock
          aria-hidden
          className="absolute -bottom-1 -right-1 size-4 rounded-full bg-card p-0.5 text-muted-foreground ring-1 ring-border"
          strokeWidth={2.5}
        />
      )}
    </span>
  );
}

function AchievementTile({ achievement: a, highlighted }: { achievement: AchievementStatus; highlighted: boolean }) {
  const progress = progressOf(a);
  const context = a.unlocked ? unlockContext(a.contextJson) : null;
  return (
    <div
      data-testid={`achievement-${a.id}`}
      data-unlocked={a.unlocked}
      className={cn("relative flex gap-3.5 rounded-2xl border p-4", a.unlocked ? "border-border bg-card" : "border-border/70 bg-card/50")}
    >
      <AchievementIcon achievement={a} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className={cn("truncate font-semibold", a.unlocked ? "text-foreground" : "text-foreground/80")}>{a.name}</h3>
        <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{a.description}</p>
        {progress > 0 && (
          <div className="mt-1.5 flex items-center gap-2.5">
            <ProgressBar value={progress} label={`${a.name} progress`} colour="var(--muted-foreground)" className="h-[5px] flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {a.progressCurrent} / {a.progressTarget}
            </span>
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: rarityText(a.rarity) }}>
            {rarityLabel(a.rarity)}
          </span>
          <span className="tabular-nums text-muted-foreground">{a.points} XP</span>
          {a.unlocked ? (
            <span className="text-green-700 dark:text-green-400">Unlocked {unlockedWhen(a.unlockedAt)}</span>
          ) : (
            <span className="sr-only">Locked</span>
          )}
        </div>
        {context && <p className="truncate text-[11px] text-muted-foreground">{context}</p>}
      </div>
      {highlighted && (
        // Fade-only ring so the flash survives reduced motion and never shifts layout.
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{ boxShadow: `0 0 0 2px ${rarityColor(a.rarity)}` }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 0.6, duration: 0.9, ease: EASE_OUT }}
        />
      )}
    </div>
  );
}

function ProgressBar({ value, label, colour, className }: { value: number; label: string; colour?: string; className?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-secondary", className)}
    >
      <span className={cn("block h-full rounded-full", !colour && "bg-primary")} style={{ width: `${pct}%`, background: colour }} />
    </span>
  );
}
