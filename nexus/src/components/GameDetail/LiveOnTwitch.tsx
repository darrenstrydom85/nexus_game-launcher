import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Tv, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useTwitchStore } from "@/stores/twitchStore";
import { TwitchStreamRow } from "./TwitchStreamRow";
import type { TwitchStreamByGame } from "@/lib/tauri";

const DEBOUNCE_MS = 300;
const MAX_STREAMS_SHOWN = 6;

export interface LiveOnTwitchProps {
  gameName: string;
}

function LiveOnTwitchSkeleton() {
  return (
    <div className="flex flex-col gap-2" data-testid="live-on-twitch-skeleton">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md px-2 py-2"
          aria-hidden
        >
          <div className="size-7 shrink-0 rounded-full bg-muted animate-pulse" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-full max-w-[180px] rounded bg-muted animate-pulse" />
          </div>
          <div className="h-3 w-12 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function LiveOnTwitch({ gameName }: LiveOnTwitchProps) {
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const channels = useTwitchStore((s) => s.channels);
  const streamsByGame = useTwitchStore((s) => s.streamsByGame);
  const streamsByGameLoading = useTwitchStore((s) => s.streamsByGameLoading);
  const streamsByGameError = useTwitchStore((s) => s.streamsByGameError);
  const fetchStreamsByGame = useTwitchStore((s) => s.fetchStreamsByGame);

  const key = gameName.trim();
  const entry = key ? streamsByGame[key] : null;
  const data = entry?.data ?? null;
  const loading = key ? (streamsByGameLoading[key] ?? false) : false;
  const error = key ? (streamsByGameError[key] ?? null) : null;

  const [expanded, setExpanded] = React.useState(true);

  const norm = (s: string) => s.trim().toLowerCase();
  const twitchGameNameNorm = data?.twitchGameName
    ? norm(data.twitchGameName)
    : null;

  const followedPlayingGame: TwitchStreamByGame[] = React.useMemo(() => {
    return channels
      .filter(
        (c): c is typeof c & { stream: NonNullable<typeof c.stream> } =>
          c.stream != null &&
          (norm(c.stream.gameName) === norm(gameName) ||
            (twitchGameNameNorm !== null &&
              norm(c.stream.gameName) === twitchGameNameNorm)),
      )
      .map((c) => ({
        userId: c.id,
        login: c.login,
        displayName: c.displayName,
        profileImageUrl: c.profileImageUrl,
        title: c.stream.title,
        gameName: c.stream.gameName,
        gameId: c.stream.gameId,
        viewerCount: c.stream.viewerCount,
        thumbnailUrl: c.stream.thumbnailUrl,
        startedAt: c.stream.startedAt,
      }));
  }, [channels, gameName, twitchGameNameNorm]);

  const directoryStreams = data
    ? [...data.streams].sort((a, b) => b.viewerCount - a.viewerCount)
    : [];
  const followedIdsInGame = new Set(followedPlayingGame.map((s) => s.userId));
  const followedSorted = [...followedPlayingGame].sort(
    (a, b) => b.viewerCount - a.viewerCount,
  );
  const restStreams = directoryStreams.filter(
    (s) => !followedIdsInGame.has(s.userId),
  );
  const streams: TwitchStreamByGame[] =
    followedSorted.length > 0
      ? [...followedSorted, ...restStreams]
      : directoryStreams;

  React.useEffect(() => {
    if (data) setExpanded(streams.length > 0);
  }, [key, data]);

  React.useEffect(() => {
    if (!key || !isAuthenticated) return;
    const t = setTimeout(() => {
      fetchStreamsByGame(key);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, isAuthenticated, fetchStreamsByGame]);

  // Section only when authenticated and (we have data, or we're loading, or we have cache)
  if (!isAuthenticated) return null;
  if (error && !data) return null;

  const followedIds = new Set(channels.map((c) => c.id));
  const topStreams = streams.slice(0, MAX_STREAMS_SHOWN);
  const hasMore = streams.length > MAX_STREAMS_SHOWN;
  const twitchGameName = data?.twitchGameName ?? encodeURIComponent(gameName);
  const viewAllUrl = `https://twitch.tv/directory/game/${encodeURIComponent(twitchGameName)}`;
  const defaultExpanded = streams.length > 0;
  const isExpanded = data ? expanded : defaultExpanded;

  const streamCountLabel =
    streams.length === 0
      ? "0 streams"
      : streams.length === 1
        ? "1 stream"
        : `${streams.length} streams`;

  return (
    <section
      aria-label={`Live streams on Twitch for ${gameName}`}
      className="rounded-lg border border-border bg-card p-4"
      data-testid="live-on-twitch-section"
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Tv className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold text-foreground">
          Live on Twitch
        </span>
        <span className="text-xs text-muted-foreground">{streamCountLabel}</span>
      </button>

      {isExpanded && (
        <div className="mt-3">
          {loading && !data && <LiveOnTwitchSkeleton />}
          {data && !loading && (
            <>
              {streams.length === 0 ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="live-on-twitch-empty"
                >
                  No one is streaming {gameName} right now
                </p>
              ) : (
                <ul className="flex flex-col gap-0">
                  {topStreams.map((stream) => (
                    <li key={stream.userId}>
                      <TwitchStreamRow
                        stream={stream}
                        isFollowing={followedIds.has(stream.userId)}
                        gameName={gameName}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {hasMore && (
                <a
                  href={viewAllUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    openUrl(viewAllUrl).catch(() => {});
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  data-testid="live-on-twitch-view-all"
                >
                  View all on Twitch
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
