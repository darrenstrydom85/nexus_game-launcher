import * as React from "react";
import * as Radix from "radix-ui";
import { Eye, Play, RefreshCw, Search } from "lucide-react";
import { cn, DEFAULT_AVATAR, formatViewerCount } from "@/lib/utils";
import { formatDuration, formatRelativeTime, uptimeSeconds } from "@/lib/time";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import type { LiveStreamItem, TwitchChannel } from "@/stores/twitchStore";
import type { TrendingLibraryGame } from "@/lib/tauri";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { TrendingTab } from "@/components/Twitch/TrendingTab";
import { TwitchConnectPrompt } from "@/components/Twitch/TwitchConnectPrompt";
import { TwitchEmptyState } from "@/components/Twitch/TwitchEmptyState";
import { TabButton } from "../library/LibraryPage";
import { streamGame, useTwitchPanel } from "./useTwitchPanel";
import { ChannelView, FavouriteButton, useLibraryGame } from "./ChannelView";

type Panel = ReturnType<typeof useTwitchPanel>;

export function TwitchPage() {
  const t = useTwitchPanel();

  if (!t.authChecked || (t.isLoading && t.channels.length === 0)) return <TwitchSkeleton />;
  if (!t.isAuthenticated) {
    return (
      <div className="flex h-full flex-col">
        <TwitchConnectPrompt />
      </div>
    );
  }
  if (t.error != null && t.channels.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <TwitchEmptyState variant="error" onRetry={t.refresh} />
      </div>
    );
  }
  if (t.channels.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <TwitchEmptyState variant="empty" />
      </div>
    );
  }

  return (
    <div data-testid="twitch-page" className="flex h-full min-h-0">
      <FollowingRail t={t} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        {t.stale && t.cachedAt != null && (
          <div role="status" className="flex items-center justify-between gap-2 border-b border-border bg-warning/10 px-8 py-2 text-sm text-warning">
            Showing cached data · Last updated {formatRelativeTime(t.cachedAt)}
          </div>
        )}
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-8 pb-12 pt-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Twitch</h1>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                Following {t.channels.length} {t.channels.length === 1 ? "channel" : "channels"} · {t.liveStreams.length} live
              </p>
            </div>
            <button
              type="button"
              data-testid="twitch-refresh"
              onClick={t.refresh}
              disabled={t.isLoading}
              className="pressable flex h-[34px] items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
            >
              <RefreshCw className={cn("size-3.5", t.isLoading && "animate-spin")} strokeWidth={1.75} />
              {t.isLoading ? "Refreshing…" : t.cachedAt != null ? `Updated ${formatRelativeTime(t.cachedAt)}` : "Refresh"}
            </button>
          </div>

          <div role="tablist" aria-label="Twitch views" className="flex gap-6 border-b border-border">
            <TabButton active={t.tab === "live"} onClick={() => t.setTab("live")} count={t.liveStreams.length} testId="twitch-tab-live">
              Live
            </TabButton>
            <TabButton active={t.tab === "trending"} onClick={() => t.setTab("trending")} count={t.trendingGames.length} testId="twitch-tab-trending">
              Trending
            </TabButton>
          </div>

          {t.tab === "trending" ? (
            <TrendingTab />
          ) : t.selectedChannel ? (
            <ChannelView
              key={t.selectedChannel.login}
              channel={t.selectedChannel}
              stream={t.selectedStream}
              favourite={t.favorites.has(t.selectedChannel.login)}
              canFavourite={t.canToggleFavorite(t.selectedChannel.login)}
              onToggleFavourite={() => t.toggleFavorite(t.selectedChannel!.login)}
              onWatch={t.watch}
              onBack={() => t.selectChannel(null)}
            />
          ) : (
            <>
              {t.trendingGames.length > 0 && <TrendingRow games={t.trendingGames} onSeeAll={() => t.setTab("trending")} />}
              <LiveNow t={t} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Following rail ──────────────────────────────────────────────── */

function FollowingRail({ t }: { t: Panel }) {
  const [query, setQuery] = React.useState("");
  const [showOffline, setShowOffline] = React.useState(false);
  const live = React.useMemo(() => new Map(t.liveStreams.map((s) => [s.login, s])), [t.liveStreams]);

  const q = query.trim().toLowerCase();
  const matches = (c: TwitchChannel) =>
    !q ||
    c.displayName.toLowerCase().includes(q) ||
    c.login.includes(q) ||
    (live.get(c.login)?.gameName ?? "").toLowerCase().includes(q);
  const byViewers = (a: TwitchChannel, b: TwitchChannel) =>
    (live.get(b.login)?.viewerCount ?? -1) - (live.get(a.login)?.viewerCount ?? -1) || a.displayName.localeCompare(b.displayName);

  const shown = t.channels.filter(matches);
  const favourites = shown.filter((c) => t.favorites.has(c.login)).sort(byViewers);
  const liveOthers = shown.filter((c) => !t.favorites.has(c.login) && live.has(c.login)).sort(byViewers);
  const offline = shown.filter((c) => !t.favorites.has(c.login) && !live.has(c.login)).sort(byViewers);
  const activeLogin = t.selectedChannel?.login ?? null;

  const group = (title: string, list: TwitchChannel[]) =>
    list.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-0.5">
        <h2 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
        <ul className="flex flex-col gap-0.5">
          {list.map((c) => (
            <ChannelRow key={c.id} channel={c} stream={live.get(c.login)} active={c.login === activeLogin} onSelect={t.selectChannel} />
          ))}
        </ul>
      </section>
    );

  return (
    <aside
      aria-label="Following"
      data-testid="twitch-rail"
      className="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card/40 px-3 py-5 max-[1000px]:w-[220px]"
    >
      <label className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-input bg-background/60 px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <span className="sr-only">Filter channels</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${t.channels.length} channels`}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      {group("Favourites", favourites)}
      {group("Live", liveOthers)}
      {offline.length > 0 && (
        <section aria-label="Offline" className="flex flex-col gap-0.5">
          <button
            type="button"
            aria-expanded={showOffline || q !== ""}
            onClick={() => setShowOffline((v) => !v)}
            className="flex justify-between rounded-lg px-2 py-2 text-[13px] text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Offline <span className="tabular-nums">{offline.length}</span>
          </button>
          {(showOffline || q !== "") && (
            <ul className="flex flex-col gap-0.5">
              {offline.map((c) => (
                <ChannelRow key={c.id} channel={c} active={c.login === activeLogin} onSelect={t.selectChannel} />
              ))}
            </ul>
          )}
        </section>
      )}
      {shown.length === 0 && <p className="px-2 text-[13px] text-muted-foreground">No channels match “{query}”.</p>}
    </aside>
  );
}

function ChannelRow({
  channel,
  stream,
  active,
  onSelect,
}: {
  channel: TwitchChannel;
  stream?: LiveStreamItem;
  active: boolean;
  onSelect: (login: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid={`twitch-channel-${channel.login}`}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(channel.login)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
          active && "bg-primary/10 hover:bg-primary/15",
        )}
      >
        <span className="relative shrink-0">
          <img
            src={channel.profileImageUrl || DEFAULT_AVATAR}
            alt=""
            width={30}
            height={30}
            className={cn("img-outline size-[30px] rounded-full object-cover", !stream && "opacity-60 grayscale")}
          />
          {stream && <span aria-hidden className="absolute -bottom-px -right-px size-[9px] rounded-full bg-red-600 ring-2 ring-card" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13px] font-semibold", stream ? "text-foreground" : "text-muted-foreground")}>
            {channel.displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{stream ? streamGame(stream) : "Offline"}</span>
        </span>
        {stream && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            <span className="sr-only">Live, </span>
            {formatViewerCount(stream.viewerCount)}
            <span className="sr-only"> viewers</span>
          </span>
        )}
      </button>
    </li>
  );
}

/* ── Trending in your library ────────────────────────────────────── */

function TrendingRow({ games, onSeeAll }: { games: TrendingLibraryGame[]; onSeeAll: () => void }) {
  const library = useGameStore((s) => s.games);
  return (
    <section aria-labelledby="twitch-trending-row" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="twitch-trending-row" className="text-[15px] font-semibold text-foreground">
          Trending in your library
        </h2>
        <button type="button" onClick={onSeeAll} className="rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          See all
        </button>
      </div>
      <ul className="-mx-1 flex gap-3.5 overflow-x-auto px-1 pb-1">
        {games.slice(0, 10).map((g) => {
          const cover = library.find((x) => x.id === g.gameId)?.coverUrl;
          return (
            <li key={g.gameId} className="w-[132px] shrink-0">
              <button
                type="button"
                onClick={() => useUiStore.getState().setDetailOverlayGameId(g.gameId)}
                className="pressable flex w-full flex-col gap-2 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="img-outline relative block aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-secondary">
                  {cover ? (
                    <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="block size-full" style={{ background: placeholderGradient(g.gameName) }} />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-black/65 px-1.5 text-[11px] font-bold tabular-nums text-white">#{g.twitchRank}</span>
                </span>
                <span className="block min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-foreground">{g.gameName}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">{formatViewerCount(g.twitchViewerCount)} watching</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Live now ────────────────────────────────────────────────────── */

function LiveNow({ t }: { t: Panel }) {
  return (
    <section aria-labelledby="twitch-live-now" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="twitch-live-now" className="mr-2.5 flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <span aria-hidden className="size-2 rounded-full bg-red-600" />
          Live now
        </h2>
        {t.liveGames.length > 1 && (
          <Radix.ToggleGroup.Root
            type="single"
            value={t.gameFilter || "__all"}
            onValueChange={(v) => v && t.setGameFilter(v === "__all" ? "" : v)}
            aria-label="Filter by game"
            className="flex flex-wrap gap-1.5"
          >
            {[{ name: "__all", count: t.liveStreams.length }, ...t.liveGames].map((g) => (
              <Radix.ToggleGroup.Item
                key={g.name}
                value={g.name}
                data-testid={`twitch-game-chip-${g.name === "__all" ? "all" : g.name}`}
                className={cn(
                  "pressable flex h-[30px] items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  "data-[state=on]:border-transparent data-[state=on]:bg-accent data-[state=on]:text-foreground",
                )}
              >
                <span className="max-w-[200px] truncate">{g.name === "__all" ? "All" : g.name}</span>
                <span className="tabular-nums text-muted-foreground/70">{g.count}</span>
              </Radix.ToggleGroup.Item>
            ))}
          </Radix.ToggleGroup.Root>
        )}
      </div>
      {t.liveStreams.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nobody you follow is live. Pick a channel on the left to see its details.</p>
      ) : (
        <>
          {t.filteredLive[0] && (
            <FeaturedStream
              stream={t.filteredLive[0]}
              heading={
                t.favorites.has(t.filteredLive[0].login)
                  ? "Your favourite is live"
                  : t.gameFilter
                    ? `Top ${t.gameFilter} stream`
                    : "Most watched right now"
              }
              favourite={t.favorites.has(t.filteredLive[0].login)}
              canFavourite={t.canToggleFavorite(t.filteredLive[0].login)}
              onToggleFavourite={() => t.toggleFavorite(t.filteredLive[0].login)}
              onWatch={() => t.watch(t.filteredLive[0])}
              onOpenChannel={() => t.selectChannel(t.filteredLive[0].login)}
            />
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px] empty:hidden">
          {t.filteredLive.slice(1).map((s) => (
            <StreamTile
              key={s.login}
              stream={s}
              inLibrary={t.isInLibrary(s)}
              favourite={t.favorites.has(s.login)}
              canFavourite={t.canToggleFavorite(s.login)}
              onToggleFavourite={() => t.toggleFavorite(s.login)}
              onWatch={() => t.watch(s)}
              onOpenChannel={() => t.selectChannel(s.login)}
            />
          ))}
          </div>
        </>
      )}
    </section>
  );
}

/** The first live stream gets the big slot: a favourite if one is on, else the most watched. */
function FeaturedStream({
  stream: s,
  heading,
  favourite,
  canFavourite,
  onToggleFavourite,
  onWatch,
  onOpenChannel,
}: {
  stream: LiveStreamItem;
  heading: string;
  favourite: boolean;
  canFavourite: boolean;
  onToggleFavourite: () => void;
  onWatch: () => void;
  onOpenChannel: () => void;
}) {
  const owned = useLibraryGame(streamGame(s));
  return (
    <article
      data-testid={`twitch-featured-${s.login}`}
      className="grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]"
    >
      <button
        type="button"
        onClick={onWatch}
        aria-label={`Watch ${s.displayName}: ${s.title}`}
        className="group relative block aspect-video w-full overflow-hidden bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <img src={s.thumbnailUrl.replace("{width}", "1280").replace("{height}", "720")} alt="" className="size-full object-cover" />
        <span className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] text-white">
          <span aria-hidden className="size-1.5 rounded-full bg-white" />
          LIVE
        </span>
        <span className="absolute bottom-3.5 right-3.5 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-0.5 text-[13px] tabular-nums text-white">
          <Eye className="size-3.5" strokeWidth={2} aria-hidden />
          {formatViewerCount(s.viewerCount)}
        </span>
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-white/90 text-black">
            <Play className="ml-1 size-7 fill-current" strokeWidth={2} />
          </span>
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-4 p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{heading}</span>
        <div className="flex items-center gap-3">
          <img
            src={s.profileImageUrl || DEFAULT_AVATAR}
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-full object-cover ring-2 ring-red-600 ring-offset-2 ring-offset-card"
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpenChannel}
              className="block max-w-full truncate rounded text-left text-lg font-semibold leading-tight text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.displayName}
            </button>
            <span className="block truncate text-[13px] text-muted-foreground">{streamGame(s)}</span>
          </div>
          <FavouriteButton name={s.displayName} favourite={favourite} canFavourite={canFavourite} onToggle={onToggleFavourite} />
        </div>
        <p className="line-clamp-3 text-[15px] leading-relaxed text-foreground" title={s.title}>
          {s.title}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
          <span className="tabular-nums">{s.viewerCount.toLocaleString()} watching</span>
          <span>Live for {formatDuration(uptimeSeconds(s.startedAt))}</span>
          {owned && (
            <button
              type="button"
              onClick={() => useUiStore.getState().setDetailOverlayGameId(owned.id)}
              className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary outline-none hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring"
            >
              In your library
            </button>
          )}
        </p>
        <div className="mt-auto flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onWatch}
            className="pressable flex h-11 items-center gap-2 rounded-xl bg-primary pl-4 pr-5 text-[15px] font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="size-4 fill-current" strokeWidth={2} />
            Watch
          </button>
          <button
            type="button"
            onClick={onOpenChannel}
            className="pressable flex h-11 items-center rounded-xl border border-border px-4 text-[15px] font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            Channel
          </button>
        </div>
      </div>
    </article>
  );
}

function StreamTile({
  stream: s,
  inLibrary,
  favourite,
  canFavourite,
  onToggleFavourite,
  onWatch,
  onOpenChannel,
}: {
  stream: LiveStreamItem;
  inLibrary: boolean;
  favourite: boolean;
  canFavourite: boolean;
  onToggleFavourite: () => void;
  onWatch: () => void;
  onOpenChannel: () => void;
}) {
  const thumb = s.thumbnailUrl.replace("{width}", "440").replace("{height}", "248");
  return (
    <article data-testid={`twitch-stream-${s.login}`} className="flex min-w-0 flex-col gap-2.5">
      <button
        type="button"
        onClick={onWatch}
        aria-label={`Watch ${s.displayName}: ${s.title}`}
        className="group img-outline relative block aspect-video w-full overflow-hidden rounded-xl bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={thumb} alt="" loading="lazy" width={440} height={248} className="size-full object-cover" />
        <span className="absolute left-2.5 top-2.5 rounded bg-red-600 px-1.5 text-[10px] font-bold tracking-[0.04em] text-white">LIVE</span>
        {inLibrary && <span className="absolute right-2.5 top-2.5 rounded-[5px] bg-black/65 px-1.5 text-[11px] font-medium text-white">In library</span>}
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-[5px] bg-black/65 px-1.5 py-px text-xs tabular-nums text-white">
          <Eye className="size-3" strokeWidth={2} aria-hidden />
          {formatViewerCount(s.viewerCount)}
        </span>
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-black">
            <Play className="ml-0.5 size-5 fill-current" strokeWidth={2} />
          </span>
        </span>
      </button>
      <div className="flex gap-2.5">
        <img src={s.profileImageUrl || DEFAULT_AVATAR} alt="" width={34} height={34} className="img-outline size-[34px] shrink-0 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground" title={s.title}>
            {s.title}
          </p>
          <p className="truncate text-[13px] text-muted-foreground">
            <button type="button" onClick={onOpenChannel} className="rounded outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              {s.displayName}
            </button>
            {" · "}
            {streamGame(s)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Live for {formatDuration(uptimeSeconds(s.startedAt))}</p>
        </div>
        <FavouriteButton name={s.displayName} favourite={favourite} canFavourite={canFavourite} onToggle={onToggleFavourite} className="size-8" />
      </div>
    </article>
  );
}

function TwitchSkeleton() {
  return (
    <div data-testid="twitch-loading" className="flex h-full min-h-0">
      <div className="flex w-[260px] shrink-0 flex-col gap-3 border-r border-border px-3 py-5">
        <div className="h-8 rounded-lg bg-secondary motion-safe:animate-pulse" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-2">
            <div className="size-[30px] rounded-full bg-secondary motion-safe:animate-pulse" />
            <div className="h-3 flex-1 rounded bg-secondary motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-[18px] px-8 pt-24">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-video rounded-xl bg-secondary motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  );
}
