import { applyAccentOnly, applyCustomTheme } from "./themeApply";
import { parseTheme } from "./themeSchema";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveEffectiveTheme(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

/** Sets exactly one of `light` or `dark` on the root element for token resolution. */
export function applyThemeClassToDocument(
  effective: "light" | "dark",
  root: HTMLElement = document.documentElement,
): void {
  root.classList.remove("light", "dark");
  root.classList.add(effective);
}

const STORAGE_KEY = "nexus-settings";

/** Read persisted theme from Zustand persist JSON before React mounts (FOUC avoidance). */
export function readPersistedThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "dark";
    const parsed = JSON.parse(raw) as { state?: { theme?: string } };
    const t = parsed?.state?.theme;
    if (isThemeMode(t)) return t;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyPersistedThemeClassSync(): void {
  const mode = readPersistedThemeMode();
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effective = resolveEffectiveTheme(mode, prefersDark);
  applyThemeClassToDocument(effective);
}

/**
 * Apply the persisted appearance class AND any custom theme / accent before
 * React mounts, so the first paint already reflects the user's theme (no flash
 * of the default Obsidian palette). Imported lazily-safe: reads the same Zustand
 * persist blob as the store.
 */
export function applyPersistedCustomThemeSync(): void {
  const mode = readPersistedThemeMode();
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effective = resolveEffectiveTheme(mode, prefersDark);
  applyThemeClassToDocument(effective);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      state?: { customTheme?: unknown; accentColor?: string };
    };
    const state = parsed?.state;
    if (!state) return;
    if (state.customTheme) {
      applyCustomTheme(parseTheme(state.customTheme), effective);
    } else if (state.accentColor) {
      applyAccentOnly(state.accentColor);
    }
  } catch {
    /* ignore — fall back to CSS defaults */
  }
}
