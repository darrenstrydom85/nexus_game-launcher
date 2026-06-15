import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  ChevronDown,
  Dices,
  Download,
  Loader2,
  Palette,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-field";
import { FontCombobox } from "./FontCombobox";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { resolveEffectiveTheme } from "@/lib/theme";
import { contrastRatio } from "@/lib/themeApply";
import {
  type CustomTheme,
  type ThemeBase,
  ADVANCED_TOKENS,
  BUNDLED_MONO_FONTS,
  BUNDLED_SANS_FONTS,
  CURATED_TOKENS,
  DEFAULT_FONT_SCALE,
  DEFAULT_RADIUS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  RADIUS_MAX,
  RADIUS_MIN,
  cloneTheme,
  makeDefaultTheme,
} from "@/lib/themeTypes";
import { THEME_PRESETS, randomTheme } from "@/lib/themePresets";
import { parseThemeJson, serializeTheme } from "@/lib/themeSchema";

const ACCENT_PRESETS = [
  "#7600da",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

type Status = { kind: "ok" | "err"; msg: string } | null;

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
}

export function ThemeStudio() {
  const customTheme = useSettingsStore((s) => s.customTheme);
  const setCustomTheme = useSettingsStore((s) => s.setCustomTheme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const themeMode = useSettingsStore((s) => s.theme);

  const [systemFonts, setSystemFonts] = React.useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [busy, setBusy] = React.useState<"import" | "export" | null>(null);
  const [status, setStatus] = React.useState<Status>(null);

  // Which base palette the user is editing — follows the active appearance.
  const [base, setBase] = React.useState<ThemeBase>(() =>
    resolveEffectiveTheme(
      themeMode,
      typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  );

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
        /* font detection unavailable — bundled fonts still work */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The theme currently being edited. When no custom theme exists yet, seed from
  // the stock defaults but reflect the user's saved accent so the picker matches.
  const working: CustomTheme = React.useMemo(() => {
    if (customTheme) return customTheme;
    const seeded = makeDefaultTheme();
    seeded.colors.dark.primary = accentColor;
    seeded.colors.light.primary = accentColor;
    return seeded;
  }, [customTheme, accentColor]);

  const colors = working.colors[base];

  const patchColor = (key: string, hex: string) => {
    const next = cloneTheme(working);
    next.colors[base][key] = hex;
    setCustomTheme(next);
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

  const applyPreset = (preset: CustomTheme) => {
    setStatus(null);
    setCustomTheme(cloneTheme(preset));
  };

  const reset = () => {
    setStatus(null);
    setCustomTheme(null);
  };

  const handleExport = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const theme = customTheme ?? working;
      const destPath = await save({
        defaultPath: `${slugify(theme.name)}.nexustheme.json`,
        filters: [{ name: "Nexus Theme", extensions: ["json"] }],
      });
      if (!destPath) return;
      await writeTextFile(destPath, serializeTheme(theme));
      setStatus({ kind: "ok", msg: "Theme exported." });
    } catch {
      setStatus({ kind: "err", msg: "Export failed. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
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
      setCustomTheme(theme);
      setStatus({ kind: "ok", msg: `Imported "${theme.name}".` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed.";
      setStatus({ kind: "err", msg });
    } finally {
      setBusy(null);
    }
  };

  const advancedSections = React.useMemo(() => {
    const map = new Map<string, typeof ADVANCED_TOKENS>();
    for (const token of ADVANCED_TOKENS) {
      const list = map.get(token.section) ?? [];
      list.push(token);
      map.set(token.section, list);
    }
    return Array.from(map.entries());
  }, []);

  const fgBgContrast = contrastRatio(colors.foreground, colors.background);
  const lowContrast = fgBgContrast < 4.5;

  return (
    <section data-testid="theme-studio" className="flex flex-col gap-4">
      <div>
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Palette className="size-4 text-primary" aria-hidden />
          Theme Studio
        </h3>
        <p className="text-xs text-muted-foreground">
          Customize colors, fonts, and shape. Editing{" "}
          <span className="font-medium text-foreground">
            {base === "dark" ? "Dark" : "Light"}
          </span>{" "}
          appearance. Export to share your theme with others.
        </p>
      </div>

      {/* Presets */}
      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">Presets</span>
        <div className="flex flex-wrap gap-1.5" data-testid="theme-presets">
          <button
            type="button"
            data-testid="theme-preset-random"
            onClick={() => {
              setStatus(null);
              setCustomTheme(randomTheme());
            }}
            className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Dices className="size-3.5 text-primary" aria-hidden />
            Random
          </button>
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              data-testid={`theme-preset-${slugify(preset.name)}`}
              onClick={() => applyPreset(preset)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="size-3 rounded-full border border-black/20"
                style={{ background: preset.colors.dark.primary }}
                aria-hidden
              />
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Fonts */}
      <div className="grid grid-cols-2 gap-2">
        <FontCombobox
          label="UI font"
          data-testid="theme-font-sans"
          value={working.fonts.sans}
          onChange={(v) => patchFont("sans", v)}
          bundled={BUNDLED_SANS_FONTS}
          systemFonts={systemFonts}
        />
        <FontCombobox
          label="Monospace font"
          data-testid="theme-font-mono"
          value={working.fonts.mono}
          onChange={(v) => patchFont("mono", v)}
          bundled={BUNDLED_MONO_FONTS}
          systemFonts={systemFonts}
        />
      </div>
      <p className="-mt-2 text-[11px] text-muted-foreground">
        Fonts not installed on another person&apos;s machine fall back gracefully
        when they import your theme.
      </p>

      {/* Sliders */}
      <div className="flex flex-col gap-3">
        <SliderRow
          label="Corner radius"
          testid="theme-radius"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          step={0.025}
          value={working.radius}
          fallback={DEFAULT_RADIUS}
          format={(v) => `${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}rem`}
          onChange={patchRadius}
        />
        <SliderRow
          label="Text size"
          testid="theme-scale"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={0.05}
          value={working.fontScale}
          fallback={DEFAULT_FONT_SCALE}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={patchScale}
        />
      </div>

      {/* Accent quick presets */}
      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">Accent</span>
        <div className="flex gap-2" data-testid="theme-accent-presets">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              data-testid={`theme-accent-${color}`}
              onClick={() => patchColor("primary", color)}
              className={cn(
                "size-6 rounded-full border-2 transition-all",
                colors.primary.toLowerCase() === color.toLowerCase()
                  ? "scale-110 border-foreground"
                  : "border-transparent",
              )}
              style={{ background: color }}
              aria-label={`Accent ${color}`}
            />
          ))}
        </div>
      </div>

      {/* Curated colors */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        {CURATED_TOKENS.map((token) => (
          <ColorField
            key={token.key}
            label={token.label}
            data-testid={`theme-color-${token.key}`}
            value={colors[token.key]}
            onChange={(hex) => patchColor(token.key, hex)}
          />
        ))}
        {lowContrast && (
          <p
            data-testid="theme-contrast-warning"
            className="text-[11px] text-warning"
          >
            Text/background contrast is {fgBgContrast.toFixed(1)}:1 — below the
            4.5:1 readability target.
          </p>
        )}
      </div>

      {/* Advanced */}
      <div>
        <button
          type="button"
          data-testid="theme-advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={showAdvanced}
        >
          Advanced colors
          <ChevronDown
            className={cn("size-4 transition-transform", showAdvanced && "rotate-180")}
            aria-hidden
          />
        </button>
        {showAdvanced && (
          <div
            data-testid="theme-advanced"
            className="mt-2 flex flex-col gap-3 rounded-lg border border-border/60 p-3"
          >
            {advancedSections.map(([section, tokens]) => (
              <div key={section} className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section}
                </span>
                {tokens.map((token) => (
                  <ColorField
                    key={token.key}
                    label={token.label}
                    data-testid={`theme-color-${token.key}`}
                    value={colors[token.key]}
                    onChange={(hex) => patchColor(token.key, hex)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 gap-1"
          data-testid="theme-import"
          disabled={busy !== null}
          onClick={handleImport}
        >
          {busy === "import" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Import
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 gap-1"
          data-testid="theme-export"
          disabled={busy !== null}
          onClick={handleExport}
        >
          {busy === "export" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          data-testid="theme-reset"
          disabled={busy !== null || !customTheme}
          onClick={reset}
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {status && (
        <p
          data-testid="theme-status"
          className={cn(
            "text-xs",
            status.kind === "ok" ? "text-success" : "text-destructive",
          )}
        >
          {status.msg}
        </p>
      )}
    </section>
  );
}

function SliderRow({
  label,
  testid,
  min,
  max,
  step,
  value,
  fallback,
  format,
  onChange,
}: {
  label: string;
  testid: string;
  min: number;
  max: number;
  step: number;
  value: number;
  fallback: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground">{label}</span>
        <button
          type="button"
          onClick={() => onChange(fallback)}
          className="font-mono text-[11px] tabular-nums text-muted-foreground hover:text-foreground"
          aria-label={`Reset ${label}`}
        >
          {format(value)}
        </button>
      </div>
      <input
        type="range"
        data-testid={testid}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}
