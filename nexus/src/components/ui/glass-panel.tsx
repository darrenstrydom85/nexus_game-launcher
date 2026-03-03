import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassPanelVariants = cva(
  "border border-[hsla(0,0%,100%,0.05)]",
  {
    variants: {
      variant: {
        sidebar:
          "bg-[hsla(240,10%,7%,0.8)] backdrop-blur-[20px]",
        overlay:
          "bg-[hsla(240,10%,4%,0.9)] backdrop-blur-[40px]",
        settings:
          "bg-[hsla(240,10%,7%,0.85)] backdrop-blur-[24px]",
        toast:
          "bg-[hsla(240,10%,10%,0.9)] backdrop-blur-[16px]",
        filter:
          "bg-[hsla(240,10%,7%,0.6)] backdrop-blur-[12px]",
      },
    },
    defaultVariants: {
      variant: "sidebar",
    },
  },
);

export interface GlassPanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassPanelVariants> {
  asChild?: boolean;
}

const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="glass-panel"
      data-variant={variant}
      className={cn(glassPanelVariants({ variant, className }))}
      {...props}
    />
  ),
);
GlassPanel.displayName = "GlassPanel";

export { GlassPanel, glassPanelVariants };
