import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressSliderProps {
  value: number;
  color?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

const QUICK_VALUES = [0, 25, 50, 75, 100] as const;

const STATUS_TRACK_COLORS: Record<string, string> = {
  playing: "var(--success)",
  completed: "var(--primary)",
  backlog: "var(--warning)",
  dropped: "var(--destructive)",
  wishlist: "var(--info)",
};

export function ProgressSlider({ value, color, onChange, onCommit }: ProgressSliderProps) {
  const [shiftHeld, setShiftHeld] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const snap = (raw: number) => {
    if (shiftHeld) return raw;
    return Math.round(raw / 5) * 5;
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(snap(Number(e.target.value)));
  };

  const handleCommit = () => {
    onCommit?.(value);
  };

  const fillColor = (color && STATUS_TRACK_COLORS[color]) || "var(--primary)";
  const trackBg = `linear-gradient(to right, ${fillColor} ${value}%, var(--secondary) ${value}%)`;

  return (
    <div data-testid="progress-slider" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={shiftHeld ? 1 : 5}
          value={value}
          onChange={handleInput}
          onMouseUp={handleCommit}
          onKeyUp={handleCommit}
          className={cn(
            "h-2 w-full cursor-pointer appearance-none rounded-full",
            "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
            "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--background)]",
            "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
          )}
          style={{ background: trackBg }}
          aria-label="Game progress percentage"
        />
        <span className="min-w-[3ch] text-right text-sm font-medium tabular-nums text-foreground">
          {value}%
        </span>
      </div>

      <div className="flex gap-1.5">
        {QUICK_VALUES.map((v) => (
          <button
            key={v}
            data-testid={`quick-set-${v}`}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              value === v
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
            onClick={() => {
              onChange(v);
              onCommit?.(v);
            }}
          >
            {v}%
          </button>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Hold Shift for 1% precision
      </p>
    </div>
  );
}
