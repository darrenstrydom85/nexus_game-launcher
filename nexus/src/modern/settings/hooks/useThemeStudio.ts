import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useSettingsStore } from "@/stores/settingsStore";
import { resolveEffectiveTheme } from "@/lib/theme";
import { contrastRatio } from "@/lib/themeApply";
import { type CustomTheme, type ThemeBase, cloneTheme, makeDefaultTheme } from "@/lib/themeTypes";
import { randomTheme } from "@/lib/themePresets";
import { parseThemeJson, serializeTheme } from "@/lib/themeSchema";
import { snapThemeChange } from "./snapTheme";

export type ThemeStudioStatus = { kind: "ok" | "err"; msg: string } | null;

/** With no custom theme Nexus shows the stock look, which is the Obsidian preset. */
const STOCK_PRESET = "Obsidian";

/** Readability target for body text on the background (WCAG AA). */
const MIN_CONTRAST = 4.5;

/** Quick accent picks, in swatch order. */
export const ACCENT_SWATCHES = [
  { hex: "#7600da", name: "Nexus purple" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#a855f7", name: "Violet" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#f97316", name: "Orange" },
] as const;

export function slugifyThemeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
}

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Everything the Theme Studio edits: presets, colours per light/dark base,
 * fonts, text size, corner radius, and theme files. Colour changes snap
 * instead of crossfading.
 */
export function useThemeStudio() {
  const customTheme = useSettingsStore((s) => s.customTheme);
  const setCustomTheme = useSettingsStore((s) => s.setCustomTheme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const themeMode = useSettingsStore((s) => s.theme);

  const [systemFonts, setSystemFonts] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<"import" | "export" | null>(null);
  const [status, setStatus] = React.useState<ThemeStudioStatus>(null);

  // Colours are edited for the palette on screen, which follows the appearance.
  const [base, setBase] = React.useState<ThemeBase>(() => resolveEffectiveTheme(themeMode, prefersDark()));
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setBase(resolveEffectiveTheme(themeMode, media.matches));
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themeMode]);

  React.useEffect(() => {
    let cancelled = false;
    invoke<string[]>("list_system_fonts")
      .then((fonts) => {
        if (!cancelled && Array.isArray(fonts)) setSystemFonts(fonts);
      })
      .catch(() => {
        /* font detection unavailable; bundled fonts still work */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The theme being edited. Without a custom theme, start from the stock look
  // but keep the saved accent so the pickers match what is on screen.
  const working: CustomTheme = React.useMemo(() => {
    if (customTheme) return customTheme;
    const seeded = makeDefaultTheme();
    seeded.colors.dark.primary = accentColor;
    seeded.colors.light.primary = accentColor;
    return seeded;
  }, [customTheme, accentColor]);

  const colors = working.colors[base];

  const commit = (next: CustomTheme | null) => snapThemeChange(() => setCustomTheme(next));

  const patchColor = (key: string, hex: string) => {
    const next = cloneTheme(working);
    next.colors[base][key] = hex;
    commit(next);
  };

  const patchFont = (kind: "sans" | "mono", value: string) => {
    const next = cloneTheme(working);
    next.fonts[kind] = value;
    setCustomTheme(next);
  };

  const patchRadius = (radius: number) => {
    const next = cloneTheme(working);
    next.radius = radius;
    setCustomTheme(next);
  };

  const patchScale = (fontScale: number) => {
    const next = cloneTheme(working);
    next.fontScale = fontScale;
    setCustomTheme(next);
  };

  /** Loads a preset's palette. Fonts, text size and corner radius stay the user's. */
  const applyPreset = (preset: CustomTheme) => {
    setStatus(null);
    const next = cloneTheme(preset);
    next.fonts = { ...working.fonts };
    next.fontScale = working.fontScale;
    next.radius = working.radius;
    commit(next);
  };

  const applyRandom = () => applyPreset(randomTheme());

  const reset = () => {
    setStatus(null);
    commit(null);
  };

  const exportTheme = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const theme = customTheme ?? working;
      const destPath = await save({
        defaultPath: `${slugifyThemeName(theme.name)}.nexustheme.json`,
        filters: [{ name: "Nexus Theme", extensions: ["json"] }],
      });
      if (!destPath) return;
      await writeTextFile(destPath, serializeTheme(theme));
      setStatus({ kind: "ok", msg: "Theme exported." });
    } catch {
      setStatus({ kind: "err", msg: "Couldn’t export the theme. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const importTheme = async () => {
    setBusy("import");
    setStatus(null);
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "Nexus Theme", extensions: ["json"] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      const content = await readTextFile(path as string);
      const theme = parseThemeJson(content);
      commit(theme);
      setStatus({ kind: "ok", msg: `Imported “${theme.name}”.` });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setBusy(null);
    }
  };

  const contrast = contrastRatio(colors.foreground, colors.background);

  return {
    base,
    working,
    colors,
    customTheme,
    systemFonts,
    busy,
    status,
    /** Name of the preset the current theme came from (the stock look is Obsidian). */
    activePreset: customTheme ? customTheme.name : STOCK_PRESET,
    contrast,
    lowContrast: contrast < MIN_CONTRAST,
    patchColor,
    patchFont,
    patchRadius,
    patchScale,
    applyPreset,
    applyRandom,
    reset,
    exportTheme,
    importTheme,
  };
}
