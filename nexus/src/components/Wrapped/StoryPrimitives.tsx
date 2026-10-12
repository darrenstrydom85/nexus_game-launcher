/** Shared building blocks for Wrapped slides: mood backdrop, padded body, type styles. */
import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { StoryDirection, useStoryMotion } from "./storyMotion";
import { SLIDE_MOOD, type SlideId } from "./slideDefs";

/** Light accent for text and fills on the dark stage (the raw accent is too dark to read). */
export const ACCENT_INK = "color-mix(in oklab, var(--primary) 42%, white)";
export const ACCENT_FILL = "color-mix(in oklab, var(--primary) 70%, white)";

export const eyebrowClass = "text-[13px] font-semibold uppercase tracking-[0.16em] text-white/85";
export const headlineClass =
  "text-balance text-[clamp(2.25rem,5vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.035em] text-white";
export const bodyClass = "text-pretty text-base text-white/85 sm:text-lg";

function moodGradient(hues: [number, number]): string {
  const [a, b] = hues;
  return [
    "radial-gradient(42% 38% at 24% 30%, color-mix(in oklab, var(--primary) 52%, transparent), transparent 70%)",
    `radial-gradient(38% 42% at 76% 66%, oklch(0.5 0.19 ${a} / 0.45), transparent 70%)`,
    `radial-gradient(32% 30% at 62% 18%, oklch(0.46 0.16 ${b} / 0.38), transparent 70%)`,
    `radial-gradient(30% 34% at 18% 82%, oklch(0.42 0.15 ${b} / 0.3), transparent 70%)`,
  ].join(", ");
}

/** The slide's colour mood: layered radial gradients on an oversized layer that drifts slowly. */
export function Backdrop({ slide, dim = false, still = false }: { slide: SlideId; dim?: boolean; still?: boolean }) {
  const m = useStoryMotion();
  const mood = SLIDE_MOOD[slide];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -inset-[30%]"
        style={{ backgroundImage: moodGradient(mood.hues), opacity: dim ? 0.6 : 1 }}
        {...(still ? {} : m.drift(mood.drift))}
      />
      {/* Vignette keeps the edges deep so text contrast holds anywhere on the slide. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_95%_at_50%_45%,transparent_35%,rgb(6_5_12/0.7)_100%)]" />
    </div>
  );
}

/**
 * The slide's content column. Enters 24px from the side the user is moving
 * towards; with reduced motion it just appears with the slide's fade.
 */
export function SlideBody({
  className,
  children,
  align = "left",
}: {
  className?: string;
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  const direction = React.useContext(StoryDirection);
  const m = useStoryMotion();
  const enter = m.reduced
    ? {}
    : { initial: { x: 24 * direction }, animate: { x: 0 }, transition: { duration: 0.5, ease: EASE_OUT } };
  return (
    <motion.div {...enter} className="relative z-10 flex h-full w-full flex-col overflow-y-auto">
      {/* my-auto centres short slides and still lets a tall one scroll from its top. */}
      <div
        className={cn(
          "mx-auto my-auto flex w-full max-w-6xl flex-col px-6 pb-24 pt-28 sm:px-12 lg:px-16",
          align === "center" && "items-center text-center",
          className,
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}

/** A bar that grows (scale, never width/height) from its baseline to `to` of its track. */
export function GrowBar({
  axis,
  to,
  index,
  color,
  className,
}: {
  axis: "x" | "y";
  to: number;
  index: number;
  color: string;
  className?: string;
}) {
  const m = useStoryMotion();
  const { style, ...anim } = m.grow(axis, Math.max(0, Math.min(1, to)), index);
  return (
    <motion.div
      aria-hidden="true"
      {...anim}
      className={cn(axis === "x" ? "h-full w-full origin-left" : "h-full w-full origin-bottom", className)}
      style={{ ...style, background: color }}
    />
  );
}

/** Fallback art when a game has no cover: a soft two-tone gradient seeded by its name. */
export function nameGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `linear-gradient(140deg, oklch(0.45 0.14 ${h}), oklch(0.28 0.1 ${(h + 50) % 360}))`;
}

/** Cover art tile; falls back to a name gradient with the initial. */
export function CoverArt({ name, src, className }: { name: string; src: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-md bg-white/10 outline outline-1 -outline-offset-1 outline-white/10",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        <span
          className="flex size-full items-center justify-center text-lg font-bold text-white/85"
          style={{ background: nameGradient(name) }}
        >
          {(name[0] ?? "?").toUpperCase()}
        </span>
      )}
    </span>
  );
}
