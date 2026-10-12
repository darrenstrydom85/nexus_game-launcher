/**
 * Motion rules for the Wrapped story, in one place.
 *
 * Everything animates transform and opacity only. Entrances ease out over
 * 400-700ms with 80ms between elements; playful pop-ins are springs with
 * bounce 0.2. When motion is reduced (OS setting, or the app's own
 * "animations" / "reduced motion" settings) nothing moves at all: presets
 * return no animation and elements render in their final state.
 */
import * as React from "react";
import type { MotionProps, Transition } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useSettingsStore } from "@/stores/settingsStore";
import { EASE_OUT } from "@/lib/motion";

/** How long each slide stays up while autoplay runs. */
export const SLIDE_MS = 7000;
/** Gap between staggered elements. */
const STEP = 0.08;
/** First element waits for the slide's own fade to get going. */
const BASE = 0.12;

/** The single decision every Wrapped animation follows. */
export function useStoryReducedMotion(): boolean {
  const os = useReducedMotion();
  const appOff = useSettingsStore((s) => s.enableAnimations === false || s.reducedMotion === true);
  return Boolean(os) || appOff;
}

const ease = (delay: number, duration = 0.55): Transition => ({ duration, ease: EASE_OUT, delay });

export interface StoryMotion {
  reduced: boolean;
  /** Fade up 16px. `i` is the element's place in the stagger. */
  rise: (i: number) => MotionProps;
  /** Slide in sideways (covers, list rows). */
  slideIn: (i: number) => MotionProps;
  /** Springy scale-in for cards and badges. */
  pop: (i: number) => MotionProps;
  /** One word of kinetic type rising out of its line mask. */
  word: (i: number) => MotionProps;
  /** A bar growing from its baseline to `to` (0-1). Pass the result's style through. */
  grow: (axis: "x" | "y", to: number, i: number) => MotionProps & { style: React.CSSProperties };
  /** Slow endless drift for a background layer (only runs while mounted). */
  drift: (seconds: number) => MotionProps;
  /** Ken Burns pan-and-zoom for full-bleed art. */
  kenBurns: () => MotionProps;
}

export function makeStoryMotion(reduced: boolean): StoryMotion {
  if (reduced) {
    return {
      reduced,
      rise: () => ({}),
      slideIn: () => ({}),
      pop: () => ({}),
      word: () => ({}),
      grow: (axis, to) => ({ style: { transform: axis === "x" ? `scaleX(${to})` : `scaleY(${to})` } }),
      drift: () => ({}),
      kenBurns: () => ({}),
    };
  }
  return {
    reduced,
    rise: (i) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: ease(BASE + i * STEP) }),
    slideIn: (i) => ({ initial: { opacity: 0, x: -24 }, animate: { opacity: 1, x: 0 }, transition: ease(BASE + i * STEP) }),
    pop: (i) => ({
      initial: { opacity: 0, scale: 0.9, y: 10 },
      animate: { opacity: 1, scale: 1, y: 0 },
      transition: {
        default: { type: "spring", duration: 0.6, bounce: 0.2, delay: BASE + i * STEP },
        opacity: ease(BASE + i * STEP, 0.4),
      },
    }),
    word: (i) => ({ initial: { y: "110%" }, animate: { y: "0%" }, transition: ease(0.08 + i * STEP, 0.7) }),
    grow: (axis, to, i) => ({
      initial: axis === "x" ? { scaleX: 0 } : { scaleY: 0 },
      animate: axis === "x" ? { scaleX: to } : { scaleY: to },
      transition: ease(BASE + 0.1 + i * STEP, 0.7),
      style: {},
    }),
    drift: (seconds) => ({
      animate: {
        transform: [
          "translate3d(-3%, -2%, 0) rotate(0deg) scale(1)",
          "translate3d(4%, 3%, 0) rotate(10deg) scale(1.08)",
        ],
      },
      transition: { duration: seconds, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" },
    }),
    kenBurns: () => ({
      initial: { transform: "scale(1.06) translate3d(0, 0, 0)" },
      animate: { transform: "scale(1.16) translate3d(-2.5%, -2%, 0)" },
      transition: { duration: 22, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" },
    }),
  };
}

export function useStoryMotion(): StoryMotion {
  const reduced = useStoryReducedMotion();
  return React.useMemo(() => makeStoryMotion(reduced), [reduced]);
}

/** Navigation direction for the current slide's entrance (1 = forward). */
export const StoryDirection = React.createContext<1 | -1>(1);
