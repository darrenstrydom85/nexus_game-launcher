import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Clapperboard, ExternalLink, Eye, Gamepad2, Play, Star } from "lucide-react";
import { cn, DEFAULT_AVATAR, formatViewerCount } from "@/lib/utils";
import { formatDuration, uptimeSeconds } from "@/lib/time";
import { getTwitchClipsForGame, type TwitchClip, type TwitchStreamByGame } from "@/lib/tauri";
import { useTwitchStore, type LiveStreamItem, type TwitchChannel } from "@/stores/twitchStore";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_FAVORITES, streamGame } from "./useTwitchPanel";

const thumb = (template: string, w: number, h: number) => template.replace("{width}", String(w)).replace("{height}", String(h));
const norm = (s: string) => s.toLowerCase().trim();

/** Library game matching a Twitch category, if you own it. */
export function useLibraryGame(gameName: string | null) {
  const games = useGameStore((s) => s.games);
  return React.useMemo(() => (gameName ? games.find((g) => norm(g.name) === norm(gameName)) ?? null : null), [games, gameName]);
}

/** Top live streams in a game, through the store's cached fetch. */
function useGameStreams(gameName: string | null): TwitchStreamByGame[] | null {
  const key = gameName?.trim() ?? "";
  const entry = useTwitchStore((s) => (key ? s.streamsByGame[key] : undefined));
  React.useEffect(() => {
    if (key) useTwitchStore.getState().fetchStreamsByGame(key);
  }, [key]);
  if (!key) return [];
  return entry ? entry.data.streams : null;
}

function useGameClips(gameName: string | null): TwitchClip[] | null {
  const [clips, setClips] = React.useState<TwitchClip[] | null>(null);
  React.useEffect(() => {
    if (!gameName) return setClips([]);
    let cancelled = false;
    setClips(null);
    getTwitchClipsForGame(gameName)
      .then((r) => !cancelled && setClips(r.clips))
      .catch(() => !cancelled && setClips([]));
    return () => {
      cancelled = true;
    };
  }, [gameName]);
  return clips;
}

function openClip(clip: TwitchClip) {
  invoke("popout_clip", { clipId: clip.id, clipTitle: clip.title, broadcasterName: clip.broadcasterName }).catch((e) =>
    console.error("[twitch] popout_clip failed:", e),
  );
}

interface ChannelViewProps {
  channel: TwitchChannel;
  stream: LiveStreamItem | null;
  favourite: boolean;
  canFavourite: boolean;
  onToggleFavourite: () => void;
  onWatch: (stream: LiveStreamItem) => void;
  onBack: () => void;
}

/** A followed channel: the stream up top, then more of the same game and its best clips. */
export function ChannelView({ channel, stream, favourite, canFavourite, onToggleFavourite, onWatch, onBack }: ChannelViewProps) {
  const game = stream ? streamGame(stream) : null;
  const owned = useLibraryGame(game);
  const streams = useGameStreams(game);
  const clips = useGameClips(game);
  const others = (streams ?? []).filter((s) => s.login !== channel.login).slice(0, 8);

  return (
    <div data-testid="twitch-channel-view" className="flex flex-col gap-8">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start rounded text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        Back to live
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        {stream ? (
          <button
            type="button"
            onClick={() => onWatch(stream)}
            aria-label={`Watch ${channel.displayName}`}
            className="group img-outline relative block aspect-video w-full overflow-hidden rounded-2xl bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src={thumb(stream.thumbnailUrl, 1280, 720)} alt="" className="size-full object-cover" />
            <span className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] text-white">
              <span aria-hidden className="size-1.5 rounded-full bg-white" />
              LIVE
            </span>
            <span className="absolute bottom-3.5 right-3.5 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-0.5 text-[13px] tabular-nums text-white">
              <Eye className="size-3.5" strokeWidth={2} aria-hidden />
              {formatViewerCount(stream.viewerCount)}
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
        ) : (
          <div data-testid="twitch-channel-offline" className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-secondary">
            <img src={channel.profileImageUrl || DEFAULT_AVATAR} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-[18px]" />
            <div className="relative flex flex-col items-center gap-2 text-center">
              <span className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Offline</span>
              <p className="max-w-xs text-sm text-foreground/85">Not streaming right now. You’ll see them here as soon as they go live.</p>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <img
              src={channel.profileImageUrl || DEFAULT_AVATAR}
              alt=""
              width={64}
              height={64}
              className={cn("size-16 shrink-0 rounded-full object-cover", stream ? "ring-2 ring-red-600 ring-offset-2 ring-offset-card" : "img-outline grayscale")}
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{channel.displayName}</h2>
              <p className="truncate text-[13px] text-muted-foreground">@{channel.login}</p>
            </div>
            <FavouriteButton name={channel.displayName} favourite={favourite} canFavourite={canFavourite} onToggle={onToggleFavourite} />
          </div>

          {stream && (
            <>
              <p className="line-clamp-3 text-[15px] leading-relaxed text-foreground" title={stream.title}>
                {stream.title}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[13px]">
                <dt className="text-muted-foreground">Playing</dt>
                <dd className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-foreground">
                  <span className="truncate">{game}</span>
                  {owned && (
                    <button
                      type="button"
                      onClick={() => useUiStore.getState().setDetailOverlayGameId(owned.id)}
                      className="flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary outline-none hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Gamepad2 className="size-3" strokeWidth={2} aria-hidden />
                      In your library
                    </button>
                  )}
                </dd>
                <dt className="text-muted-foreground">Watching</dt>
                <dd className="font-medium tabular-nums text-foreground">{stream.viewerCount.toLocaleString()}</dd>
                <dt className="text-muted-foreground">Live for</dt>
                <dd className="font-medium text-foreground">{formatDuration(uptimeSeconds(stream.startedAt))}</dd>
              </dl>
            </>
          )}

          <div className="mt-auto flex flex-wrap gap-2.5">
            {stream && (
              <button
                type="button"
                data-testid="twitch-channel-watch"
                onClick={() => onWatch(stream)}
                className="pressable flex h-11 items-center gap-2 rounded-xl bg-primary pl-4 pr-5 text-[15px] font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Play className="size-4 fill-current" strokeWidth={2} />
                Watch
              </button>
            )}
            <button
              type="button"
              onClick={() => openUrl(`https://twitch.tv/${channel.login}`).catch(() => {})}
              className="pressable flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-[15px] font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="size-4" strokeWidth={2} />
              Open on Twitch
            </button>
          </div>
        </div>
      </div>

      {game && (streams === null || others.length > 0) && (
        <MediaRow title={`More ${game} live now`} loading={streams === null} testId="twitch-more-streams">
          {others.map((s) => (
            <MediaCard
              key={s.login}
              image={thumb(s.thumbnailUrl, 440, 248)}
              badge={
                <>
                  <Eye className="size-3" strokeWidth={2} aria-hidden />
                  {formatViewerCount(s.viewerCount)}
                </>
              }
              live
              title={s.title}
              sub={s.displayName}
              label={`Watch ${s.displayName}: ${s.title}`}
              onClick={() => onWatch(s)}
            />
          ))}
        </MediaRow>
      )}

      {game && (clips === null || clips.length > 0) && (
        <MediaRow
          title={`Top ${game} clips`}
          icon={<Clapperboard className="size-4 text-[#9146ff]" strokeWidth={2} aria-hidden />}
          loading={clips === null}
          testId="twitch-clips"
        >
          {(clips ?? []).slice(0, 8).map((c) => (
            <MediaCard
              key={c.id}
              image={thumb(c.thumbnailUrl, 440, 248)}
              badge={`${Math.max(1, Math.round(c.durationSecs))}s`}
              title={c.title}
              sub={`${c.broadcasterName} · ${formatViewerCount(c.viewCount)} views`}
              label={`Play clip: ${c.title} by ${c.broadcasterName}`}
              onClick={() => openClip(c)}
            />
          ))}
        </MediaRow>
      )}
    </div>
  );
}

export function FavouriteButton({
  name,
  favourite,
  canFavourite,
  onToggle,
  className,
}: {
  name: string;
  favourite: boolean;
  canFavourite: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Favourite ${name}`}
          aria-pressed={favourite}
          aria-disabled={!canFavourite || undefined}
          onClick={() => canFavourite && onToggle()}
          className={cn(
            "pressable flex size-9 shrink-0 items-center justify-center rounded-lg outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
            favourite ? "text-yellow-500" : "text-muted-foreground hover:text-foreground",
            !canFavourite && "opacity-50",
            className,
          )}
        >
          <Star className="size-[18px]" strokeWidth={2} fill={favourite ? "currentColor" : "none"} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {!canFavourite ? `You can favourite up to ${MAX_FAVORITES} channels. Unstar someone first.` : favourite ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      </TooltipContent>
    </Tooltip>
  );
}

function MediaRow({
  title,
  icon,
  loading,
  testId,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  loading: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={testId} className="flex flex-col gap-3.5">
      <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
        {icon}
        {title}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {loading ? [0, 1, 2, 3].map((i) => <div key={i} className="aspect-video rounded-xl bg-secondary motion-safe:animate-pulse" />) : children}
      </div>
    </section>
  );
}

function MediaCard({
  image,
  badge,
  live,
  title,
  sub,
  label,
  onClick,
}: {
  image: string;
  badge: React.ReactNode;
  live?: boolean;
  title: string;
  sub: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="group flex min-w-0 flex-col gap-2 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="img-outline relative block aspect-video w-full overflow-hidden rounded-xl bg-secondary">
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        {live && <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 text-[10px] font-bold tracking-[0.04em] text-white">LIVE</span>}
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-[5px] bg-black/65 px-1.5 py-px text-xs tabular-nums text-white">{badge}</span>
        <span aria-hidden className="absolute inset-0 bg-black/25 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      </span>
      <span className="block min-w-0">
        <span className="block truncate text-[13px] font-semibold text-foreground" title={title}>
          {title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
