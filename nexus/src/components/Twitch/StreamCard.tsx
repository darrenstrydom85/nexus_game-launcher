import { openUrl } from "@tauri-apps/plugin-opener";
import { Eye, Star } from "lucide-react";
import type { LiveStreamItem } from "@/stores/twitchStore";
import { formatDuration, uptimeSeconds } from "@/lib/time";
import { DEFAULT_AVATAR } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function thumbnailUrl(template: string): string {
  return template
    .replace("{width}", "440")
    .replace("{height}", "248");
}

const MAX_FAVORITES = 20;

export interface StreamCardProps {
  stream: LiveStreamItem;
  isInLibrary?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  /** When adding would exceed this many favorites, tooltip is shown and toggle is no-op (Story 19.7). */
  favoritesCount?: number;
  maxFavorites?: number;
}

export function StreamCard({
  stream,
  isInLibrary = false,
  isFavorite = false,
  onToggleFavorite,
  favoritesCount = 0,
  maxFavorites = MAX_FAVORITES,
}: StreamCardProps) {
  const atFavoritesLimit =
    !isFavorite && favoritesCount >= maxFavorites;
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (atFavoritesLimit) return;
    onToggleFavorite?.(e);
  };
  const url = `https://twitch.tv/${stream.login}`;
  const uptime = formatDuration(uptimeSeconds(stream.startedAt));
  const thumb = thumbnailUrl(stream.thumbnailUrl);
  const ariaLabel = `${stream.displayName} streaming ${stream.gameName} to ${stream.viewerCount} viewers`;

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-twitch-star]")) return;
    openUrl(url).catch(() => {});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if ((e.target as HTMLElement).closest("[data-twitch-star]")) return;
    openUrl(url).catch(() => {});
  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex w-full cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card transition-[transform,box-shadow] duration-200 hover:scale-[1.02] hover:ring-1 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:scale-100"
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-t-md bg-muted">
        {isInLibrary && (
          <div className="absolute right-2 top-2 z-[1] rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            In Library
          </div>
        )}
        <img
          src={thumb}
          alt=""
          className="size-full object-cover"
          width={440}
          height={248}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--background)] to-transparent"
          aria-hidden
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-white drop-shadow-sm">
            {isFavorite && (
              <Star
                className="size-3 shrink-0 fill-current text-yellow-500"
                aria-hidden
              />
            )}
            <span className="truncate">{stream.displayName}</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="size-3 shrink-0" aria-hidden />
            <span className="font-variant-numeric tabular-nums">
              {stream.viewerCount}
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="truncate text-xs font-medium text-foreground" title={stream.gameName}>
          {stream.gameName}
        </p>
        <p
          className="line-clamp-2 text-xs text-muted-foreground"
          title={stream.title}
        >
          {stream.title}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img
              src={stream.profileImageUrl || DEFAULT_AVATAR}
              alt=""
              className="size-6 shrink-0 rounded-full object-cover"
              width={24}
              height={24}
            />
            <span className="truncate text-xs text-muted-foreground">
              Live for {uptime}
            </span>
          </div>
          {onToggleFavorite != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-twitch-star
                  onClick={handleStarClick}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={
                    isFavorite
                      ? `Remove ${stream.displayName} from favorites`
                      : `Add ${stream.displayName} to favorites`
                  }
                  aria-pressed={isFavorite}
                >
                  <Star
                    className={`size-3.5 ${isFavorite ? "text-yellow-500" : "text-muted-foreground"}`}
                    fill={isFavorite ? "currentColor" : "none"}
                    aria-hidden
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {atFavoritesLimit
                  ? "Maximum 20 favorites reached. Unstar someone first."
                  : isFavorite
                    ? `Remove ${stream.displayName} from favorites`
                    : `Add ${stream.displayName} to favorites`}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </article>
  );
}
