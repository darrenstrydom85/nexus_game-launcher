import { Eye, Star } from "lucide-react";
import type { TwitchChannel } from "@/stores/twitchStore";
import { DEFAULT_AVATAR, formatViewerCount } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAX_FAVORITES = 20;

export interface TwitchChannelRowProps {
  channel: TwitchChannel;
  isLive: boolean;
  /** Live-only: current viewer count. */
  viewerCount?: number;
  /** Live-only: the game being streamed. */
  gameName?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  /** When adding would exceed this many favorites, the toggle is a no-op. */
  favoritesCount?: number;
  maxFavorites?: number;
  /** Activated on click / Enter / Space. Live rows pop out the player;
   *  offline rows open twitch.tv in the browser (decided by the parent). */
  onActivate: (channel: TwitchChannel) => void;
  /** Highlights the row as the currently-featured channel. */
  isActive?: boolean;
}

/**
 * Compact channel row for the Twitch rail. Renders both live and offline
 * channels with a shared layout: avatar, name, and a live/offline secondary
 * line, plus a favorite star. Live rows show a pulsing dot + viewer count.
 */
export function TwitchChannelRow({
  channel,
  isLive,
  viewerCount,
  gameName,
  isFavorite = false,
  onToggleFavorite,
  favoritesCount = 0,
  maxFavorites = MAX_FAVORITES,
  onActivate,
  isActive = false,
}: TwitchChannelRowProps) {
  const reduceMotion = useReducedMotion();
  const atFavoritesLimit = !isFavorite && favoritesCount >= maxFavorites;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (atFavoritesLimit) return;
    onToggleFavorite?.(e);
  };

  const activate = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("[data-twitch-star]")) return;
    onActivate(channel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    activate(e);
  };

  const secondary = isLive
    ? gameName || "Just Chatting"
    : "Offline";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={
        isLive
          ? `${channel.displayName} live${gameName ? ` playing ${gameName}` : ""}${viewerCount != null ? `, ${viewerCount} viewers` : ""}`
          : `${channel.displayName}, offline`
      }
      aria-current={isActive ? "true" : undefined}
      onClick={activate}
      onKeyDown={handleKeyDown}
      className={`group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        isActive ? "bg-primary/10" : "hover:bg-accent"
      }`}
    >
      <span className="relative shrink-0">
        <img
          src={channel.profileImageUrl || DEFAULT_AVATAR}
          alt=""
          className={`size-8 rounded-full object-cover ${isLive ? "ring-2 ring-destructive/70" : "opacity-60 grayscale"}`}
          width={32}
          height={32}
        />
        {isLive && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-destructive ${!reduceMotion ? "animate-play-pulse" : ""}`}
            aria-hidden
          />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${isLive ? "text-foreground" : "text-muted-foreground"}`}
          title={channel.displayName}
        >
          {channel.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={secondary}>
          {secondary}
        </p>
      </div>

      {isLive && viewerCount != null && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Eye className="size-3" aria-hidden />
          {formatViewerCount(viewerCount)}
        </span>
      )}

      {onToggleFavorite != null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-twitch-star
              onClick={handleStarClick}
              className={`shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                isFavorite
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
              aria-label={
                isFavorite
                  ? `Remove ${channel.displayName} from favorites`
                  : `Add ${channel.displayName} to favorites`
              }
              aria-pressed={isFavorite}
            >
              <Star
                className={`size-3.5 ${isFavorite ? "text-yellow-500" : ""}`}
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
      )}
    </div>
  );
}
