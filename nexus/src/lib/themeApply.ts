/**
 * Applies a {@link CustomTheme} to the document by writing inline CSS custom
 * properties on `<html>`, layered over the active `.light` / `.dark` base.
 *
 * Also derives accent-following tokens (ring, glow, sidebar-primary, chart-1,
 * info) and glassmorphism tokens from the theme so they stay consistent, and
 * applies fonts, border radius, and the root font-size scale.
 */
import {
  type CustomTheme,
  type ThemeBase,
  type ThemeFonts,
  COLOR_TOKENS,
  DERIVED_FROM_PRIMARY,
  GLASS_TOKENS,
} from "./themeTypes";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const SANS_FALLBACK = '"Segoe UI", system-ui, -apple-system, sans-serif';
const MONO_FALLBACK = '"Cascadia Code", "Consolas", monospace';
const SYSTEM_SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SYSTEM_MONO = 'ui-monospace, "Cascadia Code", "Consolas", monospace';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/**
 * Parse a CSS color string into RGB. Supports `#rgb`, `#rrggbb`, `rgb()/rgba()`
 * and `hsl()/hsla()` — covering every value the theme tokens use.
 */
export function parseColor(input: string): Rgb | null {
  if (!input) return null;
  const str = input.trim().toLowerCase();

  const hexMatch = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(str);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(str);
  if (rgbMatch) {
    return {
      r: Math.round(parseFloat(rgbMatch[1])),
      g: Math.round(parseFloat(rgbMatch[2])),
      b: Math.round(parseFloat(rgbMatch[3])),
    };
  }

  const hslMatch = /^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(str);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = clamp01(parseFloat(hslMatch[2]) / 100);
    const l = clamp01(parseFloat(hslMatch[3]) / 100);
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hueToRgb(p, q, h) * 255),
      b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    };
  }

  return null;
}

function toHexComponent(v: number): string {
  return Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0");
}

/** Convert any supported CSS color string to `#rrggbb`, or `#000000` on failure. */
export function colorToHex(input: string): string {
  const rgb = parseColor(input);
  if (!rgb) return "#000000";
  return `#${toHexComponent(rgb.r)}${toHexComponent(rgb.g)}${toHexComponent(rgb.b)}`;
}

function rgba({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0;
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick black or white text for best contrast against a background color. */
export function readableForeground(bg: string): string {
  return relativeLuminance(bg) > 0.45 ? "#0a0a0f" : "#fafafa";
}

function applyFonts(fonts: ThemeFonts, root: HTMLElement): void {
  const sans = fonts.sans
    ? `"${fonts.sans}", ${SANS_FALLBACK}`
    : SYSTEM_SANS;
  const mono = fonts.mono
    ? `"${fonts.mono}", ${MONO_FALLBACK}`
    : SYSTEM_MONO;
  root.style.setProperty("--font-sans", sans);
  root.style.setProperty("--font-mono", mono);
}

/**
 * Apply only the accent-derived tokens from a single color. Used both for the
 * full theme application and for the legacy accent-only path (no custom theme).
 */
function applyAccentDerived(primary: string, root: HTMLElement): void {
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-ring", primary);
  root.style.setProperty("--chart-1", primary);
  root.style.setProperty("--info", primary);
  const rgb = parseColor(primary);
  root.style.setProperty(
    "--glow",
    rgb ? rgba(rgb, 0.15) : "hsla(272, 100%, 43%, 0.15)",
  );
}

/** Legacy back-compat: apply just the accent color (when no custom theme is set). */
export function applyAccentOnly(
  accentColor: string,
  root: HTMLElement = document.documentElement,
): void {
  applyAccentDerived(accentColor, root);
}

function applyGlassDerived(colors: Record<string, string>, root: HTMLElement): void {
  const card = parseColor(colors.card);
  const background = parseColor(colors.background);
  const foreground = parseColor(colors.foreground);
  if (card) {
    root.style.setProperty("--glass-sidebar", rgba(card, 0.8));
    root.style.setProperty("--glass-settings", `rgb(${card.r}, ${card.g}, ${card.b})`);
    root.style.setProperty("--glass-toast", rgba(card, 0.9));
    root.style.setProperty("--glass-filter", rgba(card, 0.6));
  }
  if (background) {
    root.style.setProperty("--glass-overlay", rgba(background, 0.9));
  }
  if (foreground) {
    root.style.setProperty("--glass-border", rgba(foreground, 0.08));
  }
}

/**
 * Apply a full custom theme for the given base appearance. Sets every editable
 * token, derives accent/glass tokens, and applies fonts, radius and font scale.
 */
export function applyCustomTheme(
  theme: CustomTheme,
  base: ThemeBase,
  root: HTMLElement = document.documentElement,
): void {
  const colors = theme.colors[base] ?? {};

  for (const token of COLOR_TOKENS) {
    const value = colors[token.key];
    if (value) root.style.setProperty(`--${token.key}`, value);
  }

  if (colors.primary) applyAccentDerived(colors.primary, root);
  applyGlassDerived(colors, root);
  applyFonts(theme.fonts, root);

  root.style.setProperty("--radius", `${theme.radius}rem`);
  root.style.fontSize = `${Math.round(theme.fontScale * 1000) / 10}%`;
}

/**
 * Remove every inline override applied by {@link applyCustomTheme} /
 * {@link applyAccentOnly}, restoring the stock CSS-defined tokens.
 */
export function clearCustomTheme(root: HTMLElement = document.documentElement): void {
  for (const token of COLOR_TOKENS) {
    root.style.removeProperty(`--${token.key}`);
  }
  for (const key of DERIVED_FROM_PRIMARY) {
    root.style.removeProperty(`--${key}`);
  }
  for (const key of GLASS_TOKENS) {
    root.style.removeProperty(`--${key}`);
  }
  root.style.removeProperty("--font-sans");
  root.style.removeProperty("--font-mono");
  root.style.removeProperty("--radius");
  root.style.fontSize = "";
}
