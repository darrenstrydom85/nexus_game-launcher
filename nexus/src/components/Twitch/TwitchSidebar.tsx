import * as React from "react";
import { ChevronDown, ChevronRight, RefreshCw, Search, WifiOff } from "lucide-react";
import type { LiveStreamItem, TwitchChannel } from "@/stores/twitchStore";
import { formatRelativeTime } from "@/lib/time";
import { TwitchChannelRow } from "./TwitchChannelRow";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TwitchSidebarProps {
  channels: TwitchChannel[];
  liveStreams: LiveStreamItem[];
  favoritesCount: number;
  maxFavorites: number;
  isLoading: boolean;
  isOnline: boolean;
  cachedAt: number | null;
  /** Login of the channel currently shown in the detail pane (highlighted). */
  activeLogin?: string | null;
  onRefresh: () => void;
  /** Selecting a channel (live or offline) opens its detail in the main pane. */
  onSelectChannel: (channel: TwitchChannel) => void;
  onToggleFavorite: (channelId: string) => (e: React.MouseEvent) => void;
}

function matches(channel: TwitchChannel, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    channel.displayName.toLowerCase().includes(q) ||
    channel.login.toLowerCase().includes(q)
  );
}

/** Favorites first, then alphabetical by display name. */
function byFavoriteThenName(a: TwitchChannel, b: TwitchChannel): number {
  const af = a.isFavorite === true ? 1 : 0;
  const bf = b.isFavorite === true ? 1 : 0;
  if (bf !== af) return bf - af;
  return a.displayName.localeCompare(b.displayName);
}

/**
 * Persistent left rail for the Twitch page: searchable list of live and
 * offline followed channels. Live channels pop out the player on click;
 * offline channels open twitch.tv in the browser.
 */
export function TwitchSidebar({
  channels,
  liveStreams,
  favoritesCount,
  maxFavorites,
  isLoading,
  isOnline,
  cachedAt,
  activeLogin,
  onRefresh,
  onSelectChannel,
  onToggleFavorite,
}: TwitchSidebarProps) {
  const [query, setQuery] = React.useState("");
  const [offlineOpen, setOfflineOpen] = React.useState(false);

  const streamByLogin = React.useMemo(() => {
    const map = new Map<string, LiveStreamItem>();
    for (const s of liveStreams) map.set(s.login, s);
    return map;
  }, [liveStreams]);

  const liveChannels = React.useMemo(
    () =>
      channels
        .filter((c) => c.isLive && matches(c, query))
        .sort((a, b) => {
          const af = a.isFavorite === true ? 1 : 0;
          const bf = b.isFavorite === true ? 1 : 0;
          if (bf !== af) return bf - af;
          const av = streamByLogin.get(a.login)?.viewerCount ?? 0;
          const bv = streamByLogin.get(b.login)?.viewerCount ?? 0;
          return bv - av;
        }),
    [channels, query, streamByLogin],
  );

  const offlineChannels = React.useMemo(
    () =>
      channels
        .filter((c) => !c.isLive && matches(c, query))
        .sort(byFavoriteThenName),
    [channels, query],
  );

  const liveTotal = channels.filter((c) => c.isLive).length;

  return (
    <aside
      data-testid="twitch-sidebar"
      className="glass-sidebar flex w-72 shrink-0 flex-col overflow-hidden border-r border-border"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Twitch
            </h1>
            <p className="text-xs text-muted-foreground">
              {channels.length} followed · {liveTotal} live
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!isOnline && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="flex items-center text-warning"
                    aria-label="Offline — showing cached data"
                  >
                    <WifiOff className="size-[14px]" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>You&apos;re offline. Showing cached data.</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50"
                  aria-label="Refresh"
                >
                  <RefreshCw
                    className={`size-4 ${isLoading ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {cachedAt != null
                  ? `Updated ${formatRelativeTime(cachedAt)}`
                  : "Refresh"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels"
            aria-label="Search channels"
            className="h-8 w-full rounded-md border border-border bg-input pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          />
        </div>
      </div>

      {/* Channel lists */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live ({liveChannels.length})
        </p>
        {liveChannels.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {query ? "No matching live channels." : "No one is live."}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {liveChannels.map((channel) => {
              const stream = streamByLogin.get(channel.login);
              return (
                <TwitchChannelRow
                  key={channel.id}
                  channel={channel}
                  isLive
                  viewerCount={stream?.viewerCount}
                  gameName={stream?.gameName}
                  isFavorite={channel.isFavorite === true}
                  onToggleFavorite={onToggleFavorite(channel.id)}
                  favoritesCount={favoritesCount}
                  maxFavorites={maxFavorites}
                  onActivate={onSelectChannel}
                  isActive={activeLogin === channel.login}
                />
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOfflineOpen((o) => !o)}
          className="mt-3 flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          aria-expanded={offlineOpen}
        >
          {offlineOpen ? (
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          )}
          Offline ({offlineChannels.length})
        </button>
        {offlineOpen && (
          <div className="mt-1 flex flex-col gap-0.5">
            {offlineChannels.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {query ? "No matching channels." : "No offline channels."}
              </p>
            ) : (
              offlineChannels.map((channel) => (
                <TwitchChannelRow
                  key={channel.id}
                  channel={channel}
                  isLive={false}
                  isFavorite={channel.isFavorite === true}
                  onToggleFavorite={onToggleFavorite(channel.id)}
                  favoritesCount={favoritesCount}
                  maxFavorites={maxFavorites}
                  onActivate={onSelectChannel}
                  isActive={activeLogin === channel.login}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
