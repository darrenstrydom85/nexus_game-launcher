import * as React from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/** Outline button recoloured for destructive rows; pair with `<Button variant="outline" size="sm">`. */
export const DANGER_BUTTON = "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive";

/** Page heading for a settings category. */
export function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** A titled group of rows. `danger` tints it for irreversible actions. */
export function SettingsCard({
  title,
  tone,
  children,
  className,
  ...rest
}: { title: string; tone?: "danger" } & React.ComponentPropsWithoutRef<"section">) {
  return (
    <section
      aria-label={title}
      {...rest}
      className={cn("overflow-hidden rounded-2xl border bg-card", tone === "danger" ? "border-destructive/40" : "border-border", className)}
    >
      <h3 className={cn("px-[18px] py-3.5 text-[13px] font-semibold", tone === "danger" ? "text-destructive" : "text-foreground")}>{title}</h3>
      <div className="divide-y divide-border/70 border-t border-border/70">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Icon tile or colour dot before the label. */
  leading?: React.ReactNode;
  /** Id of the control the label names (a real <label for>). */
  labelFor?: string;
  descriptionId?: string;
  /** Lets the control wrap under the label; for wide controls like preset lists. */
  stacked?: boolean;
  children?: React.ReactNode;
  "data-testid"?: string;
}

/** Label and description on the left, the control on the right. */
export function SettingsRow({ label, description, leading, labelFor, descriptionId, stacked, children, ...rest }: SettingsRowProps) {
  return (
    <div data-testid={rest["data-testid"]} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-[18px] py-[13px]">
      <div className="flex min-w-0 flex-[1_1_260px] items-center gap-3">
        {leading}
        <div className="min-w-0">
          {labelFor ? (
            <label htmlFor={labelFor} className="block text-sm font-medium text-foreground">
              {label}
            </label>
          ) : (
            <div className="text-sm font-medium text-foreground">{label}</div>
          )}
          {description && (
            <div id={descriptionId} className="mt-0.5 text-[12.5px] text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>
      {children && <div className={cn("flex flex-wrap items-center gap-2", stacked ? "flex-[1_1_100%]" : "shrink-0")}>{children}</div>}
    </div>
  );
}

/** A row whose control is a switch; clicking the label toggles it. */
export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  leading,
  ...rest
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  leading?: React.ReactNode;
  "data-testid"?: string;
}) {
  const id = React.useId();
  return (
    <SettingsRow label={label} description={description} labelFor={id} descriptionId={description ? `${id}-desc` : undefined} leading={leading}>
      <Switch
        id={id}
        data-testid={rest["data-testid"]}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
    </SettingsRow>
  );
}

/** Square icon tile for a row's leading slot. */
export function RowIcon({ children }: { children: React.ReactNode }) {
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-muted-foreground">{children}</span>;
}
