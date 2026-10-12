/** Which story slides a report gets, in order, and each slide's colour mood. */
import type { WrappedReport } from "@/types/wrapped";
import type { WatchAggregate } from "@/lib/tauri";
import { periodPhrase } from "./format";

export type SlideId =
  | "intro"
  | "top-game"
  | "top-games"
  | "genres"
  | "rhythm"
  | "milestones"
  | "variety"
  | "library"
  | "extras"
  | "twitch"
  | "outro";

export interface SlideDef {
  id: SlideId;
  title: string;
}

interface SlideRule {
  id: SlideId;
  title: string | ((r: WrappedReport) => string);
  show: (r: WrappedReport, twitch: WatchAggregate | null) => boolean;
}

const RULES: SlideRule[] = [
  { id: "intro", title: (r) => `Your ${periodPhrase(r.periodLabel)} in games`, show: () => true },
  { id: "top-game", title: "Your #1 game", show: (r) => r.mostPlayedGame !== null },
  // A one-game list would only repeat the #1 slide.
  {
    id: "top-games",
    title: "Top games",
    show: (r) => r.topGames.length > 1 || (r.topGames.length === 1 && r.mostPlayedGame === null),
  },
  { id: "genres", title: "Genres", show: (r) => r.genreBreakdown.length > 0 },
  { id: "rhythm", title: "When you play", show: (r) => r.playTimeByDayOfWeek.some((b) => b.playTimeS > 0) },
  { id: "milestones", title: "Milestones", show: (r) => r.longestStreakDays > 0 || r.longestSession !== null },
  { id: "variety", title: "Variety", show: (r) => r.platformBreakdown.length > 0 || r.newTitlesInPeriod > 0 },
  { id: "library", title: "Library growth", show: (r) => r.newGamesAdded > 0 },
  {
    id: "extras",
    title: "A few more things",
    show: (r) => Boolean(r.moodTagline) || Boolean(r.hiddenGem) || r.trivia.length > 0 || r.funFacts.length > 0,
  },
  { id: "twitch", title: "Twitch", show: (_r, t) => (t?.totals?.totalSecs ?? 0) > 0 },
  { id: "outro", title: "That's a wrap", show: () => true },
];

/** The slides with data for this report, in story order. Intro and outro are always present. */
export function buildSlides(report: WrappedReport, twitch: WatchAggregate | null): SlideDef[] {
  return RULES.filter((rule) => rule.show(report, twitch)).map((rule) => ({
    id: rule.id,
    title: typeof rule.title === "function" ? rule.title(report) : rule.title,
  }));
}

/** Two oklch hues layered with the app accent, and how long one drift sweep takes (s). */
export const SLIDE_MOOD: Record<SlideId, { hues: [number, number]; drift: number }> = {
  intro: { hues: [300, 230], drift: 26 },
  "top-game": { hues: [30, 330], drift: 24 },
  "top-games": { hues: [210, 265], drift: 28 },
  genres: { hues: [165, 95], drift: 22 },
  rhythm: { hues: [55, 15], drift: 25 },
  milestones: { hues: [28, 350], drift: 23 },
  variety: { hues: [190, 290], drift: 27 },
  library: { hues: [150, 220], drift: 24 },
  extras: { hues: [330, 70], drift: 26 },
  twitch: { hues: [285, 255], drift: 25 },
  outro: { hues: [320, 210], drift: 30 },
};
