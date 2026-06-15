/**
 * Validation + (de)serialization for shareable theme files.
 *
 * Imported JSON is untrusted, so {@link parseTheme} normalizes it into a safe
 * {@link CustomTheme}: it fills missing tokens from the defaults, drops invalid
 * colors, clamps numeric ranges, and coerces fonts to strings. This means a
 * partial or slightly-malformed file still imports cleanly rather than failing.
 */
import {
  type CustomTheme,
  type ThemeColors,
  type ThemeFonts,
  COLOR_TOKENS,
  DEFAULT_COLORS,
  DEFAULT_FONTS,
  DEFAULT_FONT_SCALE,
  DEFAULT_RADIUS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  RADIUS_MAX,
  RADIUS_MIN,
  THEME_SCHEMA_VERSION,
} from "./themeTypes";
import { parseColor } from "./themeApply";

export class ThemeParseError extends Error {}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function coerceColors(raw: unknown, base: "light" | "dark"): ThemeColors {
  const out: ThemeColors = { ...DEFAULT_COLORS[base] };
  if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    for (const token of COLOR_TOKENS) {
      const candidate = source[token.key];
      if (typeof candidate === "string" && parseColor(candidate)) {
        out[token.key] = candidate.trim();
      }
    }
  }
  return out;
}

function coerceFonts(raw: unknown): ThemeFonts {
  if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    return {
      sans: typeof source.sans === "string" ? source.sans.slice(0, 80) : DEFAULT_FONTS.sans,
      mono: typeof source.mono === "string" ? source.mono.slice(0, 80) : DEFAULT_FONTS.mono,
    };
  }
  return { ...DEFAULT_FONTS };
}

function coerceName(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, 80);
  return fallback;
}

/**
 * Validate and normalize an arbitrary value into a {@link CustomTheme}.
 * Throws {@link ThemeParseError} only when the input is structurally unusable
 * (not an object); otherwise it repairs what it can.
 */
export function parseTheme(input: unknown, fallbackName = "Imported Theme"): CustomTheme {
  if (!input || typeof input !== "object") {
    throw new ThemeParseError("Theme data must be an object.");
  }
  const obj = input as Record<string, unknown>;
  const colorsRaw = (obj.colors ?? {}) as Record<string, unknown>;

  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    name: coerceName(obj.name, fallbackName),
    author: typeof obj.author === "string" ? obj.author.slice(0, 80) : undefined,
    colors: {
      light: coerceColors(colorsRaw.light, "light"),
      dark: coerceColors(colorsRaw.dark, "dark"),
    },
    fonts: coerceFonts(obj.fonts),
    radius: clampNumber(obj.radius, RADIUS_MIN, RADIUS_MAX, DEFAULT_RADIUS),
    fontScale: clampNumber(obj.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX, DEFAULT_FONT_SCALE),
  };
}

/** Parse a raw JSON string into a normalized theme. */
export function parseThemeJson(json: string, fallbackName = "Imported Theme"): CustomTheme {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ThemeParseError("File is not valid JSON.");
  }
  return parseTheme(data, fallbackName);
}

/** Serialize a theme to a pretty-printed JSON string for export. */
export function serializeTheme(theme: CustomTheme): string {
  return JSON.stringify(theme, null, 2);
}
