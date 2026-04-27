import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ThemeMode } from "@/lib/theme";

const ACCENT_COLORS = ["#7600da", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

export function AppearanceSettings() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const transparency = useSettingsStore((s) => s.windowTransparency);
  const setTransparency = useSettingsStore((s) => s.setWindowTransparency);
  const askBeforeClose = useSettingsStore((s) => s.askBeforeClose);
  const setAskBeforeClose = useSettingsStore((s) => s.setAskBeforeClose);
  const animations = useSettingsStore((s) => s.enableAnimations);
  const setAnimations = useSettingsStore((s) => s.setEnableAnimations);
  const notifications = useSettingsStore((s) => s.enableNotifications);
  const setNotifications = useSettingsStore((s) => s.setEnableNotifications);
  const xpNotifications = useSettingsStore((s) => s.xpNotificationsEnabled);
  const setXpNotifications = useSettingsStore((s) => s.setXpNotificationsEnabled);
  const milestoneNotifications = useSettingsStore((s) => s.milestoneNotificationsEnabled);
  const setMilestoneNotifications = useSettingsStore((s) => s.setMilestoneNotificationsEnabled);

  return (
    <section data-testid="appearance-settings">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Appearance</h3>
      <div className="flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-sm text-foreground">Theme</span>
          <div
            data-testid="theme-switcher"
            className="flex rounded-lg border border-border bg-muted/30 p-0.5"
            role="group"
            aria-label="Appearance theme"
          >
            {THEME_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                data-testid={`theme-${mode}`}
                onClick={() => setTheme(mode)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  theme === mode
                    ? "bg-secondary text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Accent color */}
        <div>
          <span className="mb-1 block text-sm text-foreground">Accent Color</span>
          <div data-testid="accent-color-picker" className="flex gap-2">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color}
                data-testid={`accent-${color}`}
                className={cn(
                  "size-7 rounded-full border-2 transition-all",
                  accentColor === color ? "border-foreground scale-110" : "border-transparent",
                )}
                style={{ background: color }}
                onClick={() => setAccentColor(color)}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between">
          <span className="text-sm text-foreground">Ask when closing</span>
          <input
            data-testid="pref-ask-before-close"
            type="checkbox"
            checked={askBeforeClose}
            onChange={() => setAskBeforeClose(!askBeforeClose)}
            className="size-4 rounded border-border"
            aria-describedby="ask-before-close-desc"
          />
        </label>
        <p id="ask-before-close-desc" className="text-xs text-muted-foreground">
          When on, closing the window (X or Alt+F4) shows a dialog to close the app, minimize to the system tray, or cancel and stay open.
        </p>

        <label className="flex items-center justify-between">
          <span className="text-sm text-foreground">Window Transparency</span>
          <input
            data-testid="pref-transparency"
            type="checkbox"
            checked={transparency}
            onChange={() => setTransparency(!transparency)}
            className="size-4 rounded border-border"
          />
        </label>

        <label className="flex items-center justify-between">
          <span className="text-sm text-foreground">Animations</span>
          <input
            data-testid="pref-animations"
            type="checkbox"
            checked={animations}
            onChange={() => setAnimations(!animations)}
            className="size-4 rounded border-border"
          />
        </label>

        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <label className="flex items-center justify-between">
            <span className="text-sm text-foreground">Desktop notifications</span>
            <input
              data-testid="pref-enable-notifications"
              type="checkbox"
              checked={notifications}
              onChange={() => setNotifications(!notifications)}
              className="size-4 rounded border-border"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Show native Windows notifications while Nexus is running or minimized to tray.
          </p>
          {notifications && (
            <div className="flex flex-col gap-2 border-l border-border pl-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-foreground">XP level-ups</span>
                <input
                  data-testid="pref-xp-notifications"
                  type="checkbox"
                  checked={xpNotifications}
                  onChange={() => setXpNotifications(!xpNotifications)}
                  className="size-4 rounded border-border"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-foreground">Session milestones</span>
                <input
                  data-testid="pref-milestone-notifications"
                  type="checkbox"
                  checked={milestoneNotifications}
                  onChange={() => setMilestoneNotifications(!milestoneNotifications)}
                  className="size-4 rounded border-border"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
