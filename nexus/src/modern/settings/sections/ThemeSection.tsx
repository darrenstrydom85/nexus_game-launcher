import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Download, Loader2, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { colorToHex } from "@/lib/themeApply";
import { THEME_PRESETS } from "@/lib/themePresets";
import {
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
  type ColorTokenMeta,
  type FontOption,
} from "@/lib/themeTypes";
import { ACCENT_SWATCHES, slugifyThemeName, useThemeStudio } from "../hooks/useThemeStudio";
import { SettingsCard, SettingsRow } from "../SettingsKit";

const RANDOM_SWATCH = "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #a855f7, #ef4444)";
const PX_PER_REM = 16;

const formatScale = (v: number) => `${Math.round(v * 100)}%`;
const formatRadius = (v: number) => `${Math.round(v * PX_PER_REM)}px`;

// The accent has its own card, so the palette list starts at the background.
const PALETTE_TOKENS = CURATED_TOKENS.filter((t) => t.key !== "primary");

const ADVANCED_GROUPS: [string, ColorTokenMeta[]][] = Array.from(
  ADVANCED_TOKENS.reduce((map, token) => map.set(token.section, [...(map.get(token.section) ?? []), token]), new Map<string, ColorTokenMeta[]>()),
);

const FIELD =
  "h-[34px] rounded-lg border border-input bg-background/60 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ThemeSection() {
  const t = useThemeStudio();
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const advancedId = React.useId();
  const accentHex = colorToHex(t.colors.primary).toLowerCase();

  return (
    <>
      <SettingsCard title="Presets" data-testid="theme-studio">
        <SettingsRow label="Start from a preset" description="Keeps your fonts, text size and corner radius" stacked>
          <div role="group" aria-label="Presets" data-testid="theme-presets" className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => (
              <PresetPill
                key={preset.name}
                name={preset.name}
                swatch={preset.colors.dark.primary}
                active={t.activePreset === preset.name}
                onClick={() => t.applyPreset(preset)}
                data-testid={`theme-preset-${slugifyThemeName(preset.name)}`}
              />
            ))}
            <PresetPill name="Random" swatch={RANDOM_SWATCH} active={t.activePreset === "Random"} onClick={t.applyRandom} data-testid="theme-preset-random" />
          </div>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Accent">
        <SettingsRow label="Accent colour" description="Used for buttons, progress and highlights">
          <div role="group" aria-label="Accent colour" data-testid="theme-accent-presets" className="flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((swatch) => {
              const selected = accentHex === swatch.hex;
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  aria-label={`Accent ${swatch.name}`}
                  aria-pressed={selected}
                  data-testid={`theme-accent-${swatch.hex}`}
                  onClick={() => t.patchColor("primary", swatch.hex)}
                  style={{ background: swatch.hex }}
                  className={cn(
                    "pressable size-7 rounded-full outline-none inset-ring-1 inset-ring-black/15 ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "ring-2 ring-foreground",
                  )}
                />
              );
            })}
          </div>
        </SettingsRow>
        <SettingsRow label="Custom colour" description="Pick any colour or paste a hex code">
          <ColorControl label="Accent" value={t.colors.primary} onChange={(hex) => t.patchColor("primary", hex)} data-testid="theme-color-primary" />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Type & shape">
        <SettingsRow label="UI font">
          <FontPicker
            label="UI font"
            value={t.working.fonts.sans}
            onChange={(v) => t.patchFont("sans", v)}
            bundled={BUNDLED_SANS_FONTS}
            systemFonts={t.systemFonts}
            data-testid="theme-font-sans"
          />
        </SettingsRow>
        <SettingsRow label="Monospace font">
          <FontPicker
            label="Monospace font"
            value={t.working.fonts.mono}
            onChange={(v) => t.patchFont("mono", v)}
            bundled={BUNDLED_MONO_FONTS}
            systemFonts={t.systemFonts}
            data-testid="theme-font-mono"
          />
        </SettingsRow>
        <SettingsRow label="Text size">
          <SliderControl
            label="Text size"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.05}
            value={t.working.fontScale}
            fallback={DEFAULT_FONT_SCALE}
            format={formatScale}
            onChange={t.patchScale}
            data-testid="theme-scale"
          />
        </SettingsRow>
        <SettingsRow label="Corner radius">
          <SliderControl
            label="Corner radius"
            min={RADIUS_MIN}
            max={RADIUS_MAX}
            step={1 / PX_PER_REM}
            value={t.working.radius}
            fallback={DEFAULT_RADIUS}
            format={formatRadius}
            onChange={t.patchRadius}
            data-testid="theme-radius"
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title="Colours">
        <SettingsRow label={`Editing the ${t.base} palette`} description="Switch between light and dark in Appearance to edit the other one" />
        {PALETTE_TOKENS.map((token) => (
          <ColorRow key={token.key} token={token} value={t.colors[token.key]} onChange={t.patchColor} />
        ))}
        {t.lowContrast && (
          <div data-testid="theme-contrast-warning" className="flex items-start gap-2.5 px-[18px] py-3 text-[12.5px] text-amber-700 dark:text-warning">
            <TriangleAlert className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>Text on the background is only {t.contrast.toFixed(1)}:1. Aim for 4.5:1 or more so it stays easy to read.</span>
          </div>
        )}
        <SettingsRow label="Advanced colours" description="Hover states, sidebar, charts and the text drawn on each colour">
          <Button
            variant="outline"
            size="sm"
            data-testid="theme-advanced-toggle"
            aria-expanded={showAdvanced}
            aria-controls={showAdvanced ? advancedId : undefined}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"}
          </Button>
        </SettingsRow>
        {showAdvanced && (
          <div id={advancedId} data-testid="theme-advanced" className="divide-y divide-border/70">
            {ADVANCED_GROUPS.map(([section, tokens]) => (
              <div key={section} role="group" aria-label={`${section} colours`}>
                <div className="px-[18px] pb-1 pt-3 text-xs font-medium text-muted-foreground">{section}</div>
                <div className="divide-y divide-border/70">
                  {tokens.map((token) => (
                    <ColorRow key={token.key} token={token} value={t.colors[token.key]} onChange={t.patchColor} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Share">
        <SettingsRow label="Save your theme to a file" description="Anyone without your fonts sees the defaults instead">
          <Button variant="outline" size="sm" data-testid="theme-export" disabled={t.busy !== null} onClick={t.exportTheme}>
            {t.busy === "export" ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
            ) : (
              <Download className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
            Export theme
          </Button>
        </SettingsRow>
        <SettingsRow label="Load a theme file">
          <Button variant="outline" size="sm" data-testid="theme-import" disabled={t.busy !== null} onClick={t.importTheme}>
            {t.busy === "import" ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
            ) : (
              <Upload className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
            Import theme
          </Button>
        </SettingsRow>
        <SettingsRow label="Reset theme" description="Go back to the stock Nexus look">
          <Button variant="outline" size="sm" data-testid="theme-reset" disabled={t.busy !== null || !t.customTheme} onClick={t.reset}>
            <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />
            Reset
          </Button>
        </SettingsRow>
        {t.status && (
          <p
            data-testid="theme-status"
            role={t.status.kind === "err" ? "alert" : "status"}
            className={cn("px-[18px] py-3 text-[12.5px]", t.status.kind === "ok" ? "text-green-700 dark:text-success" : "text-destructive")}
          >
            {t.status.msg}
          </p>
        )}
      </SettingsCard>
    </>
  );
}

function PresetPill({
  name,
  swatch,
  active,
  onClick,
  ...rest
}: {
  name: string;
  swatch: string;
  active: boolean;
  onClick: () => void;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-testid={rest["data-testid"]}
      onClick={onClick}
      className={cn(
        "pressable inline-flex h-8 items-center gap-2 rounded-full border pl-2 pr-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-secondary text-foreground" : "border-border bg-background/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span aria-hidden className="size-4 shrink-0 rounded-full inset-ring-1 inset-ring-black/15" style={{ background: swatch }} />
      {name}
    </button>
  );
}

function ColorRow({ token, value, onChange }: { token: ColorTokenMeta; value: string; onChange: (key: string, hex: string) => void }) {
  return (
    <SettingsRow label={token.label}>
      <ColorControl label={token.label} value={value} onChange={(hex) => onChange(token.key, hex)} data-testid={`theme-color-${token.key}`} />
    </SettingsRow>
  );
}

const HEX = /^#([a-f\d]{3}|[a-f\d]{6})$/i;

/** Hex code field plus the system colour picker. */
function ColorControl({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  "data-testid"?: string;
}) {
  const hex = React.useMemo(() => colorToHex(value), [value]);
  // What the user is typing; null shows the current colour.
  const [draft, setDraft] = React.useState<string | null>(null);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (HEX.test(candidate)) {
      const next = colorToHex(candidate);
      if (next.toLowerCase() !== hex.toLowerCase()) onChange(next);
    }
    setDraft(null);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={draft ?? hex}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          else if (e.key === "Escape") setDraft(null);
        }}
        spellCheck={false}
        autoComplete="off"
        aria-label={`${label} hex code`}
        className={cn(FIELD, "w-[92px] px-2.5 font-mono text-[13px] tabular-nums")}
      />
      <span className="relative inline-flex size-[34px] shrink-0 overflow-hidden rounded-lg border border-input has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input
          type="color"
          data-testid={rest["data-testid"]}
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour picker`}
          className="absolute inset-[-25%] size-[150%] cursor-pointer border-0 bg-transparent p-0 outline-none"
        />
      </span>
    </div>
  );
}

/** A slider with its value beside it; clicking the value puts the default back. */
function SliderControl({
  label,
  min,
  max,
  step,
  value,
  fallback,
  format,
  onChange,
  ...rest
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  fallback: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  "data-testid"?: string;
}) {
  const shown = format(value);
  return (
    <div className="flex items-center gap-3">
      <Slider
        data-testid={rest["data-testid"]}
        className="w-[180px]"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        thumbLabels={[label]}
      />
      <button
        type="button"
        onClick={() => onChange(fallback)}
        aria-label={`${shown}, reset ${label.toLowerCase()} to ${format(fallback)}`}
        title={`Reset to ${format(fallback)}`}
        className="w-11 rounded-sm text-left text-[13px] tabular-nums text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown}
      </button>
    </div>
  );
}

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

/**
 * Searchable font list: fonts that ship with Nexus first, then every font
 * installed on this PC. Each name is shown in its own typeface.
 */
function FontPicker({
  label,
  value,
  onChange,
  bundled,
  systemFonts,
  ...rest
}: {
  label: string;
  /** Font family, or "" for the system stack. */
  value: string;
  onChange: (value: string) => void;
  bundled: FontOption[];
  systemFonts: string[];
  "data-testid"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const installed = React.useMemo(() => {
    const shipped = new Set(bundled.map((b) => b.value));
    return systemFonts.filter((f) => !shipped.has(f));
  }, [bundled, systemFonts]);
  const current = bundled.find((b) => b.value === value)?.label || value || bundled[0]?.label;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label}
          data-testid={rest["data-testid"]}
          className={cn(FIELD, "pressable flex min-w-40 max-w-56 items-center justify-between gap-2 whitespace-nowrap px-3 text-sm hover:bg-accent/60")}
        >
          <span className="min-w-0 truncate" style={{ fontFamily: value || undefined }}>
            {current}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-50 w-64 rounded-lg p-0">
        <Command label={label} filter={(item, search) => (item.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <Command.Input
            placeholder="Search fonts"
            className="h-9 w-full border-b border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No fonts match</Command.Empty>
            <Command.Group heading="Included with Nexus" className={GROUP_HEADING}>
              {bundled.map((opt) => (
                <FontItem key={opt.label} name={opt.label} family={opt.value} selected={value === opt.value} onSelect={() => pick(opt.value)} />
              ))}
            </Command.Group>
            {installed.length > 0 && (
              <Command.Group heading="Installed on this PC" className={GROUP_HEADING}>
                {installed.map((font) => (
                  <FontItem key={font} name={font} family={font} selected={value === font} onSelect={() => pick(font)} />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FontItem({ name, family, selected, onSelect }: { name: string; family: string; selected: boolean; onSelect: () => void }) {
  return (
    <Command.Item
      value={name}
      onSelect={onSelect}
      className="flex h-8 cursor-default select-none items-center justify-between gap-2 rounded-md px-2 text-sm text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className="truncate" style={{ fontFamily: family || undefined }}>
        {name}
      </span>
      {selected && <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />}
    </Command.Item>
  );
}
