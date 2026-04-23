import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore, type ViewMode, type SortField } from "@/stores/uiStore";
import { applyThemeClassToDocument, resolveEffectiveTheme } from "@/lib/theme";

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

/**
 * Subscribes to settingsStore and applies visual/UI preferences to the DOM
 * and syncs defaults into uiStore. Runs reactively on every change.
 */
export function useSettingsApplier() {
  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const windowTransparency = useSettingsStore((s) => s.windowTransparency);
  const defaultView = useSettingsStore((s) => s.defaultView);
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const _hydrated = useSettingsStore((s) => s._hydrated);

  // Light / Dark / System → html.light or html.dark
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const effective = resolveEffectiveTheme(theme, media.matches);
      applyThemeClassToDocument(effective);
    };
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  // Apply accent color as CSS custom property
  useEffect(() => {
    const hsl = hexToHsl(accentColor);
    if (!hsl) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", `hsl(${hsl})`);
    root.style.setProperty("--ring", `hsl(${hsl})`);
    root.style.setProperty("--glow", `hsla(${hsl}, 0.15)`);
    root.style.setProperty("--sidebar-primary", `hsl(${hsl})`);
    root.style.setProperty("--sidebar-ring", `hsl(${hsl})`);
    root.style.setProperty("--chart-1", `hsl(${hsl})`);
    root.style.setProperty("--info", `hsl(${hsl})`);
  }, [accentColor]);

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
