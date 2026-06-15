import { describe, it, expect } from "vitest";
import {
  ThemeParseError,
  parseTheme,
  parseThemeJson,
  serializeTheme,
} from "@/lib/themeSchema";
import {
  DEFAULT_COLORS,
  DEFAULT_RADIUS,
  FONT_SCALE_MAX,
  RADIUS_MAX,
  makeDefaultTheme,
} from "@/lib/themeTypes";
import { THEME_PRESETS, randomTheme } from "@/lib/themePresets";
import { COLOR_TOKENS } from "@/lib/themeTypes";
import { parseColor } from "@/lib/themeApply";

describe("parseTheme", () => {
  it("throws on non-object input", () => {
    expect(() => parseTheme(null)).toThrow(ThemeParseError);
    expect(() => parseTheme("nope")).toThrow(ThemeParseError);
  });

  it("fills missing tokens from defaults", () => {
    const theme = parseTheme({ name: "Partial", colors: { dark: { primary: "#123456" } } });
    expect(theme.colors.dark.primary).toBe("#123456");
    // Untouched token falls back to the stock default.
    expect(theme.colors.dark.background).toBe(DEFAULT_COLORS.dark.background);
    // Light base fully defaulted.
    expect(theme.colors.light.background).toBe(DEFAULT_COLORS.light.background);
  });

  it("drops invalid colors", () => {
    const theme = parseTheme({ colors: { dark: { primary: "not-a-color" } } });
    expect(theme.colors.dark.primary).toBe(DEFAULT_COLORS.dark.primary);
  });

  it("clamps radius and fontScale to range", () => {
    const tooBig = parseTheme({ radius: 99, fontScale: 99 });
    expect(tooBig.radius).toBe(RADIUS_MAX);
    expect(tooBig.fontScale).toBe(FONT_SCALE_MAX);

    const invalid = parseTheme({ radius: "abc" });
    expect(invalid.radius).toBe(DEFAULT_RADIUS);
  });

  it("coerces fonts and name", () => {
    const theme = parseTheme({ name: 123, fonts: { sans: "Inter", mono: 5 } });
    expect(theme.name).toBe("Imported Theme");
    expect(theme.fonts.sans).toBe("Inter");
    expect(theme.fonts.mono).toBe("Geist Mono");
  });
});

describe("parseThemeJson", () => {
  it("throws ThemeParseError on invalid JSON", () => {
    expect(() => parseThemeJson("{ not json")).toThrow(ThemeParseError);
  });
});

describe("export/import round-trip", () => {
  it("serializes and re-parses to an equivalent theme", () => {
    const original = makeDefaultTheme("My Theme");
    original.colors.dark.primary = "#abcdef";
    original.fonts.sans = "Inter";
    original.radius = 0.9;
    original.fontScale = 1.15;

    const restored = parseThemeJson(serializeTheme(original));
    expect(restored).toEqual(original);
  });

  it("round-trips every built-in preset losslessly", () => {
    for (const preset of THEME_PRESETS) {
      const restored = parseThemeJson(serializeTheme(preset));
      expect(restored).toEqual(preset);
    }
  });
});

describe("randomTheme", () => {
  it("produces a theme with valid colors for every token in both bases", () => {
    for (let i = 0; i < 20; i++) {
      const theme = randomTheme();
      expect(theme.name).toBe("Random");
      for (const base of ["light", "dark"] as const) {
        for (const token of COLOR_TOKENS) {
          expect(parseColor(theme.colors[base][token.key])).not.toBeNull();
        }
      }
      // Survives the import validator unchanged.
      expect(parseThemeJson(serializeTheme(theme))).toEqual(theme);
    }
  });
});
