import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  onAction,
  type Options as NotificationOptions,
} from "@tauri-apps/plugin-notification";
import type { PluginListener } from "@tauri-apps/api/core";
import type { NotificationClickPayload } from "@/lib/notifications";
import { navigateFromTrayTarget, navigateToStatsSection } from "@/lib/navigation";

function isNotificationClickPayload(value: unknown): value is NotificationClickPayload {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "xp" || kind === "milestone" || kind === "twitch";
}

async function showMainWindow() {
  try {
    await invoke("show_main_window");
  } catch {
    // The notification action should still navigate state even if focusing fails.
  }
}

export function useNativeNotificationActions() {
  React.useEffect(() => {
    let cancelled = false;
    let listener: PluginListener | null = null;

    onAction(async (notification: NotificationOptions) => {
      const payload = notification.extra;
      if (!isNotificationClickPayload(payload)) return;

      await showMainWindow();

      if (payload.kind === "xp") {
        navigateToStatsSection("xp");
        return;
      }

      if (payload.kind === "milestone") {
        navigateToStatsSection("milestones");
        return;
      }

      navigateFromTrayTarget("twitch");
      if (payload.login) {
        await invoke("popout_stream", {
          channelLogin: payload.login,
          channelDisplayName: payload.displayName,
          twitchGameId: null,
          twitchGameName: payload.gameName || null,
        }).catch(() => {});
      }
    })
      .then((registeredListener) => {
        if (cancelled) {
          registeredListener.unregister().catch(() => {});
        } else {
          listener = registeredListener;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listener?.unregister().catch(() => {});
    };
  }, []);
}
