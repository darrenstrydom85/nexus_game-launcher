/**
 * Custom theme model + token metadata for the Theme Studio.
 *
 * The launcher styles everything via CSS custom properties declared in
 * `globals.css` (see the `:root` / `.dark` blocks). A custom theme is simply a
 * set of overrides for those variables, layered on top of the active
 * `.light` / `.dark` base by writing inline styles on `<html>`. Because every
 * Tailwind utility reads `var(--token)`, overriding the variables restyles the
 * whole app live with no component changes.
 *
 * Colors are stored as CSS color strings (the defaults below mirror the exact
 * `hsl(...)` values from globals.css so the stock look is preserved byte-for-byte;
 * once a user edits a token it becomes a `#rrggbb` hex string from the picker).
 */

export type ThemeBase = "light" | "dark";

export const THEME_SCHEMA_VERSION = 1 as const;

export const DEFAULT_RADIUS = 0.625;
export const RADIUS_MIN = 0;
export const RADIUS_MAX = 1.5;

export const DEFAULT_FONT_SCALE = 1;
export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.2;

export type ColorGroup = "curated" | "advanced";

export interface ColorTokenMeta {
  /** CSS custom property name without the leading `--`. Also the key in `CustomTheme.colors`. */
  key: string;
  label: string;
  group: ColorGroup;
  /** Section header used to group tokens in the advanced editor. */
  section: string;
}

/**
 * Editable color tokens. Derived tokens (ring, glow, sidebar-primary,
 * sidebar-ring, chart-1, info) are intentionally excluded: they follow the
 * accent (`primary`) automatically in {@link applyCustomTheme}. Glass tokens are
 * also derived from card/background so glassmorphism tracks the theme.
 */
export const COLOR_TOKENS: ColorTokenMeta[] = [
  // ── Curated (the meaningful handful) ──
  { key: "primary", label: "Accent", group: "curated", section: "Core" },
  { key: "background", label: "Background", group: "curated", section: "Core" },
  { key: "card", label: "Surface / Card", group: "curated", section: "Core" },
  { key: "foreground", label: "Text", group: "curated", section: "Core" },
  { key: "muted-foreground", label: "Muted text", group: "curated", section: "Core" },
  { key: "border", label: "Border", group: "curated", section: "Core" },
  { key: "success", label: "Success", group: "curated", section: "Status" },
  { key: "warning", label: "Warning", group: "curated", section: "Status" },
  { key: "destructive", label: "Error", group: "curated", section: "Status" },

  // ── Advanced (everything else solid) ──
  { key: "primary-foreground", label: "On accent", group: "advanced", section: "Core" },
  { key: "card-foreground", label: "On surface", group: "advanced", section: "Core" },
  { key: "popover", label: "Popover", group: "advanced", section: "Core" },
  { key: "popover-foreground", label: "On popover", group: "advanced", section: "Core" },
  { key: "secondary", label: "Secondary", group: "advanced", section: "Core" },
  { key: "secondary-foreground", label: "On secondary", group: "advanced", section: "Core" },
  { key: "muted", label: "Muted", group: "advanced", section: "Core" },
  { key: "accent", label: "Hover / Active", group: "advanced", section: "Core" },
  { key: "accent-foreground", label: "On hover", group: "advanced", section: "Core" },
  { key: "input", label: "Input", group: "advanced", section: "Core" },
  { key: "success-foreground", label: "On success", group: "advanced", section: "Status" },
  { key: "warning-foreground", label: "On warning", group: "advanced", section: "Status" },
  { key: "info-foreground", label: "On info", group: "advanced", section: "Status" },
  { key: "sidebar", label: "Sidebar", group: "advanced", section: "Sidebar" },
  { key: "sidebar-foreground", label: "Sidebar text", group: "advanced", section: "Sidebar" },
  { key: "sidebar-accent", label: "Sidebar hover", group: "advanced", section: "Sidebar" },
  { key: "sidebar-accent-foreground", label: "Sidebar hover text", group: "advanced", section: "Sidebar" },
  { key: "sidebar-border", label: "Sidebar border", group: "advanced", section: "Sidebar" },
  { key: "chart-2", label: "Chart 2", group: "advanced", section: "Charts" },
  { key: "chart-3", label: "Chart 3", group: "advanced", section: "Charts" },
  { key: "chart-4", label: "Chart 4", group: "advanced", section: "Charts" },
  { key: "chart-5", label: "Chart 5", group: "advanced", section: "Charts" },
];

export const CURATED_TOKENS = COLOR_TOKENS.filter((t) => t.group === "curated");
export const ADVANCED_TOKENS = COLOR_TOKENS.filter((t) => t.group === "advanced");

/** Keys whose value follows the accent (`primary`) automatically. */
export const DERIVED_FROM_PRIMARY = [
  "ring",
  "glow",
  "sidebar-primary",
  "sidebar-ring",
  "chart-1",
  "info",
] as const;

/** Glass tokens derived from card/background/foreground in the applier. */
export const GLASS_TOKENS = [
  "glass-sidebar",
  "glass-overlay",
  "glass-settings",
  "glass-toast",
  "glass-filter",
  "glass-border",
] as const;

export type ThemeColors = Record<string, string>;

/**
 * Default token values, mirroring `globals.css` exactly so a freshly-seeded
 * theme matches the stock Obsidian look before any edits.
 */
export const DEFAULT_COLORS: Record<ThemeBase, ThemeColors> = {
  light: {
    primary: "hsl(272, 100%, 43%)",
    background: "hsl(0, 0%, 100%)",
    card: "hsl(0, 0%, 100%)",
    foreground: "hsl(240, 10%, 8%)",
    "muted-foreground": "hsl(240, 4%, 45%)",
    border: "hsl(240, 6%, 90%)",
    success: "hsl(142, 70%, 38%)",
    warning: "hsl(38, 92%, 45%)",
    destructive: "hsl(0, 84%, 50%)",
    "primary-foreground": "hsl(0, 0%, 100%)",
    "card-foreground": "hsl(240, 10%, 8%)",
    popover: "hsl(0, 0%, 100%)",
    "popover-foreground": "hsl(240, 10%, 8%)",
    secondary: "hsl(240, 5%, 96%)",
    "secondary-foreground": "hsl(240, 10%, 8%)",
    muted: "hsl(240, 5%, 96%)",
    accent: "hsl(240, 5%, 96%)",
    "accent-foreground": "hsl(240, 10%, 8%)",
    input: "hsl(240, 6%, 90%)",
    "success-foreground": "hsl(0, 0%, 100%)",
    "warning-foreground": "hsl(0, 0%, 0%)",
    "info-foreground": "hsl(0, 0%, 100%)",
    sidebar: "hsl(240, 10%, 98%)",
    "sidebar-foreground": "hsl(240, 10%, 8%)",
    "sidebar-accent": "hsl(240, 5%, 96%)",
    "sidebar-accent-foreground": "hsl(240, 10%, 8%)",
    "sidebar-border": "hsl(240, 6%, 90%)",
    "chart-2": "hsl(142, 71%, 38%)",
    "chart-3": "hsl(38, 92%, 45%)",
    "chart-4": "hsl(0, 84%, 50%)",
    "chart-5": "hsl(220, 9%, 46%)",
  },
  dark: {
    primary: "hsl(272, 100%, 43%)",
    background: "hsl(240, 10%, 4%)",
    card: "hsl(240, 10%, 7%)",
    foreground: "hsl(0, 0%, 95%)",
    "muted-foreground": "hsl(240, 5%, 55%)",
    border: "hsl(240, 5%, 12%)",
    success: "hsl(142, 71%, 45%)",
    warning: "hsl(48, 96%, 53%)",
    destructive: "hsl(0, 84%, 60%)",
    "primary-foreground": "hsl(0, 0%, 100%)",
    "card-foreground": "hsl(0, 0%, 95%)",
    popover: "hsl(240, 10%, 7%)",
    "popover-foreground": "hsl(0, 0%, 95%)",
    secondary: "hsl(240, 5%, 15%)",
    "secondary-foreground": "hsl(0, 0%, 95%)",
    muted: "hsl(240, 5%, 15%)",
    accent: "hsl(240, 5%, 15%)",
    "accent-foreground": "hsl(0, 0%, 95%)",
    input: "hsl(240, 5%, 15%)",
    "success-foreground": "hsl(0, 0%, 100%)",
    "warning-foreground": "hsl(0, 0%, 0%)",
    "info-foreground": "hsl(0, 0%, 100%)",
    sidebar: "hsl(240, 10%, 7%)",
    "sidebar-foreground": "hsl(0, 0%, 95%)",
    "sidebar-accent": "hsl(240, 5%, 15%)",
    "sidebar-accent-foreground": "hsl(0, 0%, 95%)",
    "sidebar-border": "hsl(240, 5%, 12%)",
    "chart-2": "hsl(142, 71%, 45%)",
    "chart-3": "hsl(48, 96%, 53%)",
    "chart-4": "hsl(0, 84%, 60%)",
    "chart-5": "hsl(220, 9%, 46%)",
  },
};

export interface ThemeFonts {
  /** UI font family name, or "" for the system stack. */
  sans: string;
  /** Monospace font family name, or "" for the system mono stack. */
  mono: string;
}

export const DEFAULT_FONTS: ThemeFonts = { sans: "Geist Sans", mono: "Geist Mono" };

export interface FontOption {
  label: string;
  /** Family name written into the CSS variable, or "" for the system stack. */
  value: string;
}

/** Fonts shipped with the app (bundled via @fontsource) plus the system stack. */
export const BUNDLED_SANS_FONTS: FontOption[] = [
  { label: "System Default", value: "" },
  { label: "Geist Sans", value: "Geist Sans" },
  { label: "Inter", value: "Inter" },
  { label: "Roboto", value: "Roboto" },
  { label: "Poppins", value: "Poppins" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "IBM Plex Sans", value: "IBM Plex Sans" },
];

export const BUNDLED_MONO_FONTS: FontOption[] = [
  { label: "System Monospace", value: "" },
  { label: "Geist Mono", value: "Geist Mono" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Fira Code", value: "Fira Code" },
  { label: "IBM Plex Mono", value: "IBM Plex Mono" },
];

export interface CustomTheme {
  schemaVersion: typeof THEME_SCHEMA_VERSION;
  name: string;
  author?: string;
  colors: { light: ThemeColors; dark: ThemeColors };
  fonts: ThemeFonts;
  /** Border radius in rem (drives `--radius`). */
  radius: number;
  /** Root font-size multiplier (1 = 100%). */
  fontScale: number;
}

export function cloneTheme(theme: CustomTheme): CustomTheme {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    name: theme.name,
    author: theme.author,
    colors: {
      light: { ...theme.colors.light },
      dark: { ...theme.colors.dark },
    },
    fonts: { ...theme.fonts },
    radius: theme.radius,
    fontScale: theme.fontScale,
  };
}

/** Build a fresh theme matching the current stock look. */
export function makeDefaultTheme(name = "Custom Theme"): CustomTheme {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    name,
    colors: {
      light: { ...DEFAULT_COLORS.light },
      dark: { ...DEFAULT_COLORS.dark },
    },
    fonts: { ...DEFAULT_FONTS },
    radius: DEFAULT_RADIUS,
    fontScale: DEFAULT_FONT_SCALE,
  };
}
