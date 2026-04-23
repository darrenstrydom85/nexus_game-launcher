import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const globalsCSS = readFileSync(
  resolve(__dirname, "../globals.css"),
  "utf-8",
);

describe("Story 5.1: Obsidian Theme Color Tokens", () => {
  const requiredTokens = [
    "--background",
    "--foreground",
    "--card",
    "--primary",
    "--secondary",
    "--muted",
    "--accent",
    "--destructive",
    "--border",
    "--ring",
    "--glow",
  ];

  it.each(requiredTokens)(
    "defines CSS custom property %s in :root",
    (token) => {
      const pattern = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
      expect(globalsCSS).toMatch(pattern);
    },
  );

  it("maps all tokens to Tailwind via @theme inline", () => {
    expect(globalsCSS).toContain("@theme inline");
    expect(globalsCSS).toContain("--color-background: var(--background)");
    expect(globalsCSS).toContain("--color-glow: var(--glow)");
  });

  it("defines Geist Sans and Geist Mono font families", () => {
    expect(globalsCSS).toContain('"Geist Sans"');
    expect(globalsCSS).toContain('"Geist Mono"');
    expect(globalsCSS).toContain("--font-sans:");
    expect(globalsCSS).toContain("--font-mono:");
  });

  it("defines typography scale for headings", () => {
    expect(globalsCSS).toMatch(/h1\s*\{/);
    expect(globalsCSS).toMatch(/h2\s*\{/);
    expect(globalsCSS).toMatch(/h3\s*\{/);
    expect(globalsCSS).toMatch(/h4\s*\{/);
  });

  it("sets code elements to monospace font", () => {
    expect(globalsCSS).toMatch(/code.*\{[\s\S]*?font-family:\s*var\(--font-mono\)/);
  });

  it("defines light theme tokens on :root and dark tokens on .dark", () => {
    expect(globalsCSS).toMatch(/:root\s*\{[\s\S]*?--background\s*:/);
    expect(globalsCSS).toMatch(/:root\s*\{[\s\S]*?--foreground\s*:/);
    expect(globalsCSS).toMatch(/\.dark\s*\{[\s\S]*?--background\s*:/);
    expect(globalsCSS).toMatch(/\.dark\s*\{[\s\S]*?--foreground\s*:/);
  });

  it("defines --glass-* variables on :root and .dark for theme-scoped glassmorphism", () => {
    const rootBlock = globalsCSS.match(/:root\s*\{([\s\S]*?)\n\}/);
    const darkBlock = globalsCSS.match(/\.dark\s*\{([\s\S]*?)\n\}/);
    expect(rootBlock).not.toBeNull();
    expect(darkBlock).not.toBeNull();
    const rootBody = rootBlock![1];
    const darkBody = darkBlock![1];
    for (const key of [
      "--glass-sidebar",
      "--glass-overlay",
      "--glass-settings",
      "--glass-toast",
      "--glass-filter",
      "--glass-border",
    ]) {
      expect(rootBody).toContain(`${key}:`);
      expect(darkBody).toContain(`${key}:`);
    }
  });

  it("defines glassmorphism color tokens", () => {
    expect(globalsCSS).toContain("--color-glass-sidebar");
    expect(globalsCSS).toContain("--color-glass-overlay");
    expect(globalsCSS).toContain("--color-glass-settings");
    expect(globalsCSS).toContain("--color-glass-toast");
    expect(globalsCSS).toContain("--color-glass-filter");
    expect(globalsCSS).toContain("--color-glass-border");
  });

  it("defines glassmorphism CSS utility classes", () => {
    expect(globalsCSS).toContain(".glass-sidebar");
    expect(globalsCSS).toContain(".glass-overlay");
    expect(globalsCSS).toContain(".glass-settings");
    expect(globalsCSS).toContain(".glass-toast");
    expect(globalsCSS).toContain(".glass-filter");
  });

  it("defines success/warning/info semantic tokens", () => {
    expect(globalsCSS).toContain("--success:");
    expect(globalsCSS).toContain("--warning:");
    expect(globalsCSS).toContain("--info:");
  });
});
