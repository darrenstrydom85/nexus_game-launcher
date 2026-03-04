import { openUrl } from "@tauri-apps/plugin-opener";
import { Star } from "lucide-react";
import type { TwitchChannel } from "@/stores/twitchStore";

export interface OfflineChannelRowProps {
  channel: TwitchChannel;
  lastSeenGame?: string | null;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export function OfflineChannelRow({
  channel,
  lastSeenGame = null,
  isFavorite = false,
  onToggleFavorite,
}: OfflineChannelRowProps) {
  const url = `https://twitch.tv/${channel.login}`;

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
        <button
          type="button"
          data-twitch-star
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(e);
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className="size-3.5"
            fill={isFavorite ? "currentColor" : "none"}
            style={isFavorite ? { color: "var(--chart-3)" } : undefined}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}
