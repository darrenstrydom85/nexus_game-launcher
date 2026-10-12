import * as React from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

interface StoryProgressProps {
  titles: string[];
  index: number;
  /** 0-1 progress of the current slide while autoplay runs; null shows it full. */
  progress: MotionValue<number> | null;
  onJump: (index: number) => void;
}

/** The live segment: scaled by the autoplay motion value (freezes when autoplay pauses). */
function LiveFill({ progress }: { progress: MotionValue<number> }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const apply = (v: number) => {
    if (ref.current) ref.current.style.transform = `scaleX(${v})`;
  };
  useMotionValueEvent(progress, "change", apply);
  React.useLayoutEffect(() => apply(progress.get()));
  return <span ref={ref} data-testid="wrapped-progress-live" className="block h-full w-full origin-left bg-white" />;
}

/**
 * One segment per slide: visited ones full, the current one filling over the
 * autoplay duration (or full when autoplay is off). Segments are mouse
 * shortcuts; keyboard users have the arrow keys, Home and End.
 */
export function StoryProgress({ titles, index, progress, onJump }: StoryProgressProps) {
  return (
    <div data-testid="wrapped-progress" className="flex gap-1.5">
      {titles.map((title, i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          aria-label={`Go to slide ${i + 1}: ${title}`}
          aria-current={i === index ? "step" : undefined}
          data-state={i < index ? "done" : i === index ? "current" : "todo"}
          onClick={() => onJump(i)}
          className="group flex-1 py-2 focus-visible:outline-none"
        >
          <span className="block h-1 overflow-hidden rounded-full bg-white/25 transition-colors duration-150 group-hover:bg-white/40">
            {i < index && <span className="block h-full w-full bg-white" />}
            {i === index &&
              (progress ? <LiveFill progress={progress} /> : <span className="block h-full w-full bg-white" />)}
          </span>
        </button>
      ))}
    </div>
  );
}
