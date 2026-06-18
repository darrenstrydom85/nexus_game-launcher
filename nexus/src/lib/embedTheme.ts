import { setTwitchEmbedTheme, type TwitchEmbedTheme } from "@/lib/tauri";

/**
 * Resolved theme tokens handed to the Rust embed server so the spawned Twitch
 * windows (stream pop-out, clip player) mirror the user's selected app theme.
 *
 * Keys are camelCase to match the Rust `EmbedTheme` struct
 * (`#[serde(rename_all = "camelCase")]`). Values are raw CSS color strings
 * (hex / `hsl(...)` / `oklch(...)`) read from the live computed CSS variables.
 */
export type EmbedThemeTokens = TwitchEmbedTheme;

/**
 * Maps an embed token to the app CSS variable it should mirror. The embed
 * windows are a separate document with no access to the app's `<html>`
 * variables, so we read the *computed* values and forward them to Rust.
 */
const TOKEN_TO_VAR: Record<keyof EmbedThemeTokens, string> = {
  bg: "--background",
  panel: "--card",
  border: "--border",
  fg: "--foreground",
  muted: "--muted-foreground",
  accent: "--primary",
  danger: "--destructive",
};

/** Read the current resolved theme tokens off `document.documentElement`. */
export function readEmbedThemeTokens(): EmbedThemeTokens | null {
  if (typeof document === "undefined") return null;
  const styles = getComputedStyle(document.documentElement);
  const read = (cssVar: string) => styles.getPropertyValue(cssVar).trim();

  const tokens = {} as EmbedThemeTokens;
  for (const key of Object.keys(TOKEN_TO_VAR) as (keyof EmbedThemeTokens)[]) {
    tokens[key] = read(TOKEN_TO_VAR[key]);
  }
  // If the core tokens are empty (styles not yet applied), skip the push.
  if (!tokens.bg || !tokens.fg) return null;
  return tokens;
}

/**
 * Push the current resolved theme to the backend so future Twitch pop-out /
 * clip windows render with matching colors. Reads on the next animation frame
 * so any inline custom-theme variables are committed first. Failures are
 * swallowed — theming the embed windows is best-effort and must never break
 * the app (e.g. if the Twitch feature isn't compiled in).
 */
export function pushEmbedTheme(): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const tokens = readEmbedThemeTokens();
    if (!tokens) return;
    setTwitchEmbedTheme(tokens).catch(() => {
      /* best-effort: ignore (command may be unavailable) */
    });
  });
}
