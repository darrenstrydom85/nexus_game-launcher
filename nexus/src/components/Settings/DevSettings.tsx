import {
  notifyLevelUp,
  notifySessionMilestones,
  notifyTwitchGoLive,
} from "@/lib/notifications";
import type { SessionMilestone } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settingsStore";

const sampleMilestone: SessionMilestone = {
  id: "dev-test-milestone",
  title: "Dev Test Milestone",
  description: "Native milestone notifications are working.",
  icon: "sparkles",
  category: "dev",
  gameName: "Nexus Dev Build",
};

export function DevSettings() {
  const enableNotifications = useSettingsStore((s) => s.setEnableNotifications);
  const enableXpNotifications = useSettingsStore((s) => s.setXpNotificationsEnabled);
  const enableMilestoneNotifications = useSettingsStore((s) => s.setMilestoneNotificationsEnabled);
  const enableTwitch = useSettingsStore((s) => s.setTwitchEnabled);
  const enableTwitchNotifications = useSettingsStore((s) => s.setTwitchNotificationsEnabled);
  const disableTwitchFavoritesOnly = useSettingsStore((s) => s.setTwitchNotificationsFavoritesOnly);

  if (!import.meta.env.DEV) return null;

  const enableAllNotificationSettings = () => {
    enableNotifications(true);
    enableXpNotifications(true);
    enableMilestoneNotifications(true);
    enableTwitch(true);
    enableTwitchNotifications(true);
    disableTwitchFavoritesOnly(false);
  };

  return (
    <section data-testid="dev-settings">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Developer</h3>
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
        <p className="text-xs text-muted-foreground">
          Dev-only notification controls. These buttons use the same native notification helper as
          production XP, milestone, and Twitch events.
        </p>

        <button
          type="button"
          data-testid="dev-enable-notification-settings"
          className="rounded-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={enableAllNotificationSettings}
        >
          Enable all notification settings
        </button>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            data-testid="dev-notify-xp"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => notifyLevelUp(7, 4900)}
          >
            Test XP
          </button>
          <button
            type="button"
            data-testid="dev-notify-milestone"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => notifySessionMilestones([sampleMilestone])}
          >
            Test milestone
          </button>
          <button
            type="button"
            data-testid="dev-notify-twitch"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
            Test Twitch
          </button>
        </div>
      </div>
    </section>
  );
}
