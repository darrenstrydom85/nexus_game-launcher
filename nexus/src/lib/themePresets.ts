/**
 * Built-in preset themes shown in the Theme Studio gallery. Selecting one loads
 * it into the editor as a starting point for further tweaks or export.
 *
 * Presets primarily restyle the dark base (the app's default appearance); the
 * light base inherits the stock palette with the preset accent applied.
 */
import {
  type CustomTheme,
  type ThemeColors,
  DEFAULT_COLORS,
  DEFAULT_FONTS,
  DEFAULT_FONT_SCALE,
  DEFAULT_RADIUS,
  THEME_SCHEMA_VERSION,
  makeDefaultTheme,
} from "./themeTypes";

interface DarkPresetInput {
  bg: string;
  card: string;
  sidebar: string;
  surface: string; // borders / muted / secondary / inputs
  text: string;
  mutedText: string;
  accent: string;
  accentText: string;
  success: string;
  warning: string;
  error: string;
}

function buildDark(o: DarkPresetInput): ThemeColors {
  return {
    ...DEFAULT_COLORS.dark,
    background: o.bg,
    card: o.card,
    "card-foreground": o.text,
    popover: o.card,
    "popover-foreground": o.text,
    foreground: o.text,
    "muted-foreground": o.mutedText,
    border: o.surface,
    input: o.surface,
    muted: o.surface,
    secondary: o.surface,
    "secondary-foreground": o.text,
    accent: o.surface,
    "accent-foreground": o.text,
    primary: o.accent,
    "primary-foreground": o.accentText,
    success: o.success,
    warning: o.warning,
    destructive: o.error,
    sidebar: o.sidebar,
    "sidebar-foreground": o.text,
    "sidebar-accent": o.surface,
    "sidebar-accent-foreground": o.text,
    "sidebar-border": o.surface,
    "chart-2": o.success,
    "chart-3": o.warning,
    "chart-4": o.error,
  };
}

function darkPreset(
  name: string,
  author: string,
  input: DarkPresetInput,
): CustomTheme {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    name,
    author,
    colors: {
      light: { ...DEFAULT_COLORS.light, primary: input.accent },
      dark: buildDark(input),
    },
    fonts: { ...DEFAULT_FONTS },
    radius: DEFAULT_RADIUS,
    fontScale: DEFAULT_FONT_SCALE,
  };
}

export const THEME_PRESETS: CustomTheme[] = [
  makeDefaultTheme("Obsidian"),
  darkPreset("Nord", "Nexus", {
    bg: "#2e3440",
    card: "#3b4252",
    sidebar: "#2e3440",
    surface: "#434c5e",
    text: "#eceff4",
    mutedText: "#d8dee9",
    accent: "#88c0d0",
    accentText: "#2e3440",
    success: "#a3be8c",
    warning: "#ebcb8b",
    error: "#bf616a",
  }),
  darkPreset("Dracula", "Nexus", {
    bg: "#282a36",
    card: "#343746",
    sidebar: "#21222c",
    surface: "#44475a",
    text: "#f8f8f2",
    mutedText: "#bcc2cd",
    accent: "#bd93f9",
    accentText: "#282a36",
    success: "#50fa7b",
    warning: "#f1fa8c",
    error: "#ff5555",
  }),
  darkPreset("Catppuccin Mocha", "Nexus", {
    bg: "#1e1e2e",
    card: "#313244",
    sidebar: "#181825",
    surface: "#45475a",
    text: "#cdd6f4",
    mutedText: "#a6adc8",
    accent: "#cba6f7",
    accentText: "#1e1e2e",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
  }),
  darkPreset("Gruvbox", "Nexus", {
    bg: "#1d2021",
    card: "#282828",
    sidebar: "#1d2021",
    surface: "#3c3836",
    text: "#ebdbb2",
    mutedText: "#a89984",
    accent: "#fabd2f",
    accentText: "#1d2021",
    success: "#b8bb26",
    warning: "#fe8019",
    error: "#fb4934",
  }),
  darkPreset("Tokyo Night", "Nexus", {
    bg: "#1a1b26",
    card: "#24283b",
    sidebar: "#16161e",
    surface: "#2f3549",
    text: "#c0caf5",
    mutedText: "#565f89",
    accent: "#7aa2f7",
    accentText: "#1a1b26",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
  }),
  darkPreset("One Dark", "Nexus", {
    bg: "#282c34",
    card: "#2c313a",
    sidebar: "#21252b",
    surface: "#3b4048",
    text: "#abb2bf",
    mutedText: "#5c6370",
    accent: "#61afef",
    accentText: "#282c34",
    success: "#98c379",
    warning: "#e5c07b",
    error: "#e06c75",
  }),
  darkPreset("Monokai", "Nexus", {
    bg: "#272822",
    card: "#2f302a",
    sidebar: "#1e1f1c",
    surface: "#3e3d32",
    text: "#f8f8f2",
    mutedText: "#75715e",
    accent: "#66d9ef",
    accentText: "#272822",
    success: "#a6e22e",
    warning: "#fd971f",
    error: "#f92672",
  }),
  darkPreset("Rosé Pine", "Nexus", {
    bg: "#191724",
    card: "#1f1d2e",
    sidebar: "#16141f",
    surface: "#26233a",
    text: "#e0def4",
    mutedText: "#908caa",
    accent: "#c4a7e7",
    accentText: "#191724",
    success: "#9ccfd8",
    warning: "#f6c177",
    error: "#eb6f92",
  }),
  darkPreset("Solarized", "Nexus", {
    bg: "#002b36",
    card: "#073642",
    sidebar: "#00252e",
    surface: "#0e4b59",
    text: "#93a1a1",
    mutedText: "#586e75",
    accent: "#268bd2",
    accentText: "#fdf6e3",
    success: "#859900",
    warning: "#b58900",
    error: "#dc322f",
  }),
  darkPreset("Everforest", "Nexus", {
    bg: "#2d353b",
    card: "#343f44",
    sidebar: "#272e33",
    surface: "#3d484d",
    text: "#d3c6aa",
    mutedText: "#859289",
    accent: "#a7c080",
    accentText: "#2d353b",
    success: "#83c092",
    warning: "#dbbc7f",
    error: "#e67e80",
  }),
  darkPreset("Synthwave", "Nexus", {
    bg: "#1a1033",
    card: "#241b3a",
    sidebar: "#150c28",
    surface: "#34294f",
    text: "#f7f2ff",
    mutedText: "#a08bc7",
    accent: "#ff2e97",
    accentText: "#1a1033",
    success: "#36f9c2",
    warning: "#ffd319",
    error: "#fe4450",
  }),
  darkPreset("Forest", "Nexus", {
    bg: "#0c1a12",
    card: "#11251a",
    sidebar: "#081308",
    surface: "#1c3a29",
    text: "#d6e8da",
    mutedText: "#6f9080",
    accent: "#3fb950",
    accentText: "#0c1a12",
    success: "#56d364",
    warning: "#d9b04a",
    error: "#e5736b",
  }),
  darkPreset("Cyberpunk", "Nexus", {
    bg: "#0a0e12",
    card: "#0f161c",
    sidebar: "#05080a",
    surface: "#1a2630",
    text: "#ecf6ff",
    mutedText: "#5c7a8a",
    accent: "#fcee0a",
    accentText: "#0a0e12",
    success: "#00f0ff",
    warning: "#ff9f1c",
    error: "#ff003c",
  }),
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a fresh, cohesive dark theme: a tinted near-black background built
 * around a random base hue, with a vibrant accent. Status colors stay close to
 * their conventional hues so success/warning/error remain legible.
 */
export function randomTheme(): CustomTheme {
  const baseHue = randInt(0, 359);
  // Accent hue offset from the base for visual contrast (avoid a muddy match).
  const accentHue = (baseHue + randInt(60, 300)) % 360;
  const bgSat = randInt(12, 28);
  const accentSat = randInt(65, 92);
  const accentLum = randInt(55, 66);

  return darkPreset("Random", "Nexus", {
    bg: `hsl(${baseHue}, ${bgSat}%, 6%)`,
    card: `hsl(${baseHue}, ${bgSat}%, 10%)`,
    sidebar: `hsl(${baseHue}, ${bgSat}%, 5%)`,
    surface: `hsl(${baseHue}, ${Math.max(bgSat - 4, 8)}%, 16%)`,
    text: `hsl(${baseHue}, 15%, 93%)`,
    mutedText: `hsl(${baseHue}, 12%, 58%)`,
    accent: `hsl(${accentHue}, ${accentSat}%, ${accentLum}%)`,
    accentText: `hsl(${baseHue}, ${bgSat}%, 6%)`,
    success: `hsl(${randInt(135, 152)}, 62%, 50%)`,
    warning: `hsl(${randInt(36, 46)}, 92%, 55%)`,
    error: `hsl(${randInt(353, 366) % 360}, 75%, 60%)`,
  });
}
