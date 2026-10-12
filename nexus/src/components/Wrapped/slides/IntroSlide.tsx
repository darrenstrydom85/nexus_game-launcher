import { motion } from "motion/react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";
import { CountUp } from "../CountUp";
import { Backdrop, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { hoursOf, periodPhrase, plural } from "../format";

/** "Your month in games" in big kinetic type, then the period's total hours counting up. */
export function IntroSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const words = ["Your", ...periodPhrase(report.periodLabel).split(" "), "in", "games"];
  const hours = hoursOf(report.totalPlayTimeS);
  const after = 0.12 + words.length * 0.08; // the numbers land once the headline has
  const cmp = report.comparisonPreviousPeriod;

  return (
    <>
      <Backdrop slide="intro" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          {report.periodLabel} · Nexus Wrapped
        </motion.p>
        <h2
          data-testid="wrapped-intro-headline"
          className="mt-4 max-w-[14ch] text-[clamp(3rem,8.5vw,7.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em] text-white"
        >
          {words.map((w, i) => (
            <span key={`${w}-${i}`}>
              <span className="inline-block overflow-hidden pb-[0.1em] align-bottom">
                <motion.span {...m.word(i)} className="inline-block">
                  {w}
                </motion.span>
              </span>
              {i < words.length - 1 && " "}
            </span>
          ))}
        </h2>

        <motion.div {...m.rise(words.length + 1)} className="mt-10 flex flex-wrap items-end gap-x-10 gap-y-6">
          <p data-testid="wrapped-intro-hours" className="flex items-baseline gap-3">
            <CountUp
              value={hours.value}
              decimals={hours.decimals}
              delay={after}
              className="text-[clamp(3.5rem,9vw,7rem)] font-bold leading-none tracking-[-0.04em] text-white"
            />
            <span className="text-xl font-semibold text-white/85">{plural(Number(hours.value.toFixed(hours.decimals)), "hour")} played</span>
          </p>
          <dl className="flex gap-8 pb-2 text-white">
            <div>
              <dt className="text-sm text-white/80">Sessions</dt>
              <dd className="text-3xl font-bold">
                <CountUp value={report.totalSessions} delay={after + 0.1} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/80">Games played</dt>
              <dd className="text-3xl font-bold">
                <CountUp value={report.totalGamesPlayed} delay={after + 0.2} />
              </dd>
            </div>
          </dl>
        </motion.div>

        {cmp && (
          <motion.p
            {...m.rise(words.length + 2)}
            data-testid="wrapped-intro-comparison"
            className="mt-8 inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white"
          >
            {cmp.percentChange >= 0 ? (
              <TrendingUp className="size-4" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-4" aria-hidden="true" />
            )}
            {cmp.label}
          </motion.p>
        )}
      </SlideBody>
    </>
  );
}
