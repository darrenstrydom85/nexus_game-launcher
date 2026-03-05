/**
 * Wrapped (Spotify Wrapped–style) report types.
 * Story 16.1 — Library Wrapped backend.
 */

/**
 * Date range selector for the wrapped report.
 * Matches Rust WrappedPeriod enum (serde camelCase variant names).
 */
export type WrappedPeriod =
  | { year: number }
  | { month: { year: number; month: number } }
  | { preset: string }
  | { custom: { startDate: string; endDate: string } };

/** One game entry in top games or most-played. */
export interface WrappedGame {
  id: string;
  name: string;
  coverUrl: string | null;
  playTimeS: number;
  sessionCount: number;
  source: string;
}

/** Longest or notable session in the report. */
export interface WrappedSession {
  gameId: string;
  gameName: string;
  startedAt: string;
  durationS: number;
}

/** Genre share by play time. */
export interface GenreShare {
  name: string;
  playTimeS: number;
  percent: number;
}

/** Platform (source) share by play time. */
export interface PlatformShare {
  source: string;
  playTimeS: number;
  percent: number;
}

/** Fun fact computed server-side (e.g. marathons, full days). */
export interface FunFact {
  kind: string;
  value: number;
  label: string;
}

/** Comparison to previous period (e.g. "Up 20% from last month"). */
export interface Comparison {
  previousTotalS: number;
  percentChange: number;
  label: string;
}

/** Play time for one month (1–12). */
export interface MonthBucket {
  month: number;
  playTimeS: number;
}

/** Play time by day of week (0 = Monday). */
export interface DayBucket {
  day: number;
  playTimeS: number;
}

/** Play time by hour of day (0–23). */
export interface HourBucket {
  hour: number;
  playTimeS: number;
}

/** Optional: low-rated but highly played game (Story 16.4). */
export interface HiddenGem {
  gameId: string;
  name: string;
  playTimeS: number;
  rating: number | null;
}

/** Full wrapped report for a date range. */
export interface WrappedReport {
  periodLabel: string;
  totalPlayTimeS: number;
  totalSessions: number;
  totalGamesPlayed: number;
  totalGamesInLibrary: number;
  newGamesAdded: number;
  newTitlesInPeriod: number;
  mostPlayedGame: WrappedGame | null;
  mostPlayedGenre: string | null;
  topGames: WrappedGame[];
  genreBreakdown: GenreShare[];
  genreTagline: string | null;
  platformBreakdown: PlatformShare[];
  longestSession: WrappedSession | null;
  longestStreakDays: number;
  busiestDay: string | null;
  busiestDayPlayTimeS: number;
  firstGamePlayed: WrappedGame | null;
  lastGamePlayed: WrappedGame | null;
  playTimeByMonth: MonthBucket[];
  playTimeByDayOfWeek: DayBucket[];
  playTimeByHourOfDay: HourBucket[];
  funFacts: FunFact[];
  comparisonPreviousPeriod: Comparison | null;
  moodTagline: string | null;
  hiddenGem: HiddenGem | null;
  trivia: string[];
}

/** Response for get_available_wrapped_periods. */
export interface AvailableWrappedPeriods {
  yearsWithSessions: number[];
  thisMonthHasData: boolean;
  lastMonthHasData: boolean;
  thisYearHasData: boolean;
  lastYearHasData: boolean;
}
