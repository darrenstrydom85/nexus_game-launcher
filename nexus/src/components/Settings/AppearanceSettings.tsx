import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";

const ACCENT_COLORS = ["#7600da", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];

export function AppearanceSettings() {
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const transparency = useSettingsStore((s) => s.windowTransparency);
  const setTransparency = useSettingsStore((s) => s.setWindowTransparency);
  const askBeforeClose = useSettingsStore((s) => s.askBeforeClose);
  const setAskBeforeClose = useSettingsStore((s) => s.setAskBeforeClose);
  const animations = useSettingsStore((s) => s.enableAnimations);
  const setAnimations = useSettingsStore((s) => s.setEnableAnimations);

  return (
    <section data-testid="appearance-settings">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Appearance</h3>
      <div className="flex flex-col gap-3">
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
          When on, closing the window (X or Alt+F4) shows a dialog to close the app or minimize to the system tray.
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
      </div>
    </section>
  );
}
