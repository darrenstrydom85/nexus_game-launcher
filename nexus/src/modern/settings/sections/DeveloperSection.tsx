import { Button } from "@/components/ui/button";
import { notifyLevelUp, notifySessionMilestones, notifyTwitchGoLive } from "@/lib/notifications";
import type { SessionMilestone } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settingsStore";
import { SettingsCard, SettingsRow } from "../SettingsKit";

const SAMPLE_MILESTONE: SessionMilestone = {
  id: "dev-test-milestone",
  title: "Dev Test Milestone",
  description: "Native milestone notifications are working.",
  icon: "sparkles",
  category: "dev",
  gameName: "Nexus Dev Build",
};

export function DeveloperSection() {
  const setEnableNotifications = useSettingsStore((s) => s.setEnableNotifications);
  const setXpNotifications = useSettingsStore((s) => s.setXpNotificationsEnabled);
  const setMilestoneNotifications = useSettingsStore((s) => s.setMilestoneNotificationsEnabled);
  const setTwitchEnabled = useSettingsStore((s) => s.setTwitchEnabled);
  const setTwitchNotifications = useSettingsStore((s) => s.setTwitchNotificationsEnabled);
  const setTwitchFavouritesOnly = useSettingsStore((s) => s.setTwitchNotificationsFavoritesOnly);

  if (!import.meta.env.DEV) return null;

  const enableAll = () => {
    setEnableNotifications(true);
    setXpNotifications(true);
    setMilestoneNotifications(true);
    setTwitchEnabled(true);
    setTwitchNotifications(true);
    setTwitchFavouritesOnly(false);
  };

  return (
    <SettingsCard title="Notifications" data-testid="dev-settings">
      <SettingsRow
        label="Enable all notification settings"
        description="Turns on desktop, XP, milestone and Twitch notifications, for every channel rather than favourites only"
      >
        <Button variant="outline" size="sm" data-testid="dev-enable-notification-settings" onClick={enableAll}>
          Enable all
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Send a test notification"
        description="Uses the same native helper as real XP, milestone and Twitch events"
      >
        <Button variant="outline" size="sm" data-testid="dev-notify-xp" onClick={() => notifyLevelUp(7, 4900)}>
          XP
        </Button>
        <Button variant="outline" size="sm" data-testid="dev-notify-milestone" onClick={() => notifySessionMilestones([SAMPLE_MILESTONE])}>
          Milestone
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="dev-notify-twitch"
          onClick={() =>
            notifyTwitchGoLive({
              login: "nexusdev",
              displayName: "NexusDev",
              gameName: "Tauri Testing",
              title: "Testing native desktop notifications",
              isFavorite: true,
            })
          }
        >
          Twitch
        </Button>
      </SettingsRow>
    </SettingsCard>
  );
}
