import * as React from "react";
import { cn } from "@/lib/utils";

interface DotNavigationProps {
  count: number;
  activeIndex: number;
  onDotClick: (index: number) => void;
}

export function DotNavigation({ count, activeIndex, onDotClick }: DotNavigationProps) {
  return (
    <nav
      data-testid="dot-navigation"
      aria-label="Card navigation"
      className="fixed right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2"
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to card ${i + 1}`}
          aria-current={activeIndex === i ? "true" : undefined}
          onClick={() => onDotClick(i)}
          className={cn(
            "size-2 rounded-full transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeIndex === i
              ? "scale-125 bg-primary"
              : "bg-muted-foreground/40 hover:bg-muted-foreground/70",
          )}
        />
      ))}
    </nav>
  );
}
