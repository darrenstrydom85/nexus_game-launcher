import * as React from "react";
import { Tv } from "lucide-react";
import { getTwitchWatchStats, type WatchAggregate } from "@/lib/tauri";
import { useTwitchStore } from "@/stores/twitchStore";

const PERIOD_DAYS = 30;

function fmtHours(secs: number): string {
  if (secs <= 0) return "0h";
  const hours = secs / 3600;
  if (hours < 1) {
    const mins = Math.round(secs / 60);
    return `${mins}m`;
  }
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

/**
 * "Twitch watch time" section for the Stats view (Story E1).
 *
 * Shows the user's Twitch viewing in the last 30 days: total watched, top 3
 * channels, top 3 games. Self-hides when there is nothing to show (no auth, no
 * sessions yet) so it does not clutter the stats page for users who have not
 * used the embedded player.
 */
export function TwitchWatchSection() {
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const [agg, setAgg] = React.useState<WatchAggregate | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTwitchWatchStats(PERIOD_DAYS)
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
  }, [isAuthenticated]);

  if (loading) return null;
  // Defensive null/undefined guards: in tests (and during initial bootstrap)
  // the backend may return an empty object before the schema is fully populated.
  const totals = agg?.totals;
  if (!totals || totals.totalSecs <= 0) return null;

  const topChannels = (agg?.topChannels ?? []).slice(0, 3);
  const topGames = (agg?.topGames ?? []).slice(0, 3);

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="twitch-watch-section"
    >
      <div className="mb-3 flex items-center gap-2">
        <Tv className="size-5 text-purple-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">
          Twitch watch time
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          last {PERIOD_DAYS} days
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div>
          <div className="text-2xl font-semibold text-foreground" data-testid="twitch-watch-total">
            {fmtHours(totals.totalSecs)}
          </div>
          <div className="text-xs text-muted-foreground">total watched</div>
        </div>
        <div>
          <div className="text-lg font-medium text-foreground">
            {totals.sessionCount}
          </div>
          <div className="text-xs text-muted-foreground">sessions</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top channels
          </h4>
          {topChannels.length > 0 ? (
            <ol className="space-y-1.5">
              {topChannels.map((c, i) => (
                <li
                  key={c.channelLogin}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="truncate text-foreground">
                    <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                    {c.channelDisplayName ?? c.channelLogin}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {fmtHours(c.totalSecs)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No channel data.</p>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top games
          </h4>
          {topGames.length > 0 ? (
            <ol className="space-y-1.5">
              {topGames.map((g, i) => (
                <li
                  key={g.twitchGameId ?? g.twitchGameName ?? `g-${i}`}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="truncate text-foreground">
                    <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                    {g.twitchGameName ?? "Unknown"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {fmtHours(g.totalSecs)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No game data.</p>
          )}
        </div>
      </div>
    </div>
  );
}
