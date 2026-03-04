import { openUrl } from "@tauri-apps/plugin-opener";
import { Eye } from "lucide-react";
import type { TwitchStreamByGame } from "@/lib/tauri";
import { formatDuration, uptimeSeconds } from "@/lib/time";
import { DEFAULT_AVATAR } from "@/lib/utils";

export interface TwitchStreamRowProps {
  stream: TwitchStreamByGame;
  isFollowing?: boolean;
  gameName: string;
}

export function TwitchStreamRow({
  stream,
  isFollowing = false,
  gameName: _gameName,
}: TwitchStreamRowProps) {
  const url = `https://twitch.tv/${stream.login}`;
  const viewerCount = stream.viewerCount;
  const uptime = formatDuration(uptimeSeconds(stream.startedAt));
  const ariaLabel = `${stream.displayName} streaming to ${viewerCount} viewers`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openUrl(url).catch(() => {});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    openUrl(url).catch(() => {});
  };

  return (
    <a
      href={url}
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={stream.profileImageUrl || DEFAULT_AVATAR}
        alt=""
        className="size-7 shrink-0 rounded-full object-cover"
        width={28}
        height={28}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {stream.displayName}
          </span>
          {isFollowing && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Following
            </span>
          )}
        </div>
        <p
          className="truncate text-xs text-muted-foreground"
          title={stream.title}
        >
          {stream.title}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-variant-numeric tabular-nums">
          <Eye className="size-3.5 shrink-0" aria-hidden />
          {viewerCount}
        </span>
        <span className="font-variant-numeric tabular-nums">{uptime}</span>
      </div>
    </a>
  );
}
