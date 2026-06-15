import * as React from "react";
import { cn } from "@/lib/utils";
import { colorToHex } from "@/lib/themeApply";

interface ColorFieldProps {
  label: string;
  /** Current color as any CSS color string. */
  value: string;
  /** Called with a `#rrggbb` hex string when the user picks a new color. */
  onChange: (hex: string) => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * A compact color editor: a swatch (native color picker) plus a hex text input.
 * Native `<input type="color">` renders reliably in WebView2 (unlike date
 * inputs), so it is safe to use here.
 */
export function ColorField({ label, value, onChange, className, ...rest }: ColorFieldProps) {
  const hex = React.useMemo(() => colorToHex(value), [value]);
  const [text, setText] = React.useState(hex);

  React.useEffect(() => {
    setText(hex);
  }, [hex]);

  const commitText = (raw: string) => {
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#([a-f\d]{3}|[a-f\d]{6})$/i.test(normalized)) {
      onChange(colorToHex(normalized));
    } else {
      setText(hex);
    }
  };

  return (
    <label className={cn("flex items-center justify-between gap-2", className)}>
      <span className="truncate text-xs text-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText((e.target as HTMLInputElement).value);
          }}
          spellCheck={false}
          aria-label={`${label} hex value`}
          className="w-20 rounded-md border border-border bg-input/40 px-2 py-1 text-right font-mono text-xs text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="relative inline-flex size-7 shrink-0 overflow-hidden rounded-md border border-border">
          <input
            type="color"
            data-testid={rest["data-testid"]}
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} color picker`}
            className="absolute inset-[-25%] size-[150%] cursor-pointer border-0 bg-transparent p-0"
          />
        </span>
      </span>
    </label>
  );
}
