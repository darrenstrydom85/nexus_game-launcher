import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { SessionMilestone } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settingsStore";

interface NativeNotificationPayload {
  title: string;
  body: string;
  extra?: NotificationClickPayload;
}

interface TwitchGoLiveNotification {
  login?: string;
  displayName: string;
  gameName: string;
  title: string;
  isFavorite?: boolean;
}

type NotificationCategory = "xp" | "milestone" | "twitch";
export type NotificationClickPayload =
  | { kind: "xp" }
  | { kind: "milestone" }
  | {
      kind: "twitch";
      login?: string;
      displayName: string;
      gameName: string;
    };

let permissionDenied = false;
const xpFormatter = new Intl.NumberFormat("en-US");

function isCategoryEnabled(category: NotificationCategory): boolean {
  const settings = useSettingsStore.getState();
  if (!settings.enableNotifications) return false;

  if (category === "xp") return settings.xpNotificationsEnabled;
  if (category === "milestone") return settings.milestoneNotificationsEnabled;
  return settings.twitchEnabled && settings.twitchNotificationsEnabled;
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionDenied) return false;

  try {
    if (await isPermissionGranted()) return true;

    const permission = await requestPermission();
    const granted = permission === "granted";
    permissionDenied = !granted;
    return granted;
  } catch {
    return false;
  }
}

async function sendNativeNotification(
  category: NotificationCategory,
  payload: NativeNotificationPayload,
): Promise<void> {
  if (!isCategoryEnabled(category)) return;

  try {
    if (!(await ensureNotificationPermission())) return;
    sendNotification({ ...payload, autoCancel: true });
  } catch {
    // Native notifications are a convenience layer and must never block app flows.
  }
}

export function notifyLevelUp(level: number, totalXp: number): void {
  void sendNativeNotification("xp", {
    title: "Level Up!",
    body: `You're now Level ${level} with ${xpFormatter.format(totalXp)} total XP.`,
    extra: { kind: "xp" },
  });
}

export function notifySessionMilestones(milestones: SessionMilestone[]): void {
  for (const milestone of milestones) {
    const suffix = milestone.gameName ? ` - ${milestone.gameName}` : "";
    void sendNativeNotification("milestone", {
      title: `Milestone: ${milestone.title}`,
      body: `${milestone.description}${suffix}`,
      extra: { kind: "milestone" },
    });
  }
}

export function notifyTwitchGoLive(toast: TwitchGoLiveNotification): void {
  const settings = useSettingsStore.getState();
  if (settings.twitchNotificationsFavoritesOnly && !toast.isFavorite) return;

  const streamTitle = toast.title ? `: ${toast.title}` : "";
  void sendNativeNotification("twitch", {
    title: `${toast.displayName} is live`,
    body: `Playing ${toast.gameName}${streamTitle}`,
    extra: {
      kind: "twitch",
      login: toast.login,
      displayName: toast.displayName,
      gameName: toast.gameName,
    },
  });
}

export function resetNotificationPermissionCacheForTests(): void {
  permissionDenied = false;
}
