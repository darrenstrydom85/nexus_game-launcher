import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGameLiveBadge } from "@/hooks/useGameLiveBadge";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export interface TwitchLiveBadgeProps {
  gameName: string;
  /** Optional class for the wrapper (e.g. positioning). */
  className?: string;
}

function tooltipText(
  count: number,
  streamers: { displayName: string }[],
): string {
  if (count === 1) {
    return `${streamers[0].displayName} is streaming this`;
  }
  if (count <= 3) {
    return `${streamers.map((s) => s.displayName).join(", ")} are streaming this`;
  }
  const a = streamers[0].displayName;
  const b = streamers[1].displayName;
  const more = count - 2;
  return `${a}, ${b} + ${more} more are streaming this`;
}

export function TwitchLiveBadge({ gameName, className }: TwitchLiveBadgeProps) {
  const badge = useGameLiveBadge(gameName);
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const cachedAt = useTwitchStore((s) => s.cachedAt);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const setActiveNav = useUiStore((s) => s.setActiveNav);
  const setTwitchPanelScrollToGameName = useUiStore(
    (s) => s.setTwitchPanelScrollToGameName,
  );
  const reduceMotion = useReducedMotion();

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!badge) return;
      if (badge.count === 1) {
        openUrl(`https://twitch.tv/${badge.streamers[0].login}`).catch(() => {});
      } else {
        setActiveNav("twitch");
        setTwitchPanelScrollToGameName(gameName);
      }
    },
    [
      badge,
      gameName,
      setActiveNav,
      setTwitchPanelScrollToGameName,
    ],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (!badge) return;
        if (badge.count === 1) {
          openUrl(
            `https://twitch.tv/${badge.streamers[0].login}`,
          ).catch(() => {});
        } else {
          setActiveNav("twitch");
          setTwitchPanelScrollToGameName(gameName);
        }
      }
    },
    [
      badge,
      gameName,
      setActiveNav,
      setTwitchPanelScrollToGameName,
    ],
  );

  if (
    !twitchEnabled ||
    !isAuthenticated ||
    cachedAt == null ||
    badge == null ||
    badge.count === 0
  ) {
    return null;
  }

  const label = `${badge.count} followed streamers live on Twitch`;
  const tipText = tooltipText(badge.count, badge.streamers);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label={label}
          data-testid="twitch-live-badge"
          className={cn(
            "absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5",
            "bg-black/70 text-[10px] font-medium tabular-nums text-white backdrop-blur-[4px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "transition-opacity hover:opacity-90",
            className,
          )}
          style={{ background: "hsla(0, 0%, 0%, 0.7)" }}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-red-500",
              !reduceMotion && "animate-play-pulse",
            )}
            aria-hidden
          />
          <span>{badge.count} live</span>
        </button>
      </TooltipTrigger>
      <TooltipContent aria-label={tipText} side="bottom" sideOffset={4}>
        {tipText}
      </TooltipContent>
    </Tooltip>
  );
}
