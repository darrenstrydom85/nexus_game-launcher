import { openUrl } from "@tauri-apps/plugin-opener";
import { Star } from "lucide-react";
import type { TwitchChannel } from "@/stores/twitchStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAX_FAVORITES = 20;

export interface OfflineChannelRowProps {
  channel: TwitchChannel;
  lastSeenGame?: string | null;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  /** When adding would exceed this many favorites, tooltip is shown and toggle is no-op (Story 19.7). */
  favoritesCount?: number;
  maxFavorites?: number;
}

export function OfflineChannelRow({
  channel,
  lastSeenGame = null,
  isFavorite = false,
  onToggleFavorite,
  favoritesCount = 0,
  maxFavorites = MAX_FAVORITES,
}: OfflineChannelRowProps) {
  const url = `https://twitch.tv/${channel.login}`;
  const atFavoritesLimit =
    !isFavorite && favoritesCount >= maxFavorites;
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (atFavoritesLimit) return;
    onToggleFavorite?.(e);
  };

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
    <div
      role="link"
      tabIndex={0}
      aria-label={`${channel.displayName}${lastSeenGame ? `, last seen playing ${lastSeenGame}` : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <img
        src={channel.profileImageUrl}
        alt=""
        className="size-6 shrink-0 rounded-full object-cover"
        width={24}
        height={24}
      />
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm text-foreground">
          {channel.displayName}
        </span>
        {lastSeenGame != null && lastSeenGame !== "" && (
          <span className="ml-2 text-xs text-muted-foreground">
            {lastSeenGame}
          </span>
        )}
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
                  ? `Remove ${channel.displayName} from favorites`
                  : `Add ${channel.displayName} to favorites`
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
                ? `Remove ${channel.displayName} from favorites`
                : `Add ${channel.displayName} to favorites`}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
