import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore, type ViewMode, type SortField } from "@/stores/uiStore";
import { applyThemeClassToDocument, resolveEffectiveTheme } from "@/lib/theme";
import { applyAccentOnly, applyCustomTheme, clearCustomTheme } from "@/lib/themeApply";

/**
 * Subscribes to settingsStore and applies visual/UI preferences to the DOM
 * and syncs defaults into uiStore. Runs reactively on every change.
 */
export function useSettingsApplier() {
  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const customTheme = useSettingsStore((s) => s.customTheme);
  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const windowTransparency = useSettingsStore((s) => s.windowTransparency);
  const defaultView = useSettingsStore((s) => s.defaultView);
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const _hydrated = useSettingsStore((s) => s._hydrated);

  // Appearance base (.light / .dark) + full custom theme (or accent fallback).
  // Combined into one effect because the custom theme's color set is keyed by
  // the resolved base, so both must update together (incl. on system changes).
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const effective = resolveEffectiveTheme(theme, media.matches);
      applyThemeClassToDocument(effective);
      if (customTheme) {
        applyCustomTheme(customTheme, effective);
      } else {
        clearCustomTheme();
        applyAccentOnly(accentColor);
      }
    };
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, customTheme, accentColor]);

  // Apply animation preference
  useEffect(() => {
    if (enableAnimations) {
      document.documentElement.classList.remove("no-animations");
    } else {
      document.documentElement.classList.add("no-animations");
    }
  }, [enableAnimations]);

  // Apply transparency preference
  useEffect(() => {
    if (windowTransparency) {
      document.documentElement.classList.remove("no-transparency");
    } else {
      document.documentElement.classList.add("no-transparency");
    }
  }, [windowTransparency]);

  // Sync default view & sort into uiStore once on first hydration only
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (!_hydrated || defaultsApplied.current) return;
    defaultsApplied.current = true;
    if (defaultView) {
      useUiStore.getState().setViewMode(defaultView as ViewMode);
    }
    if (defaultSort) {
      useUiStore.getState().setSortField(defaultSort as SortField);
    }
  }, [_hydrated, defaultView, defaultSort]);
}
