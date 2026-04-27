import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { DevSettings } from "@/components/Settings/DevSettings";
import { resetNotificationPermissionCacheForTests } from "@/lib/notifications";
import { useSettingsStore } from "@/stores/settingsStore";

async function flushNotifications() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("DevSettings", () => {
  beforeEach(() => {
    resetNotificationPermissionCacheForTests();
    useSettingsStore.setState({
      enableNotifications: true,
      xpNotificationsEnabled: true,
      milestoneNotificationsEnabled: true,
      twitchEnabled: true,
      twitchNotificationsEnabled: true,
      twitchNotificationsFavoritesOnly: false,
    });
    vi.mocked(sendNotification).mockReset();
  });

  it("spawns sample XP, milestone, and Twitch native notifications", async () => {
    const user = userEvent.setup();
    render(<DevSettings />);

    await user.click(screen.getByTestId("dev-notify-xp"));
    await user.click(screen.getByTestId("dev-notify-milestone"));
    await user.click(screen.getByTestId("dev-notify-twitch"));
    await flushNotifications();

    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "Level Up!",
      body: "You're now Level 7 with 4,900 total XP.",
      extra: { kind: "xp" },
      autoCancel: true,
    }));
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "Milestone: Dev Test Milestone",
      body: "Native milestone notifications are working. - Nexus Dev Build",
      extra: { kind: "milestone" },
      autoCancel: true,
    }));
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: "NexusDev is live",
      body: "Playing Tauri Testing: Testing native desktop notifications",
      extra: {
        kind: "twitch",
        login: "nexusdev",
        displayName: "NexusDev",
        gameName: "Tauri Testing",
      },
      autoCancel: true,
    }));
  });

  it("can enable all notification settings needed for dev testing", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({
      enableNotifications: false,
      xpNotificationsEnabled: false,
      milestoneNotificationsEnabled: false,
      twitchEnabled: false,
      twitchNotificationsEnabled: false,
      twitchNotificationsFavoritesOnly: true,
    });

    render(<DevSettings />);
    await user.click(screen.getByTestId("dev-enable-notification-settings"));

    expect(useSettingsStore.getState()).toMatchObject({
      enableNotifications: true,
      xpNotificationsEnabled: true,
      milestoneNotificationsEnabled: true,
      twitchEnabled: true,
      twitchNotificationsEnabled: true,
      twitchNotificationsFavoritesOnly: false,
    });
  });
});
