import * as React from "react";
import type { Game, GameStatus } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import { useSettingsStore } from "@/stores/settingsStore";

const HOURS_THRESHOLD = 20;
const DAYS_SINCE_LAST_LAUNCH = 30;

export interface StatusTransitionResult {
  gameId: string;
  fromStatus: GameStatus;
  toStatus: GameStatus;
  reason: "first_launch" | "long_play_suggestion";
}

export function checkFirstLaunchTransition(game: Game): StatusTransitionResult | null {
  if (game.status !== "backlog") return null;
  return {
    gameId: game.id,
    fromStatus: "backlog",
    toStatus: "playing",
    reason: "first_launch",
  };
}

export function checkLongPlaySuggestion(game: Game): StatusTransitionResult | null {
  const hours = game.totalPlayTimeS / 3600;
  if (hours < HOURS_THRESHOLD) return null;
  if (!game.lastPlayedAt) return null;

  const daysSinceLast = (Date.now() - new Date(game.lastPlayedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLast < DAYS_SINCE_LAST_LAUNCH) return null;
  if (game.status === "completed" || game.status === "dropped") return null;

  return {
    gameId: game.id,
    fromStatus: game.status,
    toStatus: "completed",
    reason: "long_play_suggestion",
  };
}

interface UseAutoStatusTransitionOptions {
  game: Game;
  isFirstLaunch?: boolean;
  onStatusChange: (gameId: string, status: GameStatus) => void;
}

export function useAutoStatusTransition({
  game,
  isFirstLaunch = false,
  onStatusChange,
}: UseAutoStatusTransitionOptions) {
  const addToast = useToastStore((s) => s.addToast);
  const autoEnabled = useSettingsStore((s) => s.autoStatusTransitions);

  React.useEffect(() => {
    if (!autoEnabled) return;

    if (isFirstLaunch) {
      const transition = checkFirstLaunchTransition(game);
      if (transition) {
        onStatusChange(game.id, "playing");
        addToast({
          type: "info",
          message: `"${game.name}" status changed to Playing`,
          action: {
            label: "Undo",
            onClick: () => onStatusChange(game.id, transition.fromStatus),
          },
        });
      }
    }

    const suggestion = checkLongPlaySuggestion(game);
    if (suggestion) {
      addToast({
        type: "info",
        message: `Finished with "${game.name}"?`,
        duration: 10000,
        action: {
          label: "Completed",
          onClick: () => onStatusChange(game.id, "completed"),
        },
      });
    }
  }, [game.id, isFirstLaunch, autoEnabled]);
}
