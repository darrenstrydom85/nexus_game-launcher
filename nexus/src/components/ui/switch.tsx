import * as React from "react";
import * as Radix from "radix-ui";
import { cn } from "@/lib/utils";

/** On/off toggle. The thumb slides on transform; the track recolours in 150ms. */
export const Switch = React.forwardRef<
  React.ComponentRef<typeof Radix.Switch.Root>,
  React.ComponentPropsWithoutRef<typeof Radix.Switch.Root>
>(({ className, ...props }, ref) => (
  <Radix.Switch.Root
    ref={ref}
    className={cn(
      "relative inline-flex h-6 w-[42px] shrink-0 items-center rounded-full outline-none transition-colors duration-150",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
  >
    <Radix.Switch.Thumb className="pointer-events-none block size-[18px] translate-x-[3px] rounded-full bg-white shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-[21px]" />
  </Radix.Switch.Root>
));
Switch.displayName = "Switch";
