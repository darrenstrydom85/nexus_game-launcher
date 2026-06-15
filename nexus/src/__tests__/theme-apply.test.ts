import { describe, it, expect, beforeEach } from "vitest";
import {
  applyAccentOnly,
  applyCustomTheme,
  clearCustomTheme,
  colorToHex,
  contrastRatio,
  parseColor,
  readableForeground,
  relativeLuminance,
} from "@/lib/themeApply";
import { COLOR_TOKENS, GLASS_TOKENS, makeDefaultTheme } from "@/lib/themeTypes";

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseColor("#3b82f6")).toEqual({ r: 59, g: 130, b: 246 });
  });

  it("parses 3-digit hex", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("parses rgb() and rgba()", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("parses hsl() (achromatic and chromatic)", () => {
    expect(parseColor("hsl(0, 0%, 100%)")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("hsl(0, 0%, 0%)")).toEqual({ r: 0, g: 0, b: 0 });
    const red = parseColor("hsl(0, 100%, 50%)");
    expect(red).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("returns null for garbage", () => {
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("colorToHex", () => {
  it("normalizes hsl to hex", () => {
    expect(colorToHex("hsl(0, 0%, 100%)")).toBe("#ffffff");
    expect(colorToHex("hsl(0, 0%, 0%)")).toBe("#000000");
  });

  it("passes through hex", () => {
    expect(colorToHex("#3B82F6")).toBe("#3b82f6");
  });

  it("falls back to black on invalid input", () => {
    expect(colorToHex("bogus")).toBe("#000000");
  });
});

describe("contrast helpers", () => {
  it("computes luminance extremes", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("white-on-black has maximum contrast", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("picks a readable foreground", () => {
    expect(readableForeground("#ffffff")).toBe("#0a0a0f");
    expect(readableForeground("#000000")).toBe("#fafafa");
  });
});

describe("applyCustomTheme / clearCustomTheme", () => {
  const root = document.documentElement;

  beforeEach(() => {
    root.removeAttribute("style");
  });

  it("writes every editable token plus derived + glass + font + radius vars", () => {
    const theme = makeDefaultTheme();
    theme.colors.dark.primary = "#3b82f6";
    theme.radius = 1;
    theme.fontScale = 1.1;
    theme.fonts.sans = "Inter";
    theme.fonts.mono = "";

    applyCustomTheme(theme, "dark", root);

    for (const token of COLOR_TOKENS) {
      expect(root.style.getPropertyValue(`--${token.key}`)).not.toBe("");
    }
    // Accent-derived tokens follow primary.
    expect(root.style.getPropertyValue("--ring")).toBe("#3b82f6");
    expect(root.style.getPropertyValue("--info")).toBe("#3b82f6");
    expect(root.style.getPropertyValue("--glow")).toContain("rgba(59, 130, 246");
    // Glass derived.
    for (const key of GLASS_TOKENS) {
      expect(root.style.getPropertyValue(`--${key}`)).not.toBe("");
    }
    // Fonts: named family quoted; empty falls back to system stack.
    expect(root.style.getPropertyValue("--font-sans")).toContain('"Inter"');
    expect(root.style.getPropertyValue("--font-mono")).toContain("ui-monospace");
    expect(root.style.getPropertyValue("--radius")).toBe("1rem");
    expect(root.style.fontSize).toBe("110%");
  });

  it("clears all overrides it set", () => {
    const theme = makeDefaultTheme();
    applyCustomTheme(theme, "dark", root);
    clearCustomTheme(root);

    for (const token of COLOR_TOKENS) {
      expect(root.style.getPropertyValue(`--${token.key}`)).toBe("");
    }
    for (const key of GLASS_TOKENS) {
      expect(root.style.getPropertyValue(`--${key}`)).toBe("");
    }
    expect(root.style.getPropertyValue("--radius")).toBe("");
    expect(root.style.getPropertyValue("--font-sans")).toBe("");
    expect(root.style.fontSize).toBe("");
  });

  it("applyAccentOnly only sets accent-derived tokens", () => {
    applyAccentOnly("#ef4444", root);
    expect(root.style.getPropertyValue("--primary")).toBe("#ef4444");
    expect(root.style.getPropertyValue("--ring")).toBe("#ef4444");
    expect(root.style.getPropertyValue("--background")).toBe("");
  });
});
