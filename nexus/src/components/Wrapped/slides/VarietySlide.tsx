import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";
import { CountUp } from "../CountUp";
import { ACCENT_FILL, Backdrop, GrowBar, SlideBody, eyebrowClass, headlineClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { formatNumber, percentDecimals, platformLabel, plural } from "../format";

/** Where you played (launchers by share of time) and how many titles were new to you. */
export function VarietySlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const platforms = report.platformBreakdown.slice(0, 6);
  const fresh = report.newTitlesInPeriod;

  const headline =
    platforms.length > 1
      ? `${report.platformBreakdown.length} launchers, one library`
      : platforms.length === 1
        ? `All in on ${platformLabel(platforms[0].source)}`
        : `${fresh} new ${plural(fresh, "adventure")}`;

  return (
    <>
      <Backdrop slide="variety" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          Variety
        </motion.p>
        <motion.h2 {...m.rise(1)} data-testid="wrapped-variety-headline" className={`mt-3 ${headlineClass}`}>
          {headline}
        </motion.h2>

        <div className="mt-10 grid max-w-5xl gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          {platforms.length > 0 && (
            <ul className="flex flex-col gap-4">
              {platforms.map((p, i) => (
                <motion.li key={p.source} {...m.rise(i + 2)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold text-white">{platformLabel(p.source)}</span>
                    <span className="text-sm tabular-nums text-white/85">{formatNumber(p.percent, percentDecimals(p.percent))}%</span>
                  </div>
                  <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-white/12">
                    <GrowBar axis="x" to={p.percent / 100} index={i + 2} color={i === 0 ? "white" : ACCENT_FILL} className="rounded-full" />
                  </div>
                </motion.li>
              ))}
            </ul>
          )}

          {fresh > 0 && (
            <motion.div {...m.pop(platforms.length + 2)} data-testid="wrapped-new-titles" className="rounded-3xl bg-white/[0.08] p-6">
              <Sparkles className="size-6 text-white/85" aria-hidden="true" />
              <p className="mt-3 text-[clamp(3rem,7vw,5rem)] font-extrabold leading-none tracking-[-0.04em] text-white">
                <CountUp value={fresh} delay={0.5} />
              </p>
              <p className="mt-2 text-lg font-semibold text-white">new {plural(fresh, "title")} started</p>
              {report.totalGamesPlayed > 0 && (
                <p className="mt-1 text-sm text-white/85">
                  {fresh} of the {report.totalGamesPlayed} {plural(report.totalGamesPlayed, "game")} you played {fresh === 1 ? "was" : "were"} brand new to you.
                </p>
              )}
            </motion.div>
          )}
        </div>
      </SlideBody>
    </>
  );
}
