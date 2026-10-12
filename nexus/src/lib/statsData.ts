import { toDateStr, type StatsDateRange } from "@/lib/statsRange";

export interface PlayStats {
  totalPlayTimeS: number;
  gamesPlayed: number;
  gamesUnplayed: number;
  mostPlayedGame: string | null;
  weeklyPlayTimeS: number;
}

export interface ActivityDataPoint {
  date: string;
  minutes: number;
}

export interface TopGame {
  id: string;
  name: string;
  coverUrl: string | null;
  totalPlayTimeS: number;
}

export interface SessionRecord {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  note: string | null;
}

export const EMPTY_STATS: PlayStats = {
  totalPlayTimeS: 0,
  gamesPlayed: 0,
  gamesUnplayed: 0,
  mostPlayedGame: null,
  weeklyPlayTimeS: 0,
};

export function filterByDateRange<T extends { date: string }>(items: T[], range: StatsDateRange): T[] {
  if (range === "all") return items;
  return items.filter((d) => d.date >= range.start && d.date <= range.end);
}

export function filterSessionsByRange(sessions: SessionRecord[], range: StatsDateRange): SessionRecord[] {
  if (range === "all") return sessions;
  return sessions.filter((s) => {
    // Local calendar day: ranges are local dates, startedAt is UTC.
    const date = toDateStr(new Date(s.startedAt));
    return date >= range.start && date <= range.end;
  });
}

/** Totals for a date range, derived client-side from its sessions. */
export function deriveStatsFromSessions(sessions: SessionRecord[], totalLibraryGames: number): PlayStats {
  const totalPlayTimeS = sessions.reduce((sum, s) => sum + s.durationS, 0);
  const byGame = new Map<string, { name: string; durationS: number }>();
  for (const s of sessions) {
    const cur = byGame.get(s.gameId);
    if (!cur) byGame.set(s.gameId, { name: s.gameName, durationS: s.durationS });
    else cur.durationS += s.durationS;
  }
  let mostPlayedGame: string | null = null;
  let maxDuration = 0;
  byGame.forEach((v) => {
    if (v.durationS > maxDuration) {
      maxDuration = v.durationS;
      mostPlayedGame = v.name;
    }
  });
  const gamesPlayed = byGame.size;
  return {
    totalPlayTimeS,
    gamesPlayed,
    gamesUnplayed: Math.max(0, totalLibraryGames - gamesPlayed),
    mostPlayedGame,
    weeklyPlayTimeS: totalPlayTimeS,
  };
}

/** Top 10 games by play time within a date range. */
export function deriveTopGamesFromSessions(
  sessions: SessionRecord[],
  coverByGameId: Map<string, string | null>,
  coverByName: Map<string, string | null>,
): TopGame[] {
  const byGame = new Map<string, { name: string; totalPlayTimeS: number }>();
  for (const s of sessions) {
    const cur = byGame.get(s.gameId);
    if (!cur) byGame.set(s.gameId, { name: s.gameName, totalPlayTimeS: s.durationS });
    else cur.totalPlayTimeS += s.durationS;
  }
  return [...byGame.entries()]
    .sort((a, b) => b[1].totalPlayTimeS - a[1].totalPlayTimeS)
    .slice(0, 10)
    .map(([id, v]) => ({
      id,
      name: v.name,
      coverUrl: coverByGameId.get(id) ?? coverByName.get(v.name.toLowerCase()) ?? null,
      totalPlayTimeS: v.totalPlayTimeS,
    }));
}

/* ── v1 Stats page helpers ─────────────────────────────────────────── */

type DayRange = { start: string; end: string };

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** Shifts by whole months, clamping to the last day (31 Mar - 1 month = 28/29 Feb). */
function addMonths(date: Date, n: number): Date {
  const last = new Date(date.getFullYear(), date.getMonth() + n + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + n, Math.min(date.getDate(), last));
}

function mondayOf(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * The period to compare against: the same days of last month/year for those
 * presets ("1–12 Oct" vs "1–12 Sep"), otherwise the same length just before.
 */
export function previousRange(choice: string, range: DayRange): DayRange {
  const start = parseDay(range.start);
  const end = parseDay(range.end);
  if (choice === "this_month" || choice === "this_year") {
    const months = choice === "this_month" ? -1 : -12;
    return { start: toDateStr(addMonths(start, months)), end: toDateStr(addMonths(end, months)) };
  }
  const length = daysBetween(start, end) + 1;
  return { start: toDateStr(addDays(start, -length)), end: toDateStr(addDays(start, -1)) };
}

/** "1–12 Sep", "28 Sep – 4 Oct", with the year when it isn't this one. */
export function formatDayRange(range: DayRange, now = new Date()): string {
  const start = parseDay(range.start);
  const end = parseDay(range.end);
  const withYear = end.getFullYear() !== now.getFullYear() || start.getFullYear() !== end.getFullYear();
  const dm = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const tail = withYear ? ` ${end.getFullYear()}` : "";
  if (range.start === range.end) return dm(end) + tail;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${dm(end)}${tail}`;
  }
  return `${dm(start)} – ${dm(end)}${tail}`;
}

export interface ActivityBucket {
  key: string;
  /** Axis label: day number, week start, month or year. */
  label: string;
  /** Tooltip heading, e.g. "Sun 12 Oct" or "Week of 6 Oct". */
  title: string;
  seconds: number;
  /** The bucket holding today. */
  current: boolean;
}

export type ActivityUnit = "day" | "week" | "month" | "year";

/** Bucket size for a range: days up to a month, weeks up to 26, then months, then years. */
export function activityUnit(range: DayRange): ActivityUnit {
  const span = daysBetween(parseDay(range.start), parseDay(range.end)) + 1;
  return span <= 31 ? "day" : span <= 26 * 7 ? "week" : span <= 730 ? "month" : "year";
}

/**
 * Play time per {@link activityUnit} bucket across a range, so the chart never gets crowded.
 */
export function activityBuckets(sessions: SessionRecord[], range: DayRange, today = toDateStr(new Date())): ActivityBucket[] {
  const start = parseDay(range.start);
  const end = parseDay(range.end);
  const unit = activityUnit(range);

  const keyOf = (d: Date) =>
    unit === "day"
      ? toDateStr(d)
      : unit === "week"
        ? toDateStr(mondayOf(d))
        : unit === "month"
          ? toDateStr(d).slice(0, 7)
          : String(d.getFullYear());

  const buckets: ActivityBucket[] = [];
  let cursor = unit === "day" ? start : unit === "week" ? mondayOf(start) : new Date(start.getFullYear(), unit === "month" ? start.getMonth() : 0, 1);
  while (cursor <= end) {
    const d = cursor;
    buckets.push({
      key: keyOf(d),
      label:
        unit === "day"
          ? String(d.getDate())
          : unit === "week"
            ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
            : unit === "month"
              ? d.toLocaleDateString(undefined, { month: "short" })
              : String(d.getFullYear()),
      title:
        unit === "day"
          ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
          : unit === "week"
            ? `Week of ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
            : unit === "month"
              ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
              : String(d.getFullYear()),
      seconds: 0,
      current: keyOf(d) === keyOf(parseDay(today)),
    });
    cursor = unit === "day" ? addDays(d, 1) : unit === "week" ? addDays(d, 7) : unit === "month" ? addMonths(d, 1) : new Date(d.getFullYear() + 1, 0, 1);
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const s of filterSessionsByRange(sessions, range)) {
    const bucket = byKey.get(keyOf(new Date(s.startedAt)));
    if (bucket) bucket.seconds += s.durationS;
  }
  return buckets;
}

export interface HeatCell {
  date: string;
  seconds: number;
  /** 0 none, 1 under 30m, 2 under 1h, 3 under 2h, 4 two hours or more. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/** The last `weeks` weeks as Monday-first columns of seven days, ending with this week. */
export function heatmapWeeks(sessions: SessionRecord[], weeks = 26, today = toDateStr(new Date())): HeatCell[][] {
  const perDay = new Map<string, number>();
  for (const s of sessions) {
    const day = toDateStr(new Date(s.startedAt));
    perDay.set(day, (perDay.get(day) ?? 0) + s.durationS);
  }
  const first = addDays(mondayOf(parseDay(today)), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = toDateStr(addDays(first, w * 7 + d));
      const seconds = perDay.get(date) ?? 0;
      const level = seconds === 0 ? 0 : seconds < 1800 ? 1 : seconds < 3600 ? 2 : seconds < 7200 ? 3 : 4;
      return { date, seconds, level, future: date > today };
    }),
  );
}

export const SESSION_LENGTHS = [
  { label: "<30m", max: 1800 },
  { label: "30m–1h", max: 3600 },
  { label: "1–2h", max: 7200 },
  { label: "2–4h", max: 14_400 },
  { label: "4h+", max: Infinity },
] as const;

/** Session counts per length band, in {@link SESSION_LENGTHS} order. */
export function sessionLengthCounts(sessions: SessionRecord[]): number[] {
  const counts = SESSION_LENGTHS.map(() => 0);
  for (const s of sessions) counts[SESSION_LENGTHS.findIndex((b) => s.durationS < b.max)]++;
  return counts;
}

/** Games whose first-ever session falls inside the range. */
export function newGamesInRange(allSessions: SessionRecord[], range: DayRange): number {
  const first = new Map<string, string>();
  for (const s of allSessions) {
    const day = toDateStr(new Date(s.startedAt));
    const seen = first.get(s.gameId);
    if (!seen || day < seen) first.set(s.gameId, day);
  }
  let n = 0;
  first.forEach((day) => {
    if (day >= range.start && day <= range.end) n++;
  });
  return n;
}
