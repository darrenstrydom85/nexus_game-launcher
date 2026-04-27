import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  notifyLevelUp,
  resetNotificationPermissionCacheForTests,
} from "@/lib/notifications";
import { useMilestoneStore } from "@/stores/milestoneStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useXpStore } from "@/stores/xpStore";
import type { SessionMilestone } from "@/lib/tauri";

function resetNotificationSettings() {
  useSettingsStore.setState({
    enableNotifications: true,
    xpNotificationsEnabled: true,
    milestoneNotificationsEnabled: true,
    twitchEnabled: true,
    twitchNotificationsEnabled: true,
    twitchNotificationsFavoritesOnly: false,
  });
}

async function flushNotifications() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("native notifications", () => {
  beforeEach(() => {
    resetNotificationSettings();
    resetNotificationPermissionCacheForTests();
    useMilestoneStore.setState({ toastQueue: [] });
    useXpStore.setState({ pendingLevelUp: null });
    vi.mocked(invoke).mockReset();
    vi.mocked(isPermissionGranted).mockReset();
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    vi.mocked(requestPermission).mockReset();
    vi.mocked(requestPermission).mockResolvedValue("granted");
    vi.mocked(sendNotification).mockReset();
  });

  it("formats XP level-up notifications", async () => {
    notifyLevelUp(5, 2500);
    await flushNotifications();

    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "Level Up!",
      body: "You're now Level 5 with 2,500 total XP.",
      extra: { kind: "xp" },
      autoCancel: true,
    }));
  });

  it("skips notifications when the global desktop toggle is off", async () => {
    useSettingsStore.setState({ enableNotifications: false });

    notifyLevelUp(5, 2500);
    await flushNotifications();

    expect(sendNotification).not.toHaveBeenCalled();
    expect(isPermissionGranted).not.toHaveBeenCalled();
  });

  it("skips XP notifications when the XP category is off", async () => {
    useSettingsStore.setState({ xpNotificationsEnabled: false });

    useXpStore.getState().showLevelUp(3, 900);
    await flushNotifications();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("requests permission once and skips sending when denied", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("denied");

    notifyLevelUp(2, 400);
    await flushNotifications();
    notifyLevelUp(3, 900);
    await flushNotifications();

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends one milestone notification for each queued milestone", async () => {
    const milestones: SessionMilestone[] = [
      {
        id: "long-session",
        title: "Long Session",
        description: "Played for over an hour",
        icon: "clock",
        category: "duration",
        gameName: "Hades",
      },
      {
        id: "night-owl",
        title: "Night Owl",
        description: "Played late at night",
        icon: "moon",
        category: "time",
        gameName: "Hades",
      },
    ];
    vi.mocked(invoke).mockResolvedValue(milestones);

    await useMilestoneStore.getState().enqueueSessionMilestones("session-1");
    await flushNotifications();

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: "Milestone: Long Session",
      body: "Played for over an hour - Hades",
      extra: { kind: "milestone" },
      autoCancel: true,
    }));
    expect(sendNotification).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: "Milestone: Night Owl",
      body: "Played late at night - Hades",
      extra: { kind: "milestone" },
      autoCancel: true,
    }));
  });

  it("sends a native notification when XP level-up state is shown", async () => {
    useXpStore.getState().showLevelUp(4, 1600);
    await flushNotifications();

    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "Level Up!",
      body: "You're now Level 4 with 1,600 total XP.",
      extra: { kind: "xp" },
      autoCancel: true,
    }));
  });
});
