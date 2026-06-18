import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  Gamepad2,
  Play,
  Star,
  Users,
} from "lucide-react";
import type { LiveStreamItem, TwitchChannel } from "@/stores/twitchStore";
import { formatDuration, uptimeSeconds } from "@/lib/time";
import { cn, DEFAULT_AVATAR, formatViewerCount } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TWITCH_DIRECTORY_BASE = "https://twitch.tv/directory/game/";

function thumbnailUrl(template: string): string {
  return template.replace("{width}", "1280").replace("{height}", "720");
}

export interface ChannelDetailProps {
  channel: TwitchChannel;
  /** Live stream data when the channel is currently live; null when offline. */
  stream: LiveStreamItem | null;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  favoritesCount?: number;
  maxFavorites?: number;
  /** Opens the pop-out player window. */
  onWatch: (stream: LiveStreamItem) => void;
  /** Returns to the live grid. */
  onClose: () => void;
}

/**
 * In-pane detail / preview for a selected channel. Replaces the old hero
 * banner: shows a stream preview, game details, and actions (Watch on a
 * pop-out window, open on Twitch). Offline channels show a condensed card.
 */
export function ChannelDetail({
  channel,
  stream,
  isFavorite = false,
  onToggleFavorite,
  favoritesCount = 0,
  maxFavorites = 20,
  onWatch,
  onClose,
}: ChannelDetailProps) {
  const games = useGameStore((s) => s.games);
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);

  // Force a fresh loading state on the preview whenever the source changes,
  // otherwise React reuses the same <img> and the previous channel's thumbnail
  // lingers until the new one decodes (feels like a hang).
  const previewSrc = stream ? thumbnailUrl(stream.thumbnailUrl) : "";
  const [previewLoaded, setPreviewLoaded] = React.useState(false);
  React.useEffect(() => {
    setPreviewLoaded(false);
  }, [previewSrc]);

  const gameName = stream?.gameName || "";
  const libraryGame = React.useMemo(() => {
    if (!gameName) return null;
    const lower = gameName.toLowerCase();
    return games.find((g) => g.name.toLowerCase() === lower) ?? null;
  }, [games, gameName]);

  const atFavoritesLimit = !isFavorite && favoritesCount >= maxFavorites;
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (atFavoritesLimit) return;
    onToggleFavorite?.(e);
  };

  const openOnTwitch = () => {
    openUrl(`https://twitch.tv/${channel.login}`).catch(() => {});
  };

  const FavoriteButton = onToggleFavorite ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleStarClick}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={
            isFavorite
              ? `Remove ${channel.displayName} from favorites`
              : `Add ${channel.displayName} to favorites`
          }
          aria-pressed={isFavorite}
        >
          <Star
            className={`size-4 ${isFavorite ? "text-yellow-500" : ""}`}
            fill={isFavorite ? "currentColor" : "none"}
            aria-hidden
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {atFavoritesLimit
          ? "Maximum 20 favorites reached. Unstar someone first."
          : isFavorite
            ? `Remove ${channel.displayName} from favorites`
            : `Add ${channel.displayName} to favorites`}
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <button
        type="button"
        onClick={onClose}
        className="flex w-fit items-center gap-1.5 rounded-md py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to live
      </button>

      {stream ? (
        <>
          {/* Preview */}
          <button
            type="button"
            onClick={() => onWatch(stream)}
            aria-label={`Watch ${channel.displayName}`}
            className="group relative block w-full overflow-hidden rounded-xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <img
                key={previewSrc}
                src={previewSrc}
                alt=""
                onLoad={() => setPreviewLoaded(true)}
                className={cn(
                  "size-full object-cover transition-opacity duration-200",
                  previewLoaded ? "opacity-100" : "opacity-0",
                )}
                width={1280}
                height={720}
              />
              {!previewLoaded && (
                <div
                  className="absolute inset-0 animate-pulse bg-muted"
                  aria-hidden
                />
              )}
              <div
                className="absolute inset-0 bg-gradient-to-t from-[var(--background)]/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                <span className="size-1.5 rounded-full bg-white" aria-hidden />
                Live
              </span>
              <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm tabular-nums">
                <Eye className="size-3.5" aria-hidden />
                {formatViewerCount(stream.viewerCount)}
              </span>
              {/* Play affordance */}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-primary/90 text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-7 fill-current" aria-hidden />
                </span>
              </span>
            </div>
          </button>

          {/* Channel header + actions */}
          <div className="flex items-start gap-3">
            <img
              src={channel.profileImageUrl || DEFAULT_AVATAR}
              alt=""
              className="size-12 shrink-0 rounded-full object-cover"
              width={48}
              height={48}
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-foreground">
                {channel.displayName}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                @{channel.login}
              </p>
            </div>
            {FavoriteButton}
          </div>

          <p className="text-sm text-foreground" title={stream.title}>
            {stream.title}
          </p>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 tabular-nums">
              <Users className="size-4" aria-hidden />
              {formatViewerCount(stream.viewerCount)} viewers
            </span>
            <span className="tabular-nums">
              Live for {formatDuration(uptimeSeconds(stream.startedAt))}
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onWatch(stream)}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Play className="size-4 fill-current" aria-hidden />
              Watch
            </button>
            <button
              type="button"
              onClick={openOnTwitch}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ExternalLink className="size-4" aria-hidden />
              Open on Twitch
            </button>
          </div>

          {/* Game details */}
          {gameName && (
            <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
              {libraryGame?.coverUrl ? (
                <img
                  src={libraryGame.coverUrl}
                  alt=""
                  className="h-20 w-[54px] shrink-0 rounded-md object-cover"
                  style={{ aspectRatio: "2/3" }}
                />
              ) : (
                <div
                  className="flex h-20 w-[54px] shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                  style={{ aspectRatio: "2/3" }}
                  aria-hidden
                >
                  <Gamepad2 className="size-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Playing
                </p>
                <p className="truncate text-sm font-semibold text-foreground" title={gameName}>
                  {gameName}
                </p>
                {libraryGame && (
                  <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    In your library
                  </span>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {libraryGame && (
                    <button
                      type="button"
                      onClick={() => setDetailOverlayGameId(libraryGame.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      View game
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      openUrl(
                        `${TWITCH_DIRECTORY_BASE}${encodeURIComponent(gameName)}`,
                      ).catch(() => {})
                    }
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Browse on Twitch
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Offline */
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-12 text-center">
          <img
            src={channel.profileImageUrl || DEFAULT_AVATAR}
            alt=""
            className="size-20 rounded-full object-cover opacity-70 grayscale"
            width={80}
            height={80}
          />
          <div>
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {channel.displayName}
              </h2>
              {FavoriteButton}
            </div>
            <p className="text-sm text-muted-foreground">@{channel.login}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {channel.displayName} is offline right now.
          </p>
          <button
            type="button"
            onClick={openOnTwitch}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ExternalLink className="size-4" aria-hidden />
            Open on Twitch
          </button>
        </div>
      )}
    </div>
  );
}
