import * as React from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import { useGameStore, type Game } from "@/stores/gameStore";
import { StarRating } from "./GameActionBar";

function band(score: number) {
  if (score >= 75) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--destructive)";
}

export function verdict(score: number): string {
  if (score >= 90) return "Outstanding";
  if (score >= 80) return "Great";
  if (score >= 70) return "Good";
  if (score >= 50) return "Mixed";
  return "Poor";
}

function reviews(count: number | null): string {
  if (!count) return "";
  const n = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  return `${n} ${count === 1 ? "review" : "reviews"}`;
}

/** How the player's 1–5 stars sit against a 0–100 score. */
export function comparison(rating: number | null, score: number | null, who: string): string | null {
  if (!rating || score == null || score <= 0) return null;
  const diff = rating * 20 - score;
  if (Math.abs(diff) <= 8) return `You agree with the ${who}.`;
  return diff > 0 ? `You rate it higher than the ${who}.` : `You rate it lower than the ${who}.`;
}

/** Where a game's critic score ranks among every scored game in the library. */
export function libraryRank(games: Game[], game: Game): string | null {
  if (game.criticScore == null || game.criticScore <= 0) return null;
  const scored = games.filter((g) => g.criticScore != null && g.criticScore > 0);
  if (scored.length < 5) return null;
  const rank = 1 + scored.filter((g) => g.criticScore! > game.criticScore!).length;
  const pct = (rank / scored.length) * 100;
  if (pct <= 25) return `Top ${Math.max(1, Math.round(pct))}% of your library by critic score.`;
  return `#${rank} of ${scored.length} in your library by critic score.`;
}

const R = 30;
const STROKE = 6;
const SIZE = (R + STROKE) * 2;
const CIRC = 2 * Math.PI * R;

function ScoreRing({ label, score, count }: { label: string; score: number | null; count: number | null }) {
  const has = score != null && score > 0;
  const value = has ? Math.round(score) : 0;
  // Fill once on mount; the transition is skipped with reduced motion or Animations off.
  const [drawn, setDrawn] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div
        className="relative"
        style={{ width: SIZE, height: SIZE }}
        role="img"
        aria-label={has ? `${label} score ${value} out of 100, ${verdict(value)}` : `No ${label.toLowerCase()} score yet`}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--secondary)" strokeWidth={STROKE} />
          {has && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={band(value)}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - drawn / 100)}
              className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            />
          )}
        </svg>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-center text-[22px] font-bold tabular-nums",
            has ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {has ? value : "—"}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {has ? [verdict(value), reviews(count)].filter(Boolean).join(" · ") : "No score yet"}
        </span>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function yearsAgo(iso: string): string {
  const years = (Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000);
  if (years < 1) return formatRelativeTime(iso);
  const n = Math.floor(years);
  return `${n} year${n === 1 ? "" : "s"} ago`;
}

/** Second column of the Overview tab: ratings, then the game's key dates. */
export function RatingsColumn({ game }: { game: Game }) {
  const games = useGameStore((s) => s.games);
  const vsCritic = comparison(game.rating, game.criticScore, "critics");
  const line = vsCritic ?? comparison(game.rating, game.communityScore, "community");
  const rank = React.useMemo(() => libraryRank(games, game), [games, game]);

  const dates: { label: string; value: string; hint: string }[] = [];
  if (game.releaseDate) dates.push({ label: "Released", value: formatDate(game.releaseDate), hint: yearsAgo(game.releaseDate) });
  dates.push({ label: "Added to library", value: formatDate(game.addedAt), hint: yearsAgo(game.addedAt) });
  dates.push({
    label: "Last played",
    value: game.lastPlayedAt ? formatDate(game.lastPlayedAt) : "Never",
    hint: game.lastPlayedAt ? yearsAgo(game.lastPlayedAt) : "",
  });

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="game-ratings" data-testid="game-ratings" className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        <h2 id="game-ratings" className="text-sm font-semibold text-foreground">
          Ratings
        </h2>
        <div className="flex gap-3">
          <ScoreRing label="Critic" score={game.criticScore} count={game.criticScoreCount} />
          <ScoreRing label="Community" score={game.communityScore} count={game.communityScoreCount} />
        </div>
        <div className="flex flex-col items-center gap-1.5 border-t border-border pt-4">
          <StarRating gameId={game.id} rating={game.rating} size="lg" />
          <span className="text-xs text-muted-foreground">
            {game.rating ? `Your rating · ${game.rating} / 5` : "How did it land for you?"}
          </span>
        </div>
        {(line || rank) && (
          <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
            {line && <p data-testid="game-ratings-compare">{line}</p>}
            {rank && <p data-testid="game-ratings-rank">{rank}</p>}
          </div>
        )}
      </section>

      <section aria-label="Dates" data-testid="game-dates" className="rounded-xl border border-border bg-card px-5 py-2">
        <dl className="divide-y divide-border">
          {dates.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-3 py-3">
              <dt className="text-[13px] text-muted-foreground">{d.label}</dt>
              <dd className="flex flex-col items-end text-right">
                <span className="text-sm font-medium tabular-nums text-foreground">{d.value}</span>
                {d.hint && <span className="text-xs text-muted-foreground">{d.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
