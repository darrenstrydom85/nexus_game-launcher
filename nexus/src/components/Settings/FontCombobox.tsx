import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FontOption } from "@/lib/themeTypes";

interface FontComboboxProps {
  label: string;
  /** Current font family value ("" = system stack). */
  value: string;
  onChange: (value: string) => void;
  /** Bundled / app-provided options shown first. */
  bundled: FontOption[];
  /** Locally-installed system font family names. */
  systemFonts: string[];
  "data-testid"?: string;
}

/**
 * Searchable font picker. Bundled fonts (shipped with the app) appear first,
 * followed by every font detected on the user's machine.
 */
export function FontCombobox({
  label,
  value,
  onChange,
  bundled,
  systemFonts,
  ...rest
}: FontComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const bundledValues = React.useMemo(
    () => new Set(bundled.map((b) => b.value)),
    [bundled],
  );
  const filteredSystem = React.useMemo(
    () => systemFonts.filter((f) => !bundledValues.has(f)),
    [systemFonts, bundledValues],
  );

  const currentLabel =
    bundled.find((b) => b.value === value)?.label || value || "System Default";

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            data-testid={rest["data-testid"]}
            className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-input/40 px-2.5 text-xs text-foreground hover:bg-input/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate" style={{ fontFamily: value || undefined }}>
              {currentLabel}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[70] w-(--radix-popover-trigger-width) min-w-48 p-0"
          align="start"
        >
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <Command.Input
              placeholder="Search fonts..."
              className="w-full border-b border-border bg-transparent px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-56 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-4 text-center text-xs text-muted-foreground">
                No fonts found.
              </Command.Empty>
              <Command.Group
                heading="Bundled"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {bundled.map((opt) => (
                  <FontItem
                    key={opt.label}
                    itemValue={opt.label}
                    family={opt.value}
                    selected={value === opt.value}
                    onSelect={() => select(opt.value)}
                  />
                ))}
              </Command.Group>
              {filteredSystem.length > 0 && (
                <Command.Group
                  heading="Installed"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {filteredSystem.map((font) => (
                    <FontItem
                      key={font}
                      itemValue={font}
                      family={font}
                      selected={value === font}
                      onSelect={() => select(font)}
                    />
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FontItem({
  itemValue,
  family,
  selected,
  onSelect,
}: {
  itemValue: string;
  family: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={itemValue}
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className="truncate" style={{ fontFamily: family || undefined }}>
        {itemValue}
      </span>
      {selected && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
    </Command.Item>
  );
}
