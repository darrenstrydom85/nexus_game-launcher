import type { CSSProperties } from "react";

/** Recharts `<Tooltip contentStyle={...} />` — theme-aware (light + dark). */
export const rechartsTooltipContentStyle: CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

export const rechartsTooltipLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
};

export const rechartsTooltipItemStyle: CSSProperties = {
  color: "var(--popover-foreground)",
};

/** Bar / band hover rectangle — subtle in light and dark. */
export const rechartsBarCursorFill =
  "color-mix(in srgb, var(--foreground) 10%, transparent)";

/** Line chart grid lines. */
export const rechartsCartesianGridStroke = "var(--border)";
