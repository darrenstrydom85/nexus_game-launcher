import * as React from "react";
import * as Radix from "radix-ui";
import { cn } from "@/lib/utils";

const SliderPrimitive = Radix.Slider;

/** Range or single-value slider; one thumb is rendered per value. */
const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabels?: string[] }
>(({ className, thumbLabels, value, defaultValue, ...props }, ref) => {
  const count = (value ?? defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      className={cn("relative flex h-5 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: count }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={thumbLabels?.[i]}
          className="block size-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-[scale] duration-150 ease-out hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = "Slider";

export { Slider };
