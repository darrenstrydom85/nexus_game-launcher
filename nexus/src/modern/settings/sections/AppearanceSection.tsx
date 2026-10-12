import { useSettingsStore } from "@/stores/settingsStore";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ThemeMode } from "@/lib/theme";
import { SettingsCard, SettingsRow, ToggleRow } from "../SettingsKit";

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export function AppearanceSection() {
  const s = useSettingsStore();

  return (
    <>
      <SettingsCard title="Look">
        <SettingsRow label="Theme">
          <SegmentedControl aria-label="Theme" value={s.theme} onValueChange={s.setTheme} options={THEMES} />
        </SettingsRow>
        <ToggleRow
          data-testid="pref-transparency"
          label="Window transparency"
          description="Let the desktop show through the window chrome"
          checked={s.windowTransparency}
          onCheckedChange={s.setWindowTransparency}
        />
        <ToggleRow data-testid="pref-animations" label="Animations" checked={s.enableAnimations} onCheckedChange={s.setEnableAnimations} />
        <ToggleRow
          data-testid="pref-reduced-motion"
          label="Reduce motion"
          description="Keep fades, skip movement and zooms"
          checked={s.reducedMotion}
          onCheckedChange={s.setReducedMotion}
          disabled={!s.enableAnimations}
        />
        <ToggleRow
          data-testid="pref-retro-mode"
          label="Retro mode"
          description="The DOS-style launcher. Also one click away in the top bar; press F9 inside to come back."
          checked={s.retroMode}
          onCheckedChange={s.setRetroMode}
        />
        <ToggleRow
          data-testid="pref-layout-v1"
          label="New layout"
          description="Turn off to go back to the classic sidebar layout"
          checked={s.layoutV1}
          onCheckedChange={s.setLayoutV1}
        />
      </SettingsCard>

      <SettingsCard title="Notifications">
        <ToggleRow
          data-testid="pref-enable-notifications"
          label="Desktop notifications"
          description="Native Windows notifications while Nexus runs or sits in the tray"
          checked={s.enableNotifications}
          onCheckedChange={s.setEnableNotifications}
        />
        <ToggleRow
          data-testid="pref-milestone-notifications"
          label="Session milestones"
          checked={s.milestoneNotificationsEnabled}
          onCheckedChange={s.setMilestoneNotificationsEnabled}
          disabled={!s.enableNotifications}
        />
        <ToggleRow
          data-testid="pref-xp-notifications"
          label="XP level-ups"
          checked={s.xpNotificationsEnabled}
          onCheckedChange={s.setXpNotificationsEnabled}
          disabled={!s.enableNotifications}
        />
        <ToggleRow
          data-testid="pref-achievement-notifications"
          label="Achievement unlocks"
          description="Show a card in Nexus when you unlock one"
          checked={s.achievementNotificationsEnabled}
          onCheckedChange={s.setAchievementNotificationsEnabled}
        />
        <ToggleRow
          data-testid="pref-achievement-sounds"
          label="Achievement sounds"
          checked={s.achievementSoundsEnabled}
          onCheckedChange={s.setAchievementSoundsEnabled}
        />
        <ToggleRow
          data-testid="pref-milestone-sounds"
          label="Milestone sounds"
          checked={s.milestoneSoundsEnabled}
          onCheckedChange={s.setMilestoneSoundsEnabled}
        />
      </SettingsCard>

      <SettingsCard title="Window">
        <ToggleRow
          data-testid="pref-ask-before-close"
          label="Ask when closing"
          description="Choose between minimising to the tray and quitting"
          checked={s.askBeforeClose}
          onCheckedChange={s.setAskBeforeClose}
        />
      </SettingsCard>
    </>
  );
}
