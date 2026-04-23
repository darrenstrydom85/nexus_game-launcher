import * as React from "react";
import { Tv } from "lucide-react";
import { getTwitchWatchForRange, type WatchAggregate } from "@/lib/tauri";
import { selectionToDateRange, type PeriodSelection } from "@/hooks/useWrapped";

interface TwitchWatchCardProps {
  selection: PeriodSelection;
}

function fmtHours(secs: number): string {
  if (secs <= 0) return "0";
  const hours = secs / 3600;
  if (hours < 1) return (Math.round(secs / 60) / 60).toFixed(2);
  if (hours < 10) return hours.toFixed(1);
  return String(Math.round(hours));
}

/**
 * Period-scoped Twitch watch slide for Wrapped (Story E1).
 *
 * Fetches its own data via `get_twitch_watch_for_range` rather than threading
 * watch stats through the existing `WrappedReport` pipeline -- those reports
 * are built from playtime sessions, while watch sessions live in their own
 * table. The slide silently renders an empty state when there is no data so
 * it is harmless to always include.
 */
export function TwitchWatchCard({ selection }: TwitchWatchCardProps) {
  const { startDate, endDate, label } = React.useMemo(
    () => selectionToDateRange(selection),
    [selection],
  );

  // The label flows into both the headline and the empty-state copy. "during"
  // reads naturally for every preset (`during this month`, `during 2025`,
  // `during last 30 days`) without needing per-preset prepositions.
  const phrasedLabel = label;
  const [agg, setAgg] = React.useState<WatchAggregate | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTwitchWatchForRange(startDate, endDate, 5)
      .then((data) => {
        if (!cancelled) {
          setAgg(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgg(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div
        data-testid="twitch-watch-card"
        className="flex h-full flex-col items-center justify-center gap-4 px-8"
      >
        <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
        <div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  // Defensive: if the backend returns an empty/partial payload (or the test
  // harness mocks the invoke to `{}`), bail out to the empty state rather than
  // crash on `totals.totalSecs`. This keeps the slide harmless to always
  // include in CARD_DEFS.
  const totals = agg?.totals;
  if (!totals || totals.totalSecs <= 0) {
    return (
      <div
        data-testid="twitch-watch-card"
        className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
      >
        <Tv className="size-10 text-purple-400" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-foreground">
          You didn&apos;t catch a Twitch stream during {phrasedLabel.toLowerCase()}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Open a stream from the Twitch panel to start tracking your watch time.
        </p>
      </div>
    );
  }

  const top = agg?.topChannels?.[0];
  const topGame = agg?.topGames?.[0];
  const totalH = fmtHours(totals.totalSecs);

  return (
    <div
      data-testid="twitch-watch-card"
      className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center"
    >
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-purple-400" aria-hidden="true" />
        <span
          className="text-sm uppercase tracking-wider text-muted-foreground"
          data-testid="twitch-watch-card-label"
        >
          Twitch · {phrasedLabel}
        </span>
      </div>

      <div>
        <div className="text-6xl font-bold text-foreground sm:text-7xl">
          {totalH}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          hours of streams watched
        </div>
      </div>

      <div className="grid w-full max-w-md gap-3 text-sm sm:grid-cols-2">
        {top && (
          <div className="rounded-lg border border-border bg-card/50 p-3 text-left">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Most-watched channel
            </div>
            <div className="mt-1 truncate text-base font-semibold text-foreground">
              {top.channelDisplayName ?? top.channelLogin}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtHours(top.totalSecs)}h · {top.sessionCount} sessions
            </div>
          </div>
        )}
        {topGame && (
          <div className="rounded-lg border border-border bg-card/50 p-3 text-left">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Most-watched game
            </div>
            <div className="mt-1 truncate text-base font-semibold text-foreground">
              {topGame.twitchGameName ?? "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtHours(topGame.totalSecs)}h · {topGame.sessionCount} sessions
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Across {totals.sessionCount} watch sessions
      </div>
    </div>
  );
}
