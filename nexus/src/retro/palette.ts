/**
 * Derives a DOS-style color scheme from the app's accent color, so the
 * modern theme "follows through" into retro mode. Single-hue scheme:
 * classic VGA blue/cyan slots are re-hued to the accent (think green
 * phosphor / amber terminal variants), while black, white, grays and the
 * status colors stay fixed VGA.
 */

export interface RetroPalette {
  /** Screen background (replaces VGA blue #0000AA). */
  screen: string;
  /** Bars, popups, selection (replaces VGA cyan #00AAAA). */
  bar: string;
  /** Labels, borders (replaces bright cyan #55FFFF). */
  bright: string;
}

/** #RGB or #RRGGBB to {h,s,l} (0-360, 0-100, 0-100). Null on garbage. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let raw = m[1];
  if (raw.length === 3) raw = raw.split("").map((c) => c + c).join("");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export interface RetroThemeDef {
  id: string;
  label: string;
  /** Hex accent for the scheme, "app" to mirror the modern accent color, null for stock VGA. */
  accent: string | "app" | null;
}

/** Retro theme presets, independent of the modern UI theme. Hotkeys A-I in the F2 picker. */
export const RETRO_THEMES: RetroThemeDef[] = [
  { id: "classic", label: "CLASSIC VGA", accent: null },
  { id: "app", label: "APP THEME", accent: "app" },
  { id: "green", label: "GREEN PHOSPHOR", accent: "#00aa00" },
  { id: "amber", label: "AMBER CRT", accent: "#ffaa00" },
  { id: "ice", label: "ICE", accent: "#00aaaa" },
  { id: "plasma", label: "PLASMA", accent: "#aa00aa" },
  { id: "redalert", label: "RED ALERT", accent: "#aa0000" },
  { id: "violet", label: "VIOLET", accent: "#7600da" },
  { id: "mono", label: "MONO GRAY", accent: "#999999" },
];

export function retroThemeById(id: string): RetroThemeDef {
  return RETRO_THEMES.find((t) => t.id === id) ?? RETRO_THEMES[0];
}

export function retroPalette(accentHex: string): RetroPalette | null {
  const hsl = hexToHsl(accentHex);
  if (!hsl) return null;
  const { h, s } = hsl;
  // Grayish accents stay gray; colored accents get full DOS punch.
  const sat = s < 20 ? s : Math.max(80, s);
  return {
    screen: `hsl(${h}, ${sat}%, 30%)`,
    bar: `hsl(${h}, ${sat}%, 38%)`,
    bright: `hsl(${h}, ${sat}%, 72%)`,
  };
}
