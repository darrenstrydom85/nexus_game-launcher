import * as React from "react";
import * as Radix from "radix-ui";
import { cn } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Show only the icon; the label becomes the accessible name. */
  iconOnly?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** null when none of the options applies (e.g. a custom range is active). */
  value: T | null;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  "aria-label": string;
  className?: string;
}

/** Single-choice toggle group. Selection is instant: it is a high-frequency control. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <Radix.ToggleGroup.Root
      type="single"
      value={value ?? ""}
      // Radix emits "" when the active item is pressed again; keep one selected.
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={props["aria-label"]}
      className={cn("flex rounded-lg border border-input bg-background/60 p-[3px]", className)}
    >
      {options.map((o) => (
        <Radix.ToggleGroup.Item
          key={o.value}
          value={o.value}
          aria-label={o.iconOnly ? o.label : undefined}
          className={cn(
            "pressable flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground outline-none",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            "data-[state=on]:bg-accent data-[state=on]:text-foreground",
            o.iconOnly && "w-8 px-0",
          )}
        >
          {o.icon}
          {!o.iconOnly && o.label}
        </Radix.ToggleGroup.Item>
      ))}
    </Radix.ToggleGroup.Root>
  );
}
