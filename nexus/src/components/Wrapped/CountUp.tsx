import * as React from "react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { formatNumber } from "./format";
import { useStoryReducedMotion } from "./storyMotion";

interface CountUpProps {
  value: number;
  decimals?: number;
  /** Seconds to wait before counting (lines the count up with its entrance). */
  delay?: number;
  className?: string;
}

/** Writes into the existing text node so React's copy of it stays the one on screen. */
function writeText(node: HTMLElement | null, text: string) {
  if (!node) return;
  const t = node.firstChild;
  if (t && t.nodeType === Node.TEXT_NODE) t.nodeValue = text;
  else node.textContent = text;
}

/**
 * A number that counts up from zero over 900ms (ease-out) on a motion value.
 * The final value is reserved for layout so nothing jitters, and is always
 * what assistive tech reads. With reduced motion it simply shows the final value.
 */
export function CountUp({ value, decimals = 0, delay = 0.2, className }: CountUpProps) {
  const reduced = useStoryReducedMotion();
  const final = formatNumber(value, decimals);
  const mv = useMotionValue(reduced ? value : 0);
  const ref = React.useRef<HTMLSpanElement>(null);

  useMotionValueEvent(mv, "change", (latest) => writeText(ref.current, formatNumber(latest, decimals)));

  React.useEffect(() => {
    if (reduced) {
      mv.set(value);
      writeText(ref.current, formatNumber(value, decimals));
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.9,
      ease: EASE_OUT,
      delay,
      onComplete: () => writeText(ref.current, formatNumber(value, decimals)),
    });
    return () => controls.stop();
  }, [mv, value, decimals, delay, reduced]);

  return (
    <span className={cn("relative inline-grid tabular-nums", className)}>
      {/* Holds the final width so the counting digits never shift the layout. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {final}
      </span>
      <span aria-hidden="true" ref={ref} data-countup className="col-start-1 row-start-1 text-right">
        {reduced ? final : formatNumber(0, decimals)}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
